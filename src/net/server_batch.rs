#[cfg(test)]
use std::sync::Mutex;

use crate::net::Event;
use crate::session::SessionState;

/// Platform-agnostic interface for injecting events on the server.
/// Used to keep UDP receive logic testable without a real input backend.
pub trait Injector {
    fn move_rel(&self, dx: i32, dy: i32);
    fn move_abs(&self, x: i32, y: i32);
    fn key_down(&self, code: u16);
    fn key_up(&self, code: u16);
    fn button_down(&self, code: u16);
    fn button_up(&self, code: u16);
    fn wheel(&self, dx: i8, dy: i8);
    fn inject_action(&self, action: &str);
}

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
impl Injector for crate::input::InputInjector {
    fn move_rel(&self, dx: i32, dy: i32) { self.move_rel(dx, dy); }
    fn move_abs(&self, x: i32, y: i32) { self.move_abs(x, y); }
    fn key_down(&self, code: u16) { self.key_down(code); }
    fn key_up(&self, code: u16) { self.key_up(code); }
    fn button_down(&self, code: u16) { self.button_down(code); }
    fn button_up(&self, code: u16) { self.button_up(code); }
    fn wheel(&self, dx: i8, dy: i8) { self.wheel(dx, dy); }
    fn inject_action(&self, action: &str) { self.inject_action(action); }
}

#[cfg(target_os = "linux")]
fn wire_to_platform_button(wire: u8) -> u16 {
    crate::input::wire_to_linux_button(wire)
}

#[cfg(target_os = "macos")]
fn wire_to_platform_button(wire: u8) -> u16 {
    wire as u16
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn wire_to_platform_button(wire: u8) -> u16 {
    wire as u16
}

/// Apply the decoded contents of one UDP payload to a session.
///
/// The primary batch is processed first so current input is never delayed by
/// redundant history. Redundant batches are then used only for recovery from
/// packet loss.
pub fn apply_batches(
    pt: &[u8],
    session: &mut SessionState,
    injector: Option<&dyn Injector>,
    is_localhost: bool,
) {
    let batches = Event::decode_all_batches(pt);
    if batches.is_empty() {
        return;
    }

    let primary = &batches[0];
    let is_mouse_batch = primary
        .events
        .iter()
        .any(|e| matches!(e, Event::MouseMove { .. } | Event::MouseAbs { .. }));

    // If this is a duplicate mouse batch, skip it entirely. Non-mouse events
    // rely on their per-event seq numbers for deduplication.
    let primary_is_duplicate = is_mouse_batch && session.mouse_history.contains(primary.seq_base);
    if !primary_is_duplicate {
        for event in &primary.events {
            apply_event(event, session, injector, is_localhost);
        }
    }

    if is_mouse_batch {
        session.mouse_history.push(primary.seq_base);
    }

    // Redundant batches are only used for recovery from packet loss. Process
    // them after the primary batch so current input is never delayed by stale
    // history.
    for batch in batches[1..].iter().rev() {
        if session.mouse_history.contains(batch.seq_base) {
            continue;
        }
        for event in &batch.events {
            match event {
                Event::MouseMove { dx, dy } => {
                    if let Some(inj) = injector {
                        if !is_localhost {
                            inj.move_rel(i32::from(*dx), i32::from(*dy));
                        }
                    }
                }
                Event::MouseAbs { x, y } => {
                    if let Some(inj) = injector {
                        if !is_localhost {
                            let px = (*x as i32 * (i32::from(session.screen_width) - 1) + 32767) / 65535;
                            let py = (*y as i32 * (i32::from(session.screen_height) - 1) + 32767) / 65535;
                            inj.move_abs(px, py);
                        }
                    }
                }
                _ => {}
            }
        }
        session.mouse_history.push(batch.seq_base);
    }
}

fn apply_event(
    event: &Event,
    session: &mut SessionState,
    injector: Option<&dyn Injector>,
    is_localhost: bool,
) {
    // Deduplicate keyboard and wheel events by seq number.
    // Seq 0 is from old clients (backward compat) and bypasses dedup.
    let seq = match event {
        Event::KeyDown(_, s) | Event::KeyUp(_, s) | Event::KeyRepeat(_, s) => Some(*s),
        Event::Wheel { seq, .. } => Some(*seq),
        _ => None,
    };
    if let Some(s) = seq {
        if s != 0 && session.key_history.contains(s) {
            return; // duplicate
        }
        if s != 0 {
            session.key_history.push(s);
        }
    }

    // If a repeat arrives without a prior down (lost packet),
    // inject the synthetic down before handling the repeat.
    let needs_key_down = matches!(
        event,
        Event::KeyRepeat(c, _) if !session.tracker.has_key(*c)
    );
    let needs_button_down = matches!(
        event,
        Event::MouseButtonRepeat(b) if !session.tracker.has_button(*b)
    );

    // Remember whether key/button was held before tracker
    // updates state, so we can skip injecting orphan ups.
    let key_was_down = match event {
        Event::KeyUp(c, _) => Some(session.tracker.has_key(*c)),
        _ => None,
    };
    let button_was_down = match event {
        Event::MouseButton { button: b, pressed: false } => Some(session.tracker.has_button(*b)),
        _ => None,
    };

    let actions = session.tracker.handle_event(event);
    if let Some(inj) = injector {
        if !is_localhost {
            for action in &actions {
                if action.contains("(lost up)") || action.contains("(timeout)") {
                    inj.inject_action(action);
                }
            }
            if needs_key_down {
                if let Event::KeyRepeat(code, _) = event {
                    inj.key_down(*code);
                }
            }
            if needs_button_down {
                if let Event::MouseButtonRepeat(button) = event {
                    inj.button_down(wire_to_platform_button(*button));
                }
            }
            match event {
                Event::KeyDown(code, _) => {
                    inj.key_down(*code);
                }
                Event::KeyUp(code, _) => {
                    if key_was_down == Some(true) {
                        inj.key_up(*code);
                    }
                }
                Event::KeyRepeat(_, _) => {}
                Event::MouseButton { button, pressed: true } => {
                    inj.button_down(wire_to_platform_button(*button));
                }
                Event::MouseButton { button, pressed: false } => {
                    if button_was_down == Some(true) {
                        inj.button_up(wire_to_platform_button(*button));
                    }
                }
                Event::MouseButtonRepeat(_) => {}
                Event::Wheel { dx, dy, .. } => {
                    inj.wheel(*dx, *dy);
                }
                Event::MouseAbs { x, y } => {
                    let px = (*x as i32 * (i32::from(session.screen_width) - 1) + 32767) / 65535;
                    let py = (*y as i32 * (i32::from(session.screen_height) - 1) + 32767) / 65535;
                    inj.move_abs(px, py);
                }
                Event::MouseMove { dx, dy } => {
                    inj.move_rel(i32::from(*dx), i32::from(*dy));
                }
                Event::Keepalive => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::Event;

    #[derive(Default)]
    struct RecordingInjector {
        events: Mutex<Vec<Event>>,
    }

    impl RecordingInjector {
        fn events(&self) -> Vec<Event> {
            self.events.lock().unwrap().clone()
        }
    }

    impl Injector for RecordingInjector {
        fn move_rel(&self, dx: i32, dy: i32) {
            self.events.lock().unwrap().push(Event::MouseMove { dx: dx as i16, dy: dy as i16 });
        }
        fn move_abs(&self, x: i32, y: i32) {
            self.events.lock().unwrap().push(Event::MouseAbs { x: x as u16, y: y as u16 });
        }
        fn key_down(&self, code: u16) {
            self.events.lock().unwrap().push(Event::KeyDown(code, 0));
        }
        fn key_up(&self, code: u16) {
            self.events.lock().unwrap().push(Event::KeyUp(code, 0));
        }
        fn button_down(&self, code: u16) {
            self.events.lock().unwrap().push(Event::MouseButton { button: code as u8, pressed: true });
        }
        fn button_up(&self, code: u16) {
            self.events.lock().unwrap().push(Event::MouseButton { button: code as u8, pressed: false });
        }
        fn wheel(&self, dx: i8, dy: i8) {
            self.events.lock().unwrap().push(Event::Wheel { dx, dy, seq: 0 });
        }
        fn inject_action(&self, _action: &str) {}
    }

    fn test_session() -> SessionState {
        SessionState::new(false, None, "127.0.0.1:0".parse().unwrap(), 1000, 1920, 1080)
    }

    fn encode_mouse_batches(redundancy: usize) -> (Vec<u8>, Vec<(i16, i16)>) {
        // Build a primary batch plus redundant history.
        let mut history = std::collections::VecDeque::new();
        let mut all_deltas = Vec::new();
        for i in 0..=redundancy {
            let dx = (i as i16 + 1) * 10;
            let dy = (i as i16 + 1) * 5;
            all_deltas.push((dx, dy));
        }
        // History is ordered oldest -> newest in the VecDeque; encode_batch
        // appends in reverse (newest redundant first).
        for (idx, &(dx, dy)) in all_deltas.iter().enumerate().take(redundancy) {
            history.push_back((vec![Event::MouseMove { dx, dy }], idx as u16));
        }
        let primary_idx = redundancy;
        let (pdx, pdy) = all_deltas[primary_idx];
        let buf = Event::encode_batch(&[Event::MouseMove { dx: pdx, dy: pdy }], primary_idx as u16, &history);
        (buf, all_deltas)
    }

    #[test]
    fn primary_batch_processed_before_redundancy() {
        let mut session = test_session();
        let injector = RecordingInjector::default();
        let (buf, deltas) = encode_mouse_batches(2);

        apply_batches(&buf, &mut session, Some(&injector), false);

        let events = injector.events();
        // The first injected event must be from the primary batch.
        assert_eq!(events.first(), Some(&Event::MouseMove { dx: deltas[2].0, dy: deltas[2].1 }));
        // All three deltas should eventually be injected (primary + 2 recovered).
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn duplicate_primary_mouse_batch_is_skipped() {
        let mut session = test_session();
        let injector = RecordingInjector::default();
        let (buf, deltas) = encode_mouse_batches(0);

        apply_batches(&buf, &mut session, Some(&injector), false);
        apply_batches(&buf, &mut session, Some(&injector), false);

        let events = injector.events();
        assert_eq!(events.len(), 1, "duplicate mouse batch should be deduplicated");
        assert_eq!(events[0], Event::MouseMove { dx: deltas[0].0, dy: deltas[0].1 });
    }

    #[test]
    fn localhost_mouse_events_are_suppressed() {
        let mut session = test_session();
        let injector = RecordingInjector::default();
        let (buf, _) = encode_mouse_batches(0);

        apply_batches(&buf, &mut session, Some(&injector), true);

        assert!(injector.events().is_empty(), "localhost movement should not be injected");
    }
}