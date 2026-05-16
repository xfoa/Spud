//! Windows Virtual Key code <-> Linux evdev scancode translation.

/// Convert a Linux evdev scancode to a Windows virtual-key code.
///
/// Returns `None` for unmapped codes. The caller should fall back to
/// `MapVirtualKeyW` when this returns `None`.
pub fn evdev_to_windows_vk(evdev: u16) -> Option<u16> {
    Some(match evdev {
        1 => 0x1B,   // Escape
        2 => 0x31,   // 1
        3 => 0x32,   // 2
        4 => 0x33,   // 3
        5 => 0x34,   // 4
        6 => 0x35,   // 5
        7 => 0x36,   // 6
        8 => 0x37,   // 7
        9 => 0x38,   // 8
        10 => 0x39,  // 9
        11 => 0x30,  // 0
        12 => 0xBD,  // - OEM_MINUS
        13 => 0xBB,  // = OEM_PLUS
        14 => 0x08,  // Backspace
        15 => 0x09,  // Tab
        16 => 0x51,  // Q
        17 => 0x57,  // W
        18 => 0x45,  // E
        19 => 0x52,  // R
        20 => 0x54,  // T
        21 => 0x59,  // Y
        22 => 0x55,  // U
        23 => 0x49,  // I
        24 => 0x4F,  // O
        25 => 0x50,  // P
        26 => 0xDB,  // [ OEM_4
        27 => 0xDD,  // ] OEM_6
        28 => 0x0D,  // Enter
        29 => 0xA2,  // Left Ctrl
        30 => 0x41,  // A
        31 => 0x53,  // S
        32 => 0x44,  // D
        33 => 0x46,  // F
        34 => 0x47,  // G
        35 => 0x48,  // H
        36 => 0x4A,  // J
        37 => 0x4B,  // K
        38 => 0x4C,  // L
        39 => 0xBA,  // ; OEM_1
        40 => 0xDE,  // ' OEM_7
        41 => 0xC0,  // ` OEM_3
        42 => 0xA0,  // Left Shift
        43 => 0xDC,  // \ OEM_5
        44 => 0x5A,  // Z
        45 => 0x58,  // X
        46 => 0x43,  // C
        47 => 0x56,  // V
        48 => 0x42,  // B
        49 => 0x4E,  // N
        50 => 0x4D,  // M
        51 => 0xBC,  // , OEM_COMMA
        52 => 0xBE,  // . OEM_PERIOD
        53 => 0xBF,  // / OEM_2
        54 => 0xA1,  // Right Shift
        55 => 0x6A,  // Numpad *
        56 => 0xA4,  // Left Alt
        57 => 0x20,  // Space
        58 => 0x14,  // Caps Lock
        59 => 0x70,  // F1
        60 => 0x71,  // F2
        61 => 0x72,  // F3
        62 => 0x73,  // F4
        63 => 0x74,  // F5
        64 => 0x75,  // F6
        65 => 0x76,  // F7
        66 => 0x77,  // F8
        67 => 0x78,  // F9
        68 => 0x79,  // F10
        69 => 0x90,  // Num Lock
        70 => 0x91,  // Scroll Lock
        71 => 0x67,  // Numpad 7
        72 => 0x68,  // Numpad 8
        73 => 0x69,  // Numpad 9
        74 => 0x6D,  // Numpad -
        75 => 0x64,  // Numpad 4
        76 => 0x65,  // Numpad 5
        77 => 0x66,  // Numpad 6
        78 => 0x6B,  // Numpad +
        79 => 0x61,  // Numpad 1
        80 => 0x62,  // Numpad 2
        81 => 0x63,  // Numpad 3
        82 => 0x60,  // Numpad 0
        83 => 0x6E,  // Numpad .
        86 => 0xE2,  // Intl Backslash (OEM_102)
        87 => 0x7A,  // F11
        88 => 0x7B,  // F12
        89 => 0x73,  // Intl Ro (mapped to F4 as fallback -- rare)
        92 => 0x19,  // Convert (HANJA)
        93 => 0x15,  // Kana Mode (KANA)
        94 => 0x1C,  // Non Convert (JUNJA)
        96 => 0x0D,  // Numpad Enter (extended)
        97 => 0xA3,  // Right Ctrl
        98 => 0x6F,  // Numpad /
        99 => 0x2C,  // Print Screen
        100 => 0xA5, // Right Alt
        102 => 0x24, // Home
        103 => 0x26, // Up
        104 => 0x21, // Page Up
        105 => 0x25, // Left
        106 => 0x27, // Right
        107 => 0x23, // End
        108 => 0x28, // Down
        109 => 0x22, // Page Down
        110 => 0x2D, // Insert
        111 => 0x2E, // Delete
        119 => 0x13, // Pause
        122 => 0x1A, // Lang1 (HANJA)
        123 => 0x15, // Lang2 (KANA)
        125 => 0x5B, // Left Win
        126 => 0x5C, // Right Win
        127 => 0x5D, // Apps/Menu
        138 => 0x2F, // Help
        _ => return None,
    })
}

/// Convert a Windows virtual-key code to a Linux evdev scancode.
///
/// Used by the client-side capture backend to translate raw Windows key
/// events into the wire-protocol evdev codes.
pub fn windows_vk_to_evdev(vk: u16) -> Option<u16> {
    Some(match vk {
        0x1B => 1,   // Escape
        0x31 => 2,   // 1
        0x32 => 3,   // 2
        0x33 => 4,   // 3
        0x34 => 5,   // 4
        0x35 => 6,   // 5
        0x36 => 7,   // 6
        0x37 => 8,   // 7
        0x38 => 9,   // 8
        0x39 => 10,  // 9
        0x30 => 11,  // 0
        0xBD => 12,  // - OEM_MINUS
        0xBB => 13,  // = OEM_PLUS
        0x08 => 14,  // Backspace
        0x09 => 15,  // Tab
        0x51 => 16,  // Q
        0x57 => 17,  // W
        0x45 => 18,  // E
        0x52 => 19,  // R
        0x54 => 20,  // T
        0x59 => 21,  // Y
        0x55 => 22,  // U
        0x49 => 23,  // I
        0x4F => 24,  // O
        0x50 => 25,  // P
        0xDB => 26,  // [ OEM_4
        0xDD => 27,  // ] OEM_6
        0x0D => 28,  // Enter
        0xA2 => 29,  // Left Ctrl
        0x41 => 30,  // A
        0x53 => 31,  // S
        0x44 => 32,  // D
        0x46 => 33,  // F
        0x47 => 34,  // G
        0x48 => 35,  // H
        0x4A => 36,  // J
        0x4B => 37,  // K
        0x4C => 38,  // L
        0xBA => 39,  // ; OEM_1
        0xDE => 40,  // ' OEM_7
        0xC0 => 41,  // ` OEM_3
        0xA0 => 42,  // Left Shift
        0xDC => 43,  // \ OEM_5
        0x5A => 44,  // Z
        0x58 => 45,  // X
        0x43 => 46,  // C
        0x56 => 47,  // V
        0x42 => 48,  // B
        0x4E => 49,  // N
        0x4D => 50,  // M
        0xBC => 51,  // , OEM_COMMA
        0xBE => 52,  // . OEM_PERIOD
        0xBF => 53,  // / OEM_2
        0xA1 => 54,  // Right Shift
        0x6A => 55,  // Numpad *
        0xA4 => 56,  // Left Alt
        0x20 => 57,  // Space
        0x14 => 58,  // Caps Lock
        0x70 => 59,  // F1
        0x71 => 60,  // F2
        0x72 => 61,  // F3
        0x73 => 62,  // F4
        0x74 => 63,  // F5
        0x75 => 64,  // F6
        0x76 => 65,  // F7
        0x77 => 66,  // F8
        0x78 => 67,  // F9
        0x79 => 68,  // F10
        0x90 => 69,  // Num Lock
        0x91 => 70,  // Scroll Lock
        0x67 => 71,  // Numpad 7
        0x68 => 72,  // Numpad 8
        0x69 => 73,  // Numpad 9
        0x6D => 74,  // Numpad -
        0x64 => 75,  // Numpad 4
        0x65 => 76,  // Numpad 5
        0x66 => 77,  // Numpad 6
        0x6B => 78,  // Numpad +
        0x61 => 79,  // Numpad 1
        0x62 => 80,  // Numpad 2
        0x63 => 81,  // Numpad 3
        0x60 => 82,  // Numpad 0
        0x6E => 83,  // Numpad .
        0xE2 => 86,  // OEM_102
        0x7A => 87,  // F11
        0x7B => 88,  // F12
        0x19 => 92,  // Convert
        0x15 => 93,  // Kana Mode
        0x1C => 94,  // Non Convert
        0xA3 => 97,  // Right Ctrl
        0x6F => 98,  // Numpad /
        0x2C => 99,  // Print Screen
        0xA5 => 100, // Right Alt
        0x24 => 102, // Home
        0x26 => 103, // Up
        0x21 => 104, // Page Up
        0x25 => 105, // Left
        0x27 => 106, // Right
        0x23 => 107, // End
        0x28 => 108, // Down
        0x22 => 109, // Page Down
        0x2D => 110, // Insert
        0x2E => 111, // Delete
        0x13 => 119, // Pause
        0x1A => 122, // Lang1
        0x5B => 125, // Left Win
        0x5C => 126, // Right Win
        0x5D => 127, // Apps/Menu
        0x2F => 138, // Help
        _ => return None,
    })
}

/// Returns true if the given Windows VK code requires the `KEYEVENTF_EXTENDEDKEY`
/// flag when calling `SendInput`.
pub fn is_extended_key(vk: u16) -> bool {
    matches!(
        vk,
        0xA3 | // Right Ctrl
        0xA5 | // Right Alt
        0x5B | // Left Win
        0x5C | // Right Win
        0x5D | // Apps
        0x21 | // Page Up
        0x22 | // Page Down
        0x23 | // End
        0x24 | // Home
        0x25 | // Left
        0x26 | // Up
        0x27 | // Right
        0x28 | // Down
        0x2D | // Insert
        0x2E | // Delete
        0x6F | // Divide
        0x13   // Pause
    )
}
