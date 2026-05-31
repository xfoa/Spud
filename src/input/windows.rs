use std::cell::RefCell;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, Sender as MpscSender};
use std::thread;
use std::time::{Duration, Instant};

use iced::futures::Stream;
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_RCONTROL,
    VK_RMENU, VK_RSHIFT, VK_RWIN, MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, ClipCursor, CreateWindowExW, DestroyWindow, GetCursorPos, GetMessageW,
    PeekMessageW, PostThreadMessageW, SetWindowsHookExW, ShowCursor,
    TranslateMessage, DispatchMessageW, UnhookWindowsHookEx,
    KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_HOTKEY,
    WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
    WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP,
    WM_SYSKEYDOWN, WM_XBUTTONDOWN, WM_XBUTTONUP, WHEEL_DELTA, HWND_MESSAGE,
    PM_NOREMOVE, WINDOW_EX_STYLE, WINDOW_STYLE,
};

use crate::input::InputEvent;
use crate::input::windows_keycodes::windows_vk_to_evdev;

pub fn listen(hotkey: String) -> impl Stream<Item = InputEvent> + Send + 'static {
    iced::stream::channel(256, move |mut output: iced::futures::channel::mpsc::Sender<InputEvent>| async move {
        let hotkey = hotkey.clone();
        thread::spawn(move || {
            let (tx, rx) = mpsc::channel::<InputEvent>();

            // Forward events from the synchronous hook thread to the async output.
            thread::spawn(move || {
                while let Ok(event) = rx.recv() {
                    match output.try_send(event) {
                        Ok(()) => {}
                        Err(e) if e.is_disconnected() => break,
                        Err(_) => {
                            // Channel full - drop event, keep running.
                        }
                    }
                }
                // Signal the hook thread to shut down when the stream is dropped.
                let tid = HOOK_THREAD_ID.load(Ordering::Relaxed);
                if tid != 0 {
                    unsafe {
                        let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
                    }
                }
            });

            if let Err(e) = run(&hotkey, tx) {
                eprintln!("[spud] Windows input backend stopped: {e}");
            }
        });
    })
}

/// Hotkey-only listener using RegisterHotKey (no LL hooks).
/// For window mode on Windows where iced events may not deliver the hotkey
/// in a windows_subsystem = "windows" app.
pub fn listen_hotkey(hotkey: String) -> impl Stream<Item = InputEvent> + Send + 'static {
    iced::stream::channel(256, move |mut output: iced::futures::channel::mpsc::Sender<InputEvent>| async move {
        let hotkey = hotkey.clone();
        thread::spawn(move || {
            let (tx, rx) = mpsc::channel::<InputEvent>();

            thread::spawn(move || {
                while let Ok(event) = rx.recv() {
                    match output.try_send(event) {
                        Ok(()) => {}
                        Err(e) if e.is_disconnected() => break,
                        Err(_) => {}
                    }
                }
                let tid = HOTKEY_THREAD_ID.load(Ordering::Relaxed);
                if tid != 0 {
                    unsafe {
                        let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
                    }
                }
            });

            if let Err(e) = run_hotkey_only(&hotkey, tx) {
                eprintln!("[spud] Windows hotkey monitor stopped: {e}");
            }
        });
    })
}

static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
static HOTKEY_THREAD_ID: AtomicU32 = AtomicU32::new(0);
static FIRST_KBD_HOOK: AtomicBool = AtomicBool::new(true);
static FIRST_MOUSE_HOOK: AtomicBool = AtomicBool::new(true);

thread_local! {
    static TX: RefCell<Option<MpscSender<InputEvent>>> = RefCell::new(None);
    static GRABBED: RefCell<bool> = RefCell::new(false);
    static LAST_POS: RefCell<POINT> = RefCell::new(POINT { x: 0, y: 0 });
    static HOTKEY_VK: RefCell<u16> = RefCell::new(0);
    static HOTKEY_MODS: RefCell<u16> = RefCell::new(0);
    static PRESSED_KEYS: RefCell<HashSet<u16>> = RefCell::new(HashSet::new());
    static LAST_TOGGLE: RefCell<Option<Instant>> = RefCell::new(None);
}

fn set_tx(tx: MpscSender<InputEvent>) {
    TX.with(|t| *t.borrow_mut() = Some(tx));
}

fn send_event(event: InputEvent) {
    TX.with(|t| {
        if let Some(ref tx) = *t.borrow() {
            let _ = tx.send(event);
        }
    });
}

fn is_grabbed() -> bool {
    GRABBED.with(|g| *g.borrow())
}

fn set_grabbed(v: bool) {
    GRABBED.with(|g| *g.borrow_mut() = v);
}

fn last_pos() -> POINT {
    LAST_POS.with(|p| *p.borrow())
}

fn set_last_pos(p: POINT) {
    LAST_POS.with(|lp| *lp.borrow_mut() = p);
}

fn hotkey_vk() -> u16 {
    HOTKEY_VK.with(|h| *h.borrow())
}

fn set_hotkey_vk(vk: u16) {
    HOTKEY_VK.with(|h| *h.borrow_mut() = vk);
}

fn hotkey_mods() -> u16 {
    HOTKEY_MODS.with(|h| *h.borrow())
}

fn set_hotkey_mods(mods: u16) {
    HOTKEY_MODS.with(|h| *h.borrow_mut() = mods);
}

fn can_toggle() -> bool {
    LAST_TOGGLE.with(|t| {
        let mut last = t.borrow_mut();
        let now = Instant::now();
        if let Some(prev) = *last {
            if now.duration_since(prev) < Duration::from_millis(50) {
                return false;
            }
        }
        *last = Some(now);
        true
    })
}

fn run(
    hotkey: &str,
    tx: MpscSender<InputEvent>,
) -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("[spud] Windows input backend starting, hotkey={hotkey}");
    let (hotkey_vk, hotkey_mods) = parse_hotkey(hotkey)?;
    eprintln!("[spud] Parsed hotkey: vk=0x{hotkey_vk:04X}, mods={hotkey_mods:04b}");
    set_hotkey_vk(hotkey_vk);
    set_hotkey_mods(hotkey_mods);
    set_tx(tx);

    HOOK_THREAD_ID.store(unsafe { windows::Win32::System::Threading::GetCurrentThreadId() }, Ordering::Relaxed);

    let hmod = unsafe { windows::Win32::System::LibraryLoader::GetModuleHandleW(None)? };
    let hinstance = windows::Win32::Foundation::HINSTANCE(hmod.0);
    
    // Force creation of a message queue before installing hooks.
    // Without this, SetWindowsHookEx may not dispatch callbacks correctly.
    unsafe {
        let mut dummy: MSG = std::mem::zeroed();
        let _ = PeekMessageW(&mut dummy, None, 0, 0, PM_NOREMOVE);
    }

    let kbd_hook = unsafe {
        SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            Some(hinstance),
            0,
        )?
    };
    eprintln!("[spud] Keyboard hook installed");

    let mouse_hook = unsafe {
        SetWindowsHookExW(
            WH_MOUSE_LL,
            Some(mouse_hook_proc),
            Some(hinstance),
            0,
        )?
    };
    eprintln!("[spud] Mouse hook installed");

    // Create a message-only window and register the hotkey as a fallback
    // toggle mechanism. The LL hook can fail when our own window has focus
    // (console/GUI subsystem interaction), but RegisterHotKey is reliable.
    let hotkey_hwnd = unsafe {
        match CreateWindowExW(
            WINDOW_EX_STYLE(0),
            windows::core::w!("Static"),
            windows::core::w!("SpudHotkey"),
            WINDOW_STYLE(0),
            0, 0, 0, 0,
            Some(HWND_MESSAGE),
            None,
            Some(hinstance),
            None,
        ) {
            Ok(hwnd) => {
                let result = RegisterHotKey(Some(hwnd), 1, HOT_KEY_MODIFIERS(hotkey_mods as u32), hotkey_vk as u32);
                if result.is_err() {
                    eprintln!("[spud] RegisterHotKey failed, relying on LL hook for toggle");
                    let _ = DestroyWindow(hwnd);
                    None
                } else {
                    eprintln!("[spud] RegisterHotKey active for toggle");
                    Some(hwnd)
                }
            }
            Err(_) => {
                eprintln!("[spud] Failed to create message-only window for hotkey");
                None
            }
        }
    };

    eprintln!("[spud] Message pump starting");
    let mut msg: MSG = unsafe { std::mem::zeroed() };
    loop {
        let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
        if ret.0 > 0 {
            if msg.message == WM_HOTKEY {
                if can_toggle() {
                    let new_grabbed = !is_grabbed();
                    set_grabbed(new_grabbed);
                    if new_grabbed {
                        unsafe {
                            let _ = ShowCursor(false);
                            let _ = ClipCursor(None);
                        }
                        if let Ok(pos) = get_cursor_pos() {
                            set_last_pos(pos);
                        }
                    } else {
                        unsafe {
                            let _ = ShowCursor(true);
                            let _ = ClipCursor(None);
                        }
                    }
                    eprintln!("[spud] Hotkey toggled via RegisterHotKey, grabbed={new_grabbed}");
                    send_event(InputEvent::HotkeyToggled { grabbed: new_grabbed });
                }
            } else {
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        } else if ret.0 == 0 {
            eprintln!("[spud] Message pump exiting (WM_QUIT)");
            break;
        } else {
            eprintln!("[spud] Message pump error: GetMessageW failed");
            break;
        }
    }

    unsafe {
        if let Some(hwnd) = hotkey_hwnd {
            let _ = UnregisterHotKey(Some(hwnd), 1);
            let _ = DestroyWindow(hwnd);
        }
        let _ = UnhookWindowsHookEx(kbd_hook);
        let _ = UnhookWindowsHookEx(mouse_hook);
    }

    // Restore cursor on exit.
    if is_grabbed() {
        unsafe {
            let _ = ShowCursor(true);
            let _ = ClipCursor(None);
        }
    }

    HOOK_THREAD_ID.store(0, Ordering::Relaxed);
    Ok(())
}

fn run_hotkey_only(
    hotkey: &str,
    tx: MpscSender<InputEvent>,
) -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("[spud] Windows hotkey monitor starting, hotkey={hotkey}");
    let (hotkey_vk, hotkey_mods) = parse_hotkey(hotkey)?;
    eprintln!("[spud] Parsed hotkey: vk=0x{hotkey_vk:04X}, mods={hotkey_mods:04b}");
    set_hotkey_vk(hotkey_vk);
    set_hotkey_mods(hotkey_mods);
    set_tx(tx);

    HOTKEY_THREAD_ID.store(
        unsafe { windows::Win32::System::Threading::GetCurrentThreadId() },
        Ordering::Relaxed,
    );

    let hmod = unsafe { windows::Win32::System::LibraryLoader::GetModuleHandleW(None)? };
    let hinstance = windows::Win32::Foundation::HINSTANCE(hmod.0);

    // Force creation of a message queue.
    unsafe {
        let mut dummy: MSG = std::mem::zeroed();
        let _ = PeekMessageW(&mut dummy, None, 0, 0, PM_NOREMOVE);
    }

    // Create message-only window and register hotkey.
    let hotkey_hwnd = unsafe {
        match CreateWindowExW(
            WINDOW_EX_STYLE(0),
            windows::core::w!("Static"),
            windows::core::w!("SpudHotkey"),
            WINDOW_STYLE(0),
            0, 0, 0, 0,
            Some(HWND_MESSAGE),
            None,
            Some(hinstance),
            None,
        ) {
            Ok(hwnd) => {
                let result = RegisterHotKey(
                    Some(hwnd),
                    1,
                    HOT_KEY_MODIFIERS(hotkey_mods as u32),
                    hotkey_vk as u32,
                );
                if result.is_err() {
                    eprintln!("[spud] RegisterHotKey failed");
                    let _ = DestroyWindow(hwnd);
                    None
                } else {
                    eprintln!("[spud] RegisterHotKey active");
                    Some(hwnd)
                }
            }
            Err(_) => {
                eprintln!("[spud] Failed to create message-only window for hotkey");
                None
            }
        }
    };

    let mut msg: MSG = unsafe { std::mem::zeroed() };
    loop {
        let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
        if ret.0 > 0 {
            if msg.message == WM_HOTKEY {
                if can_toggle() {
                    let new_grabbed = !is_grabbed();
                    set_grabbed(new_grabbed);
                    eprintln!("[spud] Hotkey toggled via RegisterHotKey, grabbed={new_grabbed}");
                    send_event(InputEvent::HotkeyToggled { grabbed: new_grabbed });
                }
            } else {
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        } else if ret.0 == 0 {
            break;
        } else {
            break;
        }
    }

    unsafe {
        if let Some(hwnd) = hotkey_hwnd {
            let _ = UnregisterHotKey(Some(hwnd), 1);
            let _ = DestroyWindow(hwnd);
        }
    }

    HOTKEY_THREAD_ID.store(0, Ordering::Relaxed);
    Ok(())
}

unsafe extern "system" fn keyboard_hook_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if FIRST_KBD_HOOK.swap(false, Ordering::Relaxed) {
        eprintln!("[spud] First keyboard hook event received");
    }
    if n_code < 0 {
        return unsafe { CallNextHookEx(None, n_code, w_param, l_param) };
    }

    let info = unsafe { *(l_param.0 as *const KBDLLHOOKSTRUCT) };
    let vk = info.vkCode as u16;
    let down = matches!(
        w_param.0 as u32,
        WM_KEYDOWN | WM_SYSKEYDOWN
    );

    if down {
        let is_repeat = !PRESSED_KEYS.with(|p| p.borrow_mut().insert(vk));
        if is_repeat && !is_grabbed() {
            return unsafe { CallNextHookEx(None, n_code, w_param, l_param) };
        }

        // Hotkey detection only on genuine keydown (ignore auto-repeat).
        if !is_repeat {
            let mods = current_modifiers();
            if vk == hotkey_vk() && mods == hotkey_mods() {
                if can_toggle() {
                    let new_grabbed = !is_grabbed();
                    set_grabbed(new_grabbed);

                    if new_grabbed {
                        unsafe {
                            let _ = ShowCursor(false);
                            let _ = ClipCursor(None);
                        }
                        if let Ok(pos) = get_cursor_pos() {
                            set_last_pos(pos);
                        }
                    } else {
                        unsafe {
                            let _ = ShowCursor(true);
                            let _ = ClipCursor(None);
                        }
                    }

                    send_event(InputEvent::HotkeyToggled { grabbed: new_grabbed });
                }
                return LRESULT(1); // Consume the hotkey event.
            }
        }

        if !is_grabbed() {
            return unsafe { CallNextHookEx(None, n_code, w_param, l_param) };
        }

        // While grabbed, translate and consume keyboard events.
        // Skip auto-repeat keydowns.
        if !is_repeat {
            if let Some(evdev) = windows_vk_to_evdev(vk) {
                let event = InputEvent::KeyPress { keycode: evdev as u8 };
                send_event(event);
            }
        }
    } else {
        PRESSED_KEYS.with(|p| { p.borrow_mut().remove(&vk); });

        if !is_grabbed() {
            return unsafe { CallNextHookEx(None, n_code, w_param, l_param) };
        }

        // While grabbed, translate and consume keyboard events.
        if let Some(evdev) = windows_vk_to_evdev(vk) {
            let event = InputEvent::KeyRelease { keycode: evdev as u8 };
            send_event(event);
        }
    }

    LRESULT(1) // Consume event so it doesn't reach local apps.
}

unsafe extern "system" fn mouse_hook_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if FIRST_MOUSE_HOOK.swap(false, Ordering::Relaxed) {
        eprintln!("[spud] First mouse hook event received");
    }
    if n_code < 0 {
        return unsafe { CallNextHookEx(None, n_code, w_param, l_param) };
    }

    if !is_grabbed() {
        return unsafe { CallNextHookEx(None, n_code, w_param, l_param) };
    }

    let msg = w_param.0 as u32;
    let info = unsafe { *(l_param.0 as *const MSLLHOOKSTRUCT) };

    match msg {
        WM_MOUSEMOVE => {
            let prev = last_pos();
            let dx = (info.pt.x - prev.x) as i16;
            let dy = (info.pt.y - prev.y) as i16;
            set_last_pos(info.pt);
            if dx != 0 || dy != 0 {
                send_event(InputEvent::MouseMove { dx, dy });
            }
        }
        WM_LBUTTONDOWN => {
            send_event(InputEvent::MouseButton { button: 1, pressed: true });
        }
        WM_LBUTTONUP => {
            send_event(InputEvent::MouseButton { button: 1, pressed: false });
        }
        WM_RBUTTONDOWN => {
            send_event(InputEvent::MouseButton { button: 3, pressed: true });
        }
        WM_RBUTTONUP => {
            send_event(InputEvent::MouseButton { button: 3, pressed: false });
        }
        WM_MBUTTONDOWN => {
            send_event(InputEvent::MouseButton { button: 2, pressed: true });
        }
        WM_MBUTTONUP => {
            send_event(InputEvent::MouseButton { button: 2, pressed: false });
        }
        WM_XBUTTONDOWN => {
            let btn = ((info.mouseData >> 16) & 0xFFFF) as u8;
            let wire = if btn == 1 { 8 } else { 9 };
            send_event(InputEvent::MouseButton { button: wire, pressed: true });
        }
        WM_XBUTTONUP => {
            let btn = ((info.mouseData >> 16) & 0xFFFF) as u8;
            let wire = if btn == 1 { 8 } else { 9 };
            send_event(InputEvent::MouseButton { button: wire, pressed: false });
        }
        WM_MOUSEWHEEL => {
            let delta = (info.mouseData >> 16) as i16;
            let dy = (delta / (WHEEL_DELTA as i16)) as i8;
            send_event(InputEvent::Wheel { dx: 0, dy });
        }
        _ => {}
    }

    LRESULT(1) // Consume event so it doesn't reach local apps.
}

fn current_modifiers() -> u16 {
    let mut mods = 0u16;
    unsafe {
        if GetAsyncKeyState(VK_LSHIFT.0 as i32) < 0 || GetAsyncKeyState(VK_RSHIFT.0 as i32) < 0 {
            mods |= MOD_SHIFT.0 as u16;
        }
        if GetAsyncKeyState(VK_LCONTROL.0 as i32) < 0 || GetAsyncKeyState(VK_RCONTROL.0 as i32) < 0 {
            mods |= MOD_CONTROL.0 as u16;
        }
        if GetAsyncKeyState(VK_LMENU.0 as i32) < 0 || GetAsyncKeyState(VK_RMENU.0 as i32) < 0 {
            mods |= MOD_ALT.0 as u16;
        }
        if GetAsyncKeyState(VK_LWIN.0 as i32) < 0 || GetAsyncKeyState(VK_RWIN.0 as i32) < 0 {
            mods |= MOD_WIN.0 as u16;
        }
    }
    mods
}

fn get_cursor_pos() -> Result<POINT, ()> {
    let mut pt = POINT { x: 0, y: 0 };
    unsafe {
        if GetCursorPos(&mut pt).is_ok() {
            Ok(pt)
        } else {
            Err(())
        }
    }
}

fn parse_hotkey(hotkey: &str) -> Result<(u16, u16), String> {
    let mut mods = 0u16;
    let mut key_label: Option<&str> = None;

    for part in hotkey.split('+').map(|p| p.trim()) {
        match part {
            "Ctrl" => mods |= MOD_CONTROL.0 as u16,
            "Alt" => mods |= MOD_ALT.0 as u16,
            "Shift" => mods |= MOD_SHIFT.0 as u16,
            "Super" | "Meta" | "Win" | "Command" | "Cmd" => mods |= MOD_WIN.0 as u16,
            other => {
                if key_label.is_some() {
                    return Err(format!("multiple non-modifier keys in '{hotkey}'"));
                }
                key_label = Some(other);
            }
        }
    }

    let label = key_label.ok_or_else(|| "no non-modifier key in hotkey".to_string())?;
    let evdev = crate::input::key_names::parse_key_name(label)
        .ok_or_else(|| format!("unsupported key '{label}'"))?;
    let vk = crate::input::windows_keycodes::evdev_to_windows_vk(evdev)
        .ok_or_else(|| format!("no Windows VK for key '{label}'"))?;

    Ok((vk, mods))
}
