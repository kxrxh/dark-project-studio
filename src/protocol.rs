// SPDX-License-Identifier: GPL-2.0-or-later
// Protocol and key offsets adapted from OpenRGB's DarkProjectKeyboardController.
// Original driver: Chris M (DrNo), 08 Apr 2022. See README.md for source links.

pub const KEY_COUNT: usize = 87;

pub const KEYS: [(&str, usize); KEY_COUNT] = [
    ("esc", 5),
    ("f1", 11),
    ("f2", 17),
    ("f3", 23),
    ("f4", 29),
    ("f5", 35),
    ("f6", 41),
    ("f7", 47),
    ("f8", 53),
    ("f9", 59),
    ("f10", 65),
    ("f11", 71),
    ("f12", 77),
    ("print-screen", 83),
    ("scroll-lock", 89),
    ("pause", 95),
    ("grave", 0),
    ("1", 6),
    ("2", 12),
    ("3", 18),
    ("4", 24),
    ("5", 30),
    ("6", 36),
    ("7", 42),
    ("8", 48),
    ("9", 54),
    ("0", 60),
    ("minus", 66),
    ("equal", 72),
    ("backspace", 78),
    ("insert", 84),
    ("home", 90),
    ("page-up", 96),
    ("tab", 1),
    ("q", 7),
    ("w", 13),
    ("e", 19),
    ("r", 25),
    ("t", 31),
    ("y", 37),
    ("u", 43),
    ("i", 49),
    ("o", 55),
    ("p", 61),
    ("left-bracket", 67),
    ("right-bracket", 73),
    ("backslash", 79),
    ("delete", 85),
    ("end", 91),
    ("page-down", 97),
    ("caps-lock", 2),
    ("a", 8),
    ("s", 14),
    ("d", 20),
    ("f", 26),
    ("g", 32),
    ("h", 38),
    ("j", 44),
    ("k", 50),
    ("l", 56),
    ("semicolon", 62),
    ("quote", 68),
    ("enter", 80),
    ("left-shift", 3),
    ("z", 15),
    ("x", 21),
    ("c", 27),
    ("v", 33),
    ("b", 39),
    ("n", 45),
    ("m", 51),
    ("comma", 57),
    ("period", 63),
    ("slash", 69),
    ("right-shift", 81),
    ("up", 93),
    ("left-ctrl", 4),
    ("left-win", 10),
    ("left-alt", 16),
    ("space", 34),
    ("right-alt", 52),
    ("fn", 58),
    ("menu", 64),
    ("right-ctrl", 76),
    ("left", 88),
    ("down", 94),
    ("right", 100),
];

pub fn encode(colors: &[[u8; 3]; KEY_COUNT]) -> [[u8; 256]; 2] {
    let mut packets = [[0; 256]; 2];
    packets[0][..5].copy_from_slice(&[8, 7, 0, 0, 0]);
    packets[1][..5].copy_from_slice(&[8, 7, 0, 1, 0]);
    for ((_, offset), [red, green, blue]) in KEYS.iter().zip(colors) {
        packets[0][5 + offset] = *red;
        packets[0][107 + offset] = *green;
        packets[1][5 + offset] = *blue;
    }
    packets
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_frame_contains_only_the_two_report_headers() {
        let packets = encode(&[[0; 3]; KEY_COUNT]);
        let mut expected = [[0; 256]; 2];
        expected[0][..5].copy_from_slice(&[8, 7, 0, 0, 0]);
        expected[1][..5].copy_from_slice(&[8, 7, 0, 1, 0]);
        assert_eq!(packets, expected);
    }

    #[test]
    fn f1_color_uses_separate_red_green_and_blue_planes() {
        let mut colors = [[0; 3]; KEY_COUNT];
        colors[1] = [0x12, 0x34, 0x56];
        let packets = encode(&colors);
        let mut expected = [[0; 256]; 2];
        expected[0][..5].copy_from_slice(&[8, 7, 0, 0, 0]);
        expected[1][..5].copy_from_slice(&[8, 7, 0, 1, 0]);
        expected[0][16] = 0x12;
        expected[0][118] = 0x34;
        expected[1][16] = 0x56;
        assert_eq!(packets, expected);
    }

    #[test]
    fn maps_keys_at_both_ends_of_the_layout_without_overlap() {
        let mut colors = [[0; 3]; KEY_COUNT];
        colors[0] = [1, 2, 3]; // Escape: offset 5
        colors[16] = [4, 5, 6]; // Grave: offset 0
        colors[86] = [7, 8, 9]; // Right arrow: offset 100
        let packets = encode(&colors);
        assert_eq!(
            [
                packets[0][10],
                packets[0][112],
                packets[1][10],
                packets[0][5],
                packets[0][107],
                packets[1][5],
                packets[0][105],
                packets[0][207],
                packets[1][105]
            ],
            [1, 2, 3, 4, 5, 6, 7, 8, 9]
        );
    }
}
