use std::io;
use std::sync::mpsc::{self, Sender as MpscSender};
use std::thread::{self, JoinHandle};

use windows::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_UNICODE, MAPVK_VSC_TO_VK, MOUSEEVENTF_ABSOLUTE,
    MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
    MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_WHEEL, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

use crate::input::key_names;

/// Commands sent to the injector worker thread.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum InjectCmd {
    MouseAbs { x: i32, y: i32 },
    MouseRel { dx: i32, dy: i32 },
    KeyDown { code: u16 },
    KeyUp { code: u16 },
    ButtonDown { code: u16 },
    ButtonUp { code: u16 },
    Wheel { dx: i8, dy: i8 },
}

const WHEEL_DELTA: i32 = 120;
const XBUTTON1: u32 = 1;
const XBUTTON2: u32 = 2;

/// Injects input events on Windows via `SendInput`.
pub struct InputInjector {
    tx: MpscSender<InjectCmd>,
    _handle: JoinHandle<()>,
}

impl InputInjector {
    pub fn new(_screen_width: u16, _screen_height: u16) -> io::Result<Self> {
        let (tx, rx) = mpsc::channel::<InjectCmd>();

        let handle = thread::spawn(move || {
            // Query virtual desktop bounds once at startup.
            let (vd_x, vd_y, vd_w, vd_h) = unsafe {
                (
                    GetSystemMetrics(SM_XVIRTUALSCREEN),
                    GetSystemMetrics(SM_YVIRTUALSCREEN),
                    GetSystemMetrics(SM_CXVIRTUALSCREEN).max(1),
                    GetSystemMetrics(SM_CYVIRTUALSCREEN).max(1),
                )
            };

            while let Ok(cmd) = rx.recv() {
                match cmd {
                    InjectCmd::MouseRel { dx, dy } => {
                        let mut total_dx = dx;
                        let mut total_dy = dy;
                        let mut queued_non_move: Option<InjectCmd> = None;
                        while let Ok(next) = rx.try_recv() {
                            if let InjectCmd::MouseRel { dx, dy } = next {
                                total_dx = total_dx.saturating_add(dx);
                                total_dy = total_dy.saturating_add(dy);
                            } else {
                                queued_non_move = Some(next);
                                break;
                            }
                        }
                        send_mouse_input(MOUSEINPUT {
                            dx: total_dx,
                            dy: total_dy,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_MOVE,
                            time: 0,
                            dwExtraInfo: 0,
                        });
                        if let Some(cmd) = queued_non_move {
                            match cmd {
                                InjectCmd::MouseAbs { x, y } => {
                                    let nx = ((x - vd_x) * 65535 / vd_w) as i32;
                                    let ny = ((y - vd_y) * 65535 / vd_h) as i32;
                                    send_mouse_input(MOUSEINPUT {
                                        dx: nx,
                                        dy: ny,
                                        mouseData: 0,
                                        dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                                        time: 0,
                                        dwExtraInfo: 0,
                                    });
                                }
                                InjectCmd::KeyDown { code } => {
                                    send_key_event(code, true);
                                }
                                InjectCmd::KeyUp { code } => {
                                    send_key_event(code, false);
                                }
                                InjectCmd::ButtonDown { code } => {
                                    if let Some((flag, data)) = wire_to_mouse_event(true, code as u8) {
                                        send_mouse_input(MOUSEINPUT {
                                            dx: 0,
                                            dy: 0,
                                            mouseData: data,
                                            dwFlags: flag,
                                            time: 0,
                                            dwExtraInfo: 0,
                                        });
                                    }
                                }
                                InjectCmd::ButtonUp { code } => {
                                    if let Some((flag, data)) = wire_to_mouse_event(false, code as u8) {
                                        send_mouse_input(MOUSEINPUT {
                                            dx: 0,
                                            dy: 0,
                                            mouseData: data,
                                            dwFlags: flag,
                                            time: 0,
                                            dwExtraInfo: 0,
                                        });
                                    }
                                }
                                InjectCmd::Wheel { dx, dy } => {
                                    if dy != 0 && dx != 0 {
                                        let inputs = [
                                            INPUT {
                                                r#type: INPUT_MOUSE,
                                                Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                                    mi: MOUSEINPUT {
                                                        dx: 0,
                                                        dy: 0,
                                                        mouseData: (i32::from(dy) * WHEEL_DELTA) as u32,
                                                        dwFlags: MOUSEEVENTF_WHEEL,
                                                        time: 0,
                                                        dwExtraInfo: 0,
                                                    },
                                                },
                                            },
                                            INPUT {
                                                r#type: INPUT_MOUSE,
                                                Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                                    mi: MOUSEINPUT {
                                                        dx: 0,
                                                        dy: 0,
                                                        mouseData: (i32::from(dx) * WHEEL_DELTA) as u32,
                                                        dwFlags: MOUSEEVENTF_HWHEEL,
                                                        time: 0,
                                                        dwExtraInfo: 0,
                                                    },
                                                },
                                            },
                                        ];
                                        send_inputs(&inputs);
                                    } else if dy != 0 {
                                        let delta = i32::from(dy) * WHEEL_DELTA;
                                        send_mouse_input(MOUSEINPUT {
                                            dx: 0,
                                            dy: 0,
                                            mouseData: delta as u32,
                                            dwFlags: MOUSEEVENTF_WHEEL,
                                            time: 0,
                                            dwExtraInfo: 0,
                                        });
                                    } else if dx != 0 {
                                        let delta = i32::from(dx) * WHEEL_DELTA;
                                        send_mouse_input(MOUSEINPUT {
                                            dx: 0,
                                            dy: 0,
                                            mouseData: delta as u32,
                                            dwFlags: MOUSEEVENTF_HWHEEL,
                                            time: 0,
                                            dwExtraInfo: 0,
                                        });
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    other => {
                        match other {
                            InjectCmd::MouseAbs { x, y } => {
                                let nx = ((x - vd_x) * 65535 / vd_w) as i32;
                                let ny = ((y - vd_y) * 65535 / vd_h) as i32;
                                send_mouse_input(MOUSEINPUT {
                                    dx: nx,
                                    dy: ny,
                                    mouseData: 0,
                                    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                                    time: 0,
                                    dwExtraInfo: 0,
                                });
                            }
                            InjectCmd::KeyDown { code } => {
                                send_key_event(code, true);
                            }
                            InjectCmd::KeyUp { code } => {
                                send_key_event(code, false);
                            }
                            InjectCmd::ButtonDown { code } => {
                                if let Some((flag, data)) = wire_to_mouse_event(true, code as u8) {
                                    send_mouse_input(MOUSEINPUT {
                                        dx: 0,
                                        dy: 0,
                                        mouseData: data,
                                        dwFlags: flag,
                                        time: 0,
                                        dwExtraInfo: 0,
                                    });
                                }
                            }
                            InjectCmd::ButtonUp { code } => {
                                if let Some((flag, data)) = wire_to_mouse_event(false, code as u8) {
                                    send_mouse_input(MOUSEINPUT {
                                        dx: 0,
                                        dy: 0,
                                        mouseData: data,
                                        dwFlags: flag,
                                        time: 0,
                                        dwExtraInfo: 0,
                                    });
                                }
                            }
                            InjectCmd::Wheel { dx, dy } => {
                                if dy != 0 && dx != 0 {
                                    let inputs = [
                                        INPUT {
                                            r#type: INPUT_MOUSE,
                                            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                                mi: MOUSEINPUT {
                                                    dx: 0,
                                                    dy: 0,
                                                    mouseData: (i32::from(dy) * WHEEL_DELTA) as u32,
                                                    dwFlags: MOUSEEVENTF_WHEEL,
                                                    time: 0,
                                                    dwExtraInfo: 0,
                                                },
                                            },
                                        },
                                        INPUT {
                                            r#type: INPUT_MOUSE,
                                            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                                                mi: MOUSEINPUT {
                                                    dx: 0,
                                                    dy: 0,
                                                    mouseData: (i32::from(dx) * WHEEL_DELTA) as u32,
                                                    dwFlags: MOUSEEVENTF_HWHEEL,
                                                    time: 0,
                                                    dwExtraInfo: 0,
                                                },
                                            },
                                        },
                                    ];
                                    send_inputs(&inputs);
                                } else if dy != 0 {
                                    let delta = i32::from(dy) * WHEEL_DELTA;
                                    send_mouse_input(MOUSEINPUT {
                                        dx: 0,
                                        dy: 0,
                                        mouseData: delta as u32,
                                        dwFlags: MOUSEEVENTF_WHEEL,
                                        time: 0,
                                        dwExtraInfo: 0,
                                    });
                                } else if dx != 0 {
                                    let delta = i32::from(dx) * WHEEL_DELTA;
                                    send_mouse_input(MOUSEINPUT {
                                        dx: 0,
                                        dy: 0,
                                        mouseData: delta as u32,
                                        dwFlags: MOUSEEVENTF_HWHEEL,
                                        time: 0,
                                        dwExtraInfo: 0,
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            println!("[spud] Windows input injector thread exiting");
        });

        Ok(Self { tx, _handle: handle })
    }

    pub fn move_abs(&self, x: i32, y: i32) {
        let _ = self.tx.send(InjectCmd::MouseAbs { x, y });
    }

    pub fn move_rel(&self, dx: i32, dy: i32) {
        let _ = self.tx.send(InjectCmd::MouseRel { dx, dy });
    }

    pub fn key_down(&self, code: u16) {
        let _ = self.tx.send(InjectCmd::KeyDown { code });
    }

    pub fn key_up(&self, code: u16) {
        let _ = self.tx.send(InjectCmd::KeyUp { code });
    }

    pub fn button_down(&self, code: u16) {
        let _ = self.tx.send(InjectCmd::ButtonDown { code });
    }

    pub fn button_up(&self, code: u16) {
        let _ = self.tx.send(InjectCmd::ButtonUp { code });
    }

    pub fn wheel(&self, dx: i8, dy: i8) {
        let _ = self.tx.send(InjectCmd::Wheel { dx, dy });
    }

    pub fn inject_action(&self, action: &str) {
        let action = action.trim();
        if let Some(rest) = action.strip_prefix("press ") {
            let name = rest.split(" (").next().unwrap_or(rest).trim();
            if let Some(code) = key_names::parse_key_name(name) {
                let _ = self.tx.send(InjectCmd::KeyDown { code });
            } else if let Some(btn) = key_names::parse_mouse_button(name) {
                let _ = self.tx.send(InjectCmd::ButtonDown { code: btn as u16 });
            }
        } else if let Some(rest) = action.strip_prefix("release ") {
            let name = rest.split(" (").next().unwrap_or(rest).trim();
            if let Some(code) = key_names::parse_key_name(name) {
                let _ = self.tx.send(InjectCmd::KeyUp { code });
            } else if let Some(btn) = key_names::parse_mouse_button(name) {
                let _ = self.tx.send(InjectCmd::ButtonUp { code: btn as u16 });
            }
        }
    }
}

fn send_mouse_input(mi: MOUSEINPUT) {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            mi,
        },
    };
    send_inputs(&[input]);
}

fn send_inputs(inputs: &[INPUT]) {
    unsafe {
        windows::Win32::UI::Input::KeyboardAndMouse::SendInput(inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn send_key_event(evdev_code: u16, down: bool) {
    use crate::input::windows_keycodes::evdev_to_windows_vk;
    use crate::input::windows_keycodes::is_extended_key;

    let vk = evdev_to_windows_vk(evdev_code)
        .or_else(|| unsafe { Some(MapVirtualKeyW(evdev_code.into(), MAPVK_VSC_TO_VK) as u16) })
        .filter(|&vk| vk != 0);

    let (vk, flags) = match vk {
        Some(vk) => {
            let mut flags = if down { 0 } else { KEYEVENTF_EXTENDEDKEY.0 };
            if is_extended_key(vk) {
                flags |= KEYEVENTF_EXTENDEDKEY.0;
            }
            (vk, flags)
        }
        None => {
            // Fallback: try sending as Unicode. This only works for
            // printable characters and only generates keydown (no
            // physical key location). Not great, but better than
            // silently dropping the key.
            if down && evdev_code < 0x100 {
                let input = INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VIRTUAL_KEY(0),
                            wScan: evdev_code as u16,
                            dwFlags: KEYEVENTF_UNICODE,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                unsafe {
                    windows::Win32::UI::Input::KeyboardAndMouse::SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                }
            }
            return;
        }
    };

    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        windows::Win32::UI::Input::KeyboardAndMouse::SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn wire_to_mouse_event(pressed: bool, wire: u8) -> Option<(windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS, u32)> {
    let flags = match (wire, pressed) {
        (1, true) => MOUSEEVENTF_LEFTDOWN,
        (1, false) => MOUSEEVENTF_LEFTUP,
        (2, true) => MOUSEEVENTF_MIDDLEDOWN,
        (2, false) => MOUSEEVENTF_MIDDLEUP,
        (3, true) => MOUSEEVENTF_RIGHTDOWN,
        (3, false) => MOUSEEVENTF_RIGHTUP,
        (8, true) => MOUSEEVENTF_XDOWN,
        (8, false) => MOUSEEVENTF_XUP,
        (9, true) => MOUSEEVENTF_XDOWN,
        (9, false) => MOUSEEVENTF_XUP,
        _ => return None,
    };
    let data = match wire {
        8 => XBUTTON1 as u32,
        9 => XBUTTON2 as u32,
        _ => 0,
    };
    Some((flags, data))
}
