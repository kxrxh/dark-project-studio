use crate::device::protocol::{KEY_COUNT, KEYS};
use crate::profile::model::{Effect, Frame, KeyStyle, StudioProfile};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Profile {
    Cyberpunk,
    Sunset,
    Gaming,
}

impl Profile {
    pub fn config(self) -> StudioProfile {
        let (id, name, description) = match self {
            Self::Cyberpunk => (
                "cyberpunk",
                "Cyberpunk",
                "Движущаяся полоса из бирюзы в мадженту",
            ),
            Self::Sunset => ("sunset", "Sunset", "Мягкое дыхание закатного градиента"),
            Self::Gaming => ("gaming", "Gaming", "Пульсация WASD и стрелок на синем фоне"),
        };
        let keys = self
            .colors()
            .iter()
            .zip(KEYS)
            .map(|(color, (key, _))| {
                let breathing = self == Self::Sunset
                    || (self == Self::Gaming
                        && matches!(
                            key,
                            "w" | "a" | "s" | "d" | "up" | "left" | "down" | "right"
                        ));
                KeyStyle {
                    color: *color,
                    effect: if breathing {
                        Effect::Breathing
                    } else {
                        Effect::Static
                    },
                    speed: 1,
                    pause: if self == Self::Sunset { 64 } else { 32 },
                }
            })
            .collect();
        let frames = if self == Self::Cyberpunk {
            (0..17)
                .map(|frame| Frame {
                    keys: KEYS
                        .iter()
                        .enumerate()
                        .filter(|(_, (_, offset))| (offset / 6 + 17 - frame) % 17 < 3)
                        .map(|(index, _)| index)
                        .collect(),
                    duration: 1,
                })
                .collect()
        } else {
            vec![Frame {
                keys: (0..KEY_COUNT).collect(),
                duration: 1,
            }]
        };
        StudioProfile {
            version: 1,
            id: id.into(),
            name: name.into(),
            description: description.into(),
            brightness: 100,
            keys,
            frames,
            bindings: vec![],
            macros: vec![],
            reactive: None,
            firmware: None,
        }
    }
    pub fn parse(name: &str) -> Result<Self, &'static str> {
        match name {
            "cyberpunk" => Ok(Self::Cyberpunk),
            "sunset" => Ok(Self::Sunset),
            "gaming" => Ok(Self::Gaming),
            _ => Err("Unknown profile; choose cyberpunk, sunset, or gaming."),
        }
    }

    pub fn colors(self) -> [[u8; 3]; KEY_COUNT] {
        let mut colors = [[0; 3]; KEY_COUNT];
        if self == Self::Gaming {
            for (color, (name, _)) in colors.iter_mut().zip(KEYS) {
                *color = match name {
                    "esc" => [255, 0, 80],
                    "w" | "a" | "s" | "d" => [0, 255, 180],
                    "up" | "left" | "down" | "right" => [255, 100, 0],
                    _ => [24, 48, 128],
                };
            }
        } else {
            let (left, right) = match self {
                Self::Cyberpunk => ([0, 255, 255], [255, 0, 160]),
                _ => ([255, 100, 0], [100, 0, 255]),
            };
            for (color, (_, offset)) in colors.iter_mut().zip(KEYS) {
                // KD3B offsets group each physical column into six LED positions.
                let column = offset / 6;
                for channel in 0..3 {
                    color[channel] =
                        ((left[channel] * (16 - column) + right[channel] * column) / 16) as u8;
                }
            }
        }
        colors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn templates_are_editable_valid_profiles_with_the_original_animations() {
        let cyberpunk = Profile::Cyberpunk.config();
        assert!(cyberpunk.validate().is_ok());
        assert_eq!(cyberpunk.frames.len(), 17);
        assert!(cyberpunk.frames[0].keys.contains(&0));
        assert!(!cyberpunk.frames[0].keys.contains(&86));
        let sunset = Profile::Sunset.config();
        assert!(sunset.validate().is_ok());
        assert_eq!(sunset.keys[0].effect, Effect::Breathing);
        let gaming = Profile::Gaming.config();
        assert_eq!(gaming.keys[35].effect, Effect::Breathing);
        assert_eq!(gaming.keys[54].effect, Effect::Static);
    }

    #[test]
    fn parses_named_profiles_and_rejects_unknown_names() {
        for (name, profile) in [
            ("cyberpunk", Profile::Cyberpunk),
            ("sunset", Profile::Sunset),
            ("gaming", Profile::Gaming),
        ] {
            assert_eq!(Profile::parse(name), Ok(profile));
        }
        assert!(Profile::parse("unknown").is_err());
    }

    #[test]
    fn cyberpunk_blends_cyan_to_magenta_by_physical_column() {
        let colors = Profile::Cyberpunk.colors();
        assert_eq!(colors[0], [0, 255, 255]); // Escape, left edge
        assert_eq!(colors[1], [15, 239, 249]); // F1, second column
        assert_eq!(colors[86], [255, 0, 160]); // Right arrow, right edge
        assert_eq!(colors[0], colors[16]); // Escape and grave share a column
    }

    #[test]
    fn sunset_blends_orange_to_violet() {
        let colors = Profile::Sunset.colors();
        assert_eq!(colors[0], [255, 100, 0]);
        assert_eq!(colors[86], [100, 0, 255]);
    }

    #[test]
    fn gaming_highlights_movement_and_arrows_over_a_blue_background() {
        let colors = Profile::Gaming.colors();
        assert_eq!(colors[0], [255, 0, 80]); // Escape
        assert_eq!(colors[35], [0, 255, 180]); // W
        assert_eq!(colors[51], [0, 255, 180]); // A
        assert_eq!(colors[52], [0, 255, 180]); // S
        assert_eq!(colors[53], [0, 255, 180]); // D
        assert_eq!(colors[75], [255, 100, 0]); // Up
        assert_eq!(colors[86], [255, 100, 0]); // Right
        assert_eq!(colors[54], [24, 48, 128]); // F stays blue
    }
}
