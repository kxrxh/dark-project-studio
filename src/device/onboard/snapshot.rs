use super::{BLOCKS, reports::checksum};
use crate::device::{
    protocol::{KEY_COUNT, KEYS},
    usb,
};
#[cfg(test)]
use crate::profile::presets::Profile;
use crate::profile::{
    macros::MacroBinding,
    model::{
        Binding, Effect, FirmwareSettings, FirmwareTuning, Frame, KeyStyle, Layer, StudioProfile,
        supported_action,
    },
};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Snapshot {
    pub(super) profile: u8,
    pub(super) release: u16,
    pub(super) blocks: [Vec<u8>; 5],
    pub(super) macros: BTreeMap<u8, Vec<u8>>,
}

impl Snapshot {
    pub(super) fn encode(&self) -> Vec<u8> {
        let mut bytes = if self.macros.is_empty() {
            b"DPBK0002".to_vec()
        } else {
            b"DPBK0003".to_vec()
        };
        bytes.extend_from_slice(&usb::VID.to_le_bytes());
        bytes.extend_from_slice(&usb::PID.to_le_bytes());
        bytes.extend_from_slice(&self.release.to_le_bytes());
        bytes.extend_from_slice(&[self.profile, 0]);
        for block in &self.blocks {
            bytes.extend_from_slice(block);
        }
        if !self.macros.is_empty() {
            bytes.extend_from_slice(&(self.macros.len() as u16).to_le_bytes());
            for (index, data) in &self.macros {
                bytes.push(*index);
                bytes.extend_from_slice(data);
            }
        }
        bytes.extend_from_slice(&checksum(&bytes).to_le_bytes());
        bytes
    }

    pub(super) fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
        let legacy = bytes.len() == 1169 && bytes.get(..8) == Some(b"DPBK0001");
        let current = bytes.len() == 1373 && bytes.get(..8) == Some(b"DPBK0002");
        let macro_version =
            bytes.len() >= 1375 && bytes.len() <= 50947 && bytes.get(..8) == Some(b"DPBK0003");
        if (!legacy && !current && !macro_version)
            || bytes[8..12] != [0x5d, 0x19, 0x61, 0x20]
            || !(1..=4).contains(&bytes[14])
            || bytes[15] != 0
        {
            return Err("Invalid KD3B profile backup.");
        }
        let end = bytes.len() - 4;
        if bytes[end..] != checksum(&bytes[..end]).to_le_bytes() {
            return Err("Backup checksum mismatch; refusing to restore.");
        }
        let mut cursor = 16;
        let blocks = BLOCKS.map(|(_, length)| {
            if cursor + length > end {
                return Vec::new();
            }
            let data = bytes[cursor..cursor + length].to_vec();
            cursor += length;
            data
        });
        let mut macros = BTreeMap::new();
        if macro_version {
            let count = usize::from(u16::from_le_bytes([bytes[1369], bytes[1370]]));
            if count > 204 || bytes.len() != 1375 + count * 243 {
                return Err("Invalid macro backup size");
            }
            for entry in bytes[1371..end].chunks_exact(243) {
                if entry[0] >= 204 || macros.insert(entry[0], entry[1..].to_vec()).is_some() {
                    return Err("Invalid macro backup index");
                }
            }
        }
        Ok(Self {
            macros,
            profile: bytes[14],
            release: u16::from_le_bytes([bytes[12], bytes[13]]),
            blocks,
        })
    }

    pub(super) fn with_config(&self, config: &StudioProfile) -> Result<Self, String> {
        config.validate_onboard()?;
        let mut changed = self.clone();
        changed.blocks[4] = config.merge_bindings(&self.blocks[4])?;
        for item in &config.macros {
            changed.macros.insert(item.index() as u8, item.encode()?);
        }
        if let Some(settings) = &config.firmware {
            changed.blocks[0][3] = settings.mode;
            if let Some(tuning) = &settings.tuning {
                let info = &mut changed.blocks[0];
                let mode = usize::from(settings.mode);
                info[4] = tuning.brightness;
                info[11 + mode] = tuning.speed;
                info[22 + mode] = u8::from(tuning.random_colors);
                for (bank, color) in tuning.colors.iter().enumerate() {
                    for (channel, value) in color.iter().enumerate() {
                        info[15 + 6 * mode + 2 * channel + bank] = *value;
                    }
                }
            }
            return Ok(changed);
        }
        let [rgb, mut frames, mut effects] = custom_data(&config.colors()?);
        frames.fill(0);
        frames[0] = config.frames.len() as u8;
        for (frame, data) in config.frames.iter().enumerate() {
            for &key in &data.keys {
                let index = KEYS[key].1 + 1;
                frames[1 + frame * 17 + index / 6] |= 1 << (index % 6);
            }
            frames[342 + frame * 2] = data.duration;
        }
        for ((_, offset), key) in KEYS.iter().zip(&config.keys) {
            let index = offset + 1;
            effects[index] = match key.effect {
                Effect::Static => 2,
                Effect::Breathing | Effect::Rainbow => 1,
                Effect::Cycle => 0,
            };
            effects[index + 102] = key.speed;
            effects[index + 204] = key.pause;
            if key.effect == Effect::Rainbow {
                effects[306 + index / 6] |= 1 << (index % 6);
            }
        }
        changed.blocks[1] = rgb;
        changed.blocks[2] = frames;
        changed.blocks[3] = effects;
        changed.blocks[0][3] = 15;
        changed.blocks[0][136] = 0;
        changed.blocks[0][137] = 1;
        changed.blocks[0][138] = 1;
        Ok(changed)
    }

    #[cfg(test)]
    pub(super) fn with_preset(&self, preset: Profile) -> Self {
        self.with_config(&preset.config()).unwrap()
    }

    pub(super) fn config(&self) -> Result<StudioProfile, String> {
        let mode = self.blocks[0][3];
        let firmware = if mode == 15 && self.blocks[0][136] == 0 {
            None
        } else {
            let mut settings = FirmwareSettings { mode, tuning: None };
            settings.validate()?;
            let info = &self.blocks[0];
            if let Some((min, max)) = settings.speed_limits() {
                let mode = usize::from(mode);
                if info[4] <= 20 && (min..=max).contains(&info[11 + mode]) && info[22 + mode] <= 1 {
                    settings.tuning = Some(FirmwareTuning {
                        brightness: info[4],
                        speed: info[11 + mode],
                        random_colors: info[22 + mode] == 1,
                        colors: std::array::from_fn(|bank| {
                            std::array::from_fn(|channel| info[15 + 6 * mode + 2 * channel + bank])
                        }),
                    });
                }
            }
            Some(settings)
        };
        let (keys, frames) = if firmware.is_some() {
            (
                vec![
                    KeyStyle {
                        color: [0; 3],
                        effect: Effect::Static,
                        speed: 1,
                        pause: 0
                    };
                    KEY_COUNT
                ],
                vec![Frame {
                    keys: (0..KEY_COUNT).collect(),
                    duration: 1,
                }],
            )
        } else {
            let rgb = &self.blocks[1];
            let effects = &self.blocks[3];
            let raw_frames = &self.blocks[2];
            if !(1..=20).contains(&raw_frames[0]) {
                return Err("Неизвестный формат кадров".into());
            }
            let keys = KEYS
                .iter()
                .map(|(_, offset)| {
                    let i = offset + 1;
                    let effect = match effects[i] {
                        0 => Effect::Cycle,
                        1 if effects[306 + i / 6] & (1 << (i % 6)) != 0 => Effect::Rainbow,
                        1 => Effect::Breathing,
                        _ => Effect::Static,
                    };
                    KeyStyle {
                        color: [rgb[i], rgb[i + 102], rgb[i + 204]],
                        effect,
                        speed: effects[i + 102].max(1),
                        pause: effects[i + 204],
                    }
                })
                .collect();
            let mut frames = Vec::new();
            for frame in 0..usize::from(raw_frames[0]) {
                if raw_frames[341 + frame * 2] != 0 {
                    return Err("Длительность кадра превышает поддерживаемый диапазон".into());
                }
                frames.push(Frame {
                    keys: KEYS
                        .iter()
                        .enumerate()
                        .filter(|(_, (_, offset))| {
                            let i = offset + 1;
                            raw_frames[1 + frame * 17 + i / 6] & (1 << (i % 6)) != 0
                        })
                        .map(|(key, _)| key)
                        .collect(),
                    duration: raw_frames[342 + frame * 2].max(1),
                });
            }
            (keys, frames)
        };
        let profile = StudioProfile {
            version: 1,
            id: format!("slot-{}", self.profile),
            name: format!("Слот {}", self.profile),
            description: "Импортировано из памяти клавиатуры".into(),
            reactive: None,
            firmware,
            brightness: 100,
            keys,
            frames,
            macros: KEYS
                .iter()
                .enumerate()
                .filter(|(_, (name, _))| *name != "fn")
                .flat_map(|(key, (_, offset))| {
                    [Layer::Base, Layer::Fn]
                        .into_iter()
                        .filter_map(move |layer| {
                            let index =
                                (offset + 1 + if layer == Layer::Fn { 102 } else { 0 }) as u8;
                            if self.blocks[4][usize::from(index)] != 0xb2 {
                                return None;
                            }
                            self.macros
                                .get(&index)
                                .and_then(|data| MacroBinding::decode(key, layer, data).ok())
                        })
                })
                .collect(),
            bindings: KEYS
                .iter()
                .enumerate()
                .filter(|(_, (name, _))| *name != "fn")
                .flat_map(|(key, (_, offset))| {
                    [Layer::Base, Layer::Fn]
                        .into_iter()
                        .filter_map(move |layer| {
                            let action = self.blocks[4]
                                [offset + 1 + if layer == Layer::Fn { 102 } else { 0 }];
                            supported_action(action).then_some(Binding { key, layer, action })
                        })
                })
                .collect(),
        };
        profile.validate()?;
        Ok(profile)
    }
}

pub(super) fn custom_data(colors: &[[u8; 3]; KEY_COUNT]) -> [Vec<u8>; 3] {
    let mut rgb = vec![0; 306];
    let mut frames = vec![0; 381];
    let mut effects = vec![0; 323];
    frames[0] = 1;
    frames[342] = 1;
    effects[..102].fill(2);
    for ((_, offset), color) in KEYS.iter().zip(colors) {
        // Stored layouts reserve matrix index zero; direct RGB does not.
        let index = offset + 1;
        for (channel, value) in color.iter().enumerate() {
            rgb[index + channel * 102] = *value;
        }
        frames[1 + index / 6] |= 1 << (index % 6);
    }
    [rgb, frames, effects]
}
