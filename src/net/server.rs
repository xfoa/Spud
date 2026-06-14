use std::io;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use zeroize::Zeroize;

use aes_gcm::aead::KeyInit;
use aes_gcm::Aes256Gcm;
use iced::futures::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpSocket, TcpStream, UdpSocket};
use tokio_rustls::TlsAcceptor;
use tokio_util::codec::{Framed, LengthDelimitedCodec};
use tokio_util::sync::CancellationToken;

#[cfg(target_os = "linux")]
use crate::input::InputInjector;
use crate::net::protocol::ControlMsg;
use crate::net::tls::build_server_config;
use crate::session::{generate_session, SessionState, SessionTable};

pub struct ServerListener {
    shutdown: Arc<tokio::sync::Notify>,
    handle: tokio::task::JoinHandle<()>,
    cancel: CancellationToken,
    #[cfg(target_os = "linux")]
    helper_cancel: Option<Arc<std::sync::atomic::AtomicBool>>,
}

impl ServerListener {
    pub async fn bind(
        addr: &str,
        port: u16,
        key_timeout_ms: u16,
        require_auth: bool,
        passphrase_hash: String,
        encrypt_udp: bool,
        batch_history_multiplier: u8,
    ) -> io::Result<Self> {
        let (cert, key) = crate::cert::load_or_generate_certs()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
        let config = build_server_config(cert, key);
        let acceptor = TlsAcceptor::from(config);

        let tcp_socket = TcpSocket::new_v4()?;
        tcp_socket.set_reuseaddr(true)?;
        let tcp_addr = std::net::SocketAddr::new(
            addr.parse().map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?,
            port,
        );
        tcp_socket.bind(tcp_addr)?;
        let tcp = tcp_socket.listen(128)?;

        let ip: std::net::IpAddr = addr.parse().map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;
        let bind_addr = SocketAddr::new(ip, port);
        let udp = crate::net::create_udp_socket(bind_addr, None).await?;

        let shutdown = Arc::new(tokio::sync::Notify::new());
        let sessions: Arc<SessionTable> = Arc::new(SessionTable::new());
        let (screen_width, screen_height) = get_screen_size();

        #[cfg(target_os = "linux")]
        let helper_cancel: Arc<std::sync::atomic::AtomicBool> = Arc::new(std::sync::atomic::AtomicBool::new(false));

        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        let injector: Arc<OnceLock<crate::input::InputInjector>> = Arc::new(OnceLock::new());
        #[cfg(target_os = "linux")]
        {
            match try_direct_injector(screen_width, screen_height) {
                Some(inj) => {
                    let _ = injector.set(inj);
                }
                None => {
                    eprintln!("[spud] Permission denied opening /dev/uinput. Starting privileged helper...");
                    let slot = injector.clone();
                    let cancel = helper_cancel.clone();
                    let _ = spawn_helper_injector(screen_width, screen_height, slot, cancel);
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            match crate::input::InputInjector::new(screen_width, screen_height) {
                Ok(inj) => {
                    let _ = injector.set(inj);
                }
                Err(e) => {
                    eprintln!("[spud] Failed to create macOS input injector: {e}");
                }
            }
        }
        #[cfg(target_os = "windows")]
        {
            match crate::input::InputInjector::new(screen_width, screen_height) {
                Ok(inj) => {
                    let _ = injector.set(inj);
                }
                Err(e) => {
                    eprintln!("[spud] Failed to create Windows input injector: {e}");
                }
            }
        }

        let s = shutdown.clone();
        let cancel = CancellationToken::new();
        let c = cancel.clone();
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        let handle = tokio::spawn(run_server(tcp, udp, acceptor, s, require_auth, passphrase_hash, encrypt_udp, key_timeout_ms, sessions, screen_width, screen_height, injector, c, batch_history_multiplier));
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        let handle = tokio::spawn(run_server(tcp, udp, acceptor, s, require_auth, passphrase_hash, encrypt_udp, key_timeout_ms, sessions, screen_width, screen_height, c, batch_history_multiplier));

        Ok(Self {
            shutdown,
            handle,
            cancel,
            #[cfg(target_os = "linux")]
            helper_cancel: Some(helper_cancel),
        })
    }
}

impl Drop for ServerListener {
    fn drop(&mut self) {
        #[cfg(target_os = "linux")]
        if let Some(ref cancel) = self.helper_cancel {
            cancel.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        self.cancel.cancel();
        self.shutdown.notify_waiters();
        self.handle.abort();
        // The tokio task will be dropped on the next runtime tick.
        // We must not block here because this Drop may run on the tokio
        // runtime thread, which would prevent the task from being polled
        // and dropped.
    }
}

fn get_screen_size() -> (u16, u16) {
    #[cfg(target_os = "linux")]
    {
        use x11rb::connection::Connection;
        use x11rb::rust_connection::RustConnection;
        if let Ok((conn, screen_num)) = RustConnection::connect(None) {
            if let Some(screen) = conn.setup().roots.get(screen_num) {
                return (screen.width_in_pixels, screen.height_in_pixels);
            }
        }
        return (1920, 1080);
    }
    #[cfg(target_os = "macos")]
    {
        use core_graphics::display::CGDisplay;
        let main = CGDisplay::main();
        let bounds = main.bounds();
        return (bounds.size.width as u16, bounds.size.height as u16);
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        return (1920, 1080);
    }
}

#[cfg(target_os = "linux")]
fn try_direct_injector(screen_width: u16, screen_height: u16) -> Option<InputInjector> {
    match crate::input::InputInjector::new(screen_width, screen_height) {
        Ok(inj) => Some(inj),
        Err(e) => {
            eprintln!("[spud] Failed to create input injector: {e}");
            None
        }
    }
}

#[cfg(target_os = "linux")]
fn spawn_helper_injector(
    screen_width: u16,
    screen_height: u16,
    slot: Arc<OnceLock<crate::input::InputInjector>>,
    cancel: Arc<std::sync::atomic::AtomicBool>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let socket_path = format!("/tmp/spud-input-{}.sock", std::process::id());
        let exe = std::env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("spud"));
        let exe_str = exe.to_string_lossy();
        let mut child = match std::process::Command::new("pkexec")
            .arg(&*exe_str)
            .arg("injection-helper")
            .arg(&socket_path)
            .arg(screen_width.to_string())
            .arg(screen_height.to_string())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[spud] Failed to spawn pkexec helper: {e}");
                return;
            }
        };

        let start = std::time::Instant::now();
        loop {
            if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.try_wait();
                return;
            }

            if let Ok(Some(status)) = child.try_wait() {
                eprintln!("[spud] Helper exited early with status: {status}");
                break;
            }

            if std::path::Path::new(&socket_path).exists() {
                match crate::input::InputInjector::new_ipc(&socket_path) {
                    Ok(mut inj) => {
                        inj.helper = Some(child);
                        eprintln!("[spud] Input injector created via privileged helper.");
                        if let Err(_) = slot.set(inj) {
                            eprintln!("[spud] Warning: injector slot already initialized");
                        }
                        return;
                    }
                    Err(e) => {
                        eprintln!("[spud] new_ipc retry failed: {e}");
                    }
                }
            }

            let elapsed = start.elapsed().as_secs();
            if elapsed > 0 && elapsed % 5 == 0 {
                eprintln!("[spud] Still waiting for privileged helper... ({elapsed}s elapsed)");
            }

            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        eprintln!("[spud] Failed to connect to helper.");
        let _ = child.kill();
        let _ = child.try_wait();
        eprintln!("[spud] Input events will be logged only, not injected.");
    })
}

async fn run_server(
    tcp: TcpListener,
    udp: UdpSocket,
    acceptor: TlsAcceptor,
    shutdown: Arc<tokio::sync::Notify>,
    require_auth: bool,
    passphrase_hash: String,
    encrypt_udp: bool,
    key_timeout_ms: u16,
    sessions: Arc<SessionTable>,
    screen_width: u16,
    screen_height: u16,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    injector: Arc<OnceLock<crate::input::InputInjector>>,
    cancel: CancellationToken,
    batch_history_multiplier: u8,
) {
    let mut buf = vec![0u8; 2048];
    let mut sweep_interval = tokio::time::interval(Duration::from_millis(200));
    loop {
        tokio::select! {
            _ = shutdown.notified() => break,
            result = tcp.accept() => {
                match result {
                    Ok((stream, peer)) => {
                        let acceptor = acceptor.clone();
                        let sessions = sessions.clone();
                        let hash = passphrase_hash.clone();
                        let child_cancel = cancel.child_token();
                        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                        let inj = injector.clone();
                        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
                        let inj: Option<()> = None;
                        tokio::spawn(handle_client(
                            stream, peer, acceptor, sessions, require_auth, hash, encrypt_udp, key_timeout_ms, child_cancel, screen_width, screen_height, batch_history_multiplier, inj,
                        ));
                    }
                    Err(e) => {
                        eprintln!("[spud] tcp accept: {e}");
                    }
                }
            }
            _ = sweep_interval.tick() => {
                for mut session in sessions.iter_mut() {
                    let actions = session.tracker.sweep();
                    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                    if let Some(inj) = injector.get() {
                        for action in &actions {
                            inj.inject_action(action);
                        }
                    }
                }
            }
            result = udp.recv_from(&mut buf) => {
                match result {
                    Ok((n, src)) => {
                        if n < 8 {
                            continue;
                        }
                        let conn_id = u64::from_le_bytes(buf[..8].try_into().unwrap());
                        let payload = &buf[8..n];

                        let mut should_remove = false;
                        if let Some(mut session) = sessions.get_mut(&conn_id) {
                            session.last_activity = std::time::Instant::now();
                            session.src_addr = src;

                            let mut decrypted: Option<Vec<u8>> = None;
                            let mut decrypt_failed = false;

                            if session.encrypt {
                                if n >= 16 + 16 {
                                    let seq = u64::from_le_bytes(buf[8..16].try_into().unwrap());
                                    if !session.replay_window.is_valid(seq) {
                                        eprintln!("[spud] UDP replay/duplicate seq {seq} for conn {conn_id}, dropping");
                                    } else if let Some(ref keys) = session.keys {
                                        let nonce_ct = &buf[16..n];
                                        let cipher = Aes256Gcm::new_from_slice(&keys.server_read).unwrap();
                                        decrypted = crate::crypto::decrypt_event(&cipher, seq, nonce_ct);
                                        if decrypted.is_none() {
                                            decrypt_failed = true;
                                        }
                                    } else {
                                        eprintln!("[spud] encrypted session missing keys, dropping");
                                        decrypt_failed = true;
                                    }
                                } else {
                                    eprintln!("[spud] UDP packet too short for encryption, dropping");
                                    decrypt_failed = true;
                                }
                            }

                            let pt: &[u8] = match decrypted.as_ref() {
                                Some(v) => v.as_slice(),
                                None if !session.encrypt => payload,
                                None => &[],
                            };

                            if decrypted.is_some() || !session.encrypt {
                                session.record_decrypt_success();
                                let is_localhost = src.ip().is_loopback();
                                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                                let inj = injector.get().map(|i| i as &dyn crate::net::server_batch::Injector);
                                #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
                                let inj: Option<&dyn crate::net::server_batch::Injector> = None;
                                crate::net::server_batch::apply_batches(pt, &mut session, inj, is_localhost);
                            } else if decrypt_failed {
                                should_remove = session.record_decrypt_failure();
                                if should_remove {
                                    eprintln!("[spud] UDP too many failed decrypts for conn {conn_id}, removing session");
                                }
                            }
                        }
                        else {
                            eprintln!("[spud] UDP event for unknown session {conn_id}");
                        }
                        if should_remove {
                            sessions.remove(&conn_id);
                        }
                    }
                    Err(e) => {
                        eprintln!("[spud] udp recv: {e}");
                    }
                }
            }
        }
    }
    cancel.cancel();
}

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
type InjectorArc = Arc<OnceLock<crate::input::InputInjector>>;
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
type InjectorArc = ();

async fn handle_client(
    stream: TcpStream,
    peer: SocketAddr,
    acceptor: TlsAcceptor,
    sessions: Arc<SessionTable>,
    require_auth: bool,
    passphrase_hash: String,
    encrypt_udp: bool,
    key_timeout_ms: u16,
    cancel: CancellationToken,
    screen_width: u16,
    screen_height: u16,
    batch_history_multiplier: u8,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    injector: InjectorArc,
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    _injector: InjectorArc,
) {
    let _ = stream.set_nodelay(true);
    let tls = match acceptor.accept(stream).await {
        Ok(tls) => tls,
        Err(e) => {
            eprintln!("[spud] tls accept: {e}");
            return;
        }
    };

    // Derive UDP keys from TLS exporter before consuming tls in framed
    let keys = {
        let (_, conn) = tls.get_ref();
        let mut exported = [0u8; 64];
        match conn.export_keying_material(&mut exported, b"spud/udp/keys/v1", Some(b"")) {
            Ok(_) => {
                let udp_keys = crate::crypto::derive_udp_keys(&exported);
                exported.zeroize();
                Some(crate::session::SessionKeys {
                    server_read: udp_keys.client_write,
                    server_write: udp_keys.server_write,
                })
            }
            Err(e) => {
                eprintln!("[spud] TLS key export failed: {e}");
                None
            }
        }
    };

    let mut framed = Framed::new(tls, LengthDelimitedCodec::new());

    // Auth challenge-response
    if require_auth && !passphrase_hash.is_empty() {
        let challenge = crate::net::auth::generate_challenge();
        let salt = crate::config::extract_salt(&passphrase_hash)
            .and_then(|s| crate::config::decode_salt_bytes(&s))
            .unwrap_or([0u8; 16]);
        let challenge_msg = ControlMsg::AuthChallenge { nonce: challenge, salt };
        let bytes = match postcard::to_allocvec(&challenge_msg) {
            Ok(b) => b,
            Err(_) => return,
        };
        if framed.send(bytes.into()).await.is_err() {
            return;
        }

        let response = match tokio::time::timeout(Duration::from_secs(10), framed.next()).await {
            Ok(Some(Ok(frame))) => frame,
            _ => return,
        };
        let auth_ok = match postcard::from_bytes::<ControlMsg>(&response) {
            Ok(ControlMsg::AuthResponse { hmac }) => {
                let ok = crate::net::auth::server_verify_response(&passphrase_hash, &challenge, &hmac);
                if !ok {
                    eprintln!("[spud] auth failed for {peer}: response mismatch");
                }
                ok
            }
            Ok(_) => {
                eprintln!("[spud] auth failed for {peer}: expected AuthResponse, got other message");
                false
            }
            Err(e) => {
                eprintln!("[spud] auth failed for {peer}: failed to parse response: {e}");
                false
            }
        };

        let result_msg = ControlMsg::AuthResult { ok: auth_ok };
        let bytes = match postcard::to_allocvec(&result_msg) {
            Ok(b) => b,
            Err(_) => return,
        };
        let _ = framed.send(bytes.into()).await;
        if !auth_ok {
            return;
        }
    }

    let (uuid, conn_id) = generate_session();
    let session = SessionState::new(encrypt_udp, keys, peer, key_timeout_ms, screen_width, screen_height);
    eprintln!("[server] new session conn={conn_id} from {peer}");
    sessions.insert(conn_id, session);

    let init = ControlMsg::SessionInit { conn_id, uuid, encrypt: encrypt_udp, auth: require_auth && !passphrase_hash.is_empty(), screen_width, screen_height };
    let bytes = match postcard::to_allocvec(&init) {
        Ok(b) => b,
        Err(_) => {
            sessions.remove(&conn_id);
            return;
        }
    };
    if framed.send(bytes.into()).await.is_err() {
        sessions.remove(&conn_id);
        return;
    }

    // Keep TLS alive until disconnect
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            msg = framed.next() => {
                match msg {
                    Some(Ok(bytes)) => {
                        if let Ok(msg) = postcard::from_bytes::<ControlMsg>(&bytes) {
                            match msg {
                                ControlMsg::Keepalive => {
                                    if let Some(mut s) = sessions.get_mut(&conn_id) {
                                        s.last_activity = std::time::Instant::now();
                                    }
                                }
                                ControlMsg::SetCaptureMode { window_mode } => {
                                    if let Some(mut s) = sessions.get_mut(&conn_id) {
                                        s.window_mode = window_mode;
                                        println!("[server] conn {conn_id} capture mode: {}", if window_mode { "window" } else { "fullscreen" });
                                    }
                                }
                                ControlMsg::SetBatchConfig { max_batch, batch_redundancy } => {
                                    if let Some(mut s) = sessions.get_mut(&conn_id) {
                                        let capacity = (max_batch as usize * batch_redundancy as usize * batch_history_multiplier as usize)
                                            .max(crate::session::SessionState::MIN_MOUSE_HISTORY_CAPACITY);
                                        s.mouse_history.resize(capacity);
                                        println!("[server] conn {conn_id} batch config: max_batch={max_batch} redundancy={batch_redundancy} history_capacity={capacity}");
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => break,
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(60)) => {
                // Session timeout check
                let now = std::time::Instant::now();
                if let Some(s) = sessions.get(&conn_id) {
                    if now.duration_since(s.last_activity) > Duration::from_secs(300) {
                        break;
                    }
                }
            }
        }
    }

    eprintln!("[server] session removed conn={conn_id}");
    if let Some(mut session) = sessions.get_mut(&conn_id) {
        let actions = session.tracker.release_all();
        if !actions.is_empty() {
            eprintln!("[server] releasing {} stuck keys/buttons for conn={conn_id}", actions.len());
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        if let Some(inj) = injector.get() {
            for action in &actions {
                eprintln!("[server] inject cleanup: {action}");
                inj.inject_action(action);
            }
        }
    }
    sessions.remove(&conn_id);
}

