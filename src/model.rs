use crate::protocol::{KEY_COUNT, KEYS};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Static,
    Breathing,
    Cycle,
    Rainbow,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyStyle {
    pub color: [u8; 3],
    pub effect: Effect,
    pub speed: u8,
    pub pause: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub keys: Vec<usize>,
    pub duration: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Layer {
    Base,
    Fn,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub key: usize,
    pub layer: Layer,
    pub action: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FirmwareSettings {
    pub mode: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tuning: Option<FirmwareTuning>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FirmwareTuning {
    pub brightness: u8,
    pub speed: u8,
    pub colors: [[u8; 3]; 2],
    pub random_colors: bool,
}

impl FirmwareSettings {
    pub fn speed_limits(&self) -> Option<(u8, u8)> {
        match self.mode {
            6 | 10 => Some((10, 100)),
            7 => Some((0, 100)),
            8 => Some((10, 110)),
            9 => Some((0, 110)),
            _ => None,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.mode, 0..=4 | 6..=10) {
            return Err("Неизвестный встроенный эффект клавиатуры".into());
        }
        if let Some(tuning) = &self.tuning {
            let Some((min, max)) = self.speed_limits() else {
                return Err("Настройка этого встроенного эффекта пока не поддерживается".into());
            };
            if tuning.brightness > 20 || !(min..=max).contains(&tuning.speed) {
                return Err(
                    "Яркость или скорость встроенной реакции вне допустимого диапазона".into(),
                );
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudioProfile {
    pub version: u8,
    pub id: String,
    pub name: String,
    pub description: String,
    pub brightness: u8,
    pub keys: Vec<KeyStyle>,
    pub frames: Vec<Frame>,
    pub bindings: Vec<Binding>,
    #[serde(default)]
    pub macros: Vec<crate::macros::MacroBinding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reactive: Option<crate::legacy::Settings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub firmware: Option<FirmwareSettings>,
}

impl StudioProfile {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("Версия формата профиля не поддерживается".into());
        }
        if self.id.is_empty()
            || self.id.len() > 64
            || !self
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("Некорректный идентификатор профиля".into());
        }
        if self.name.trim().is_empty()
            || self.name.chars().count() > 64
            || self.description.chars().count() > 240
        {
            return Err("Название должно содержать от 1 до 64 символов".into());
        }
        if self.keys.len() != KEY_COUNT
            || self.brightness > 100
            || self.keys.iter().any(|key| key.speed == 0)
        {
            return Err("Профиль должен содержать 87 клавиш и яркость от 0 до 100".into());
        }
        if self
            .keys
            .iter()
            .any(|key| key.effect == Effect::Cycle && key.pause > 5)
        {
            return Err("Начальная фаза смены цветов должна быть от 0 до 5".into());
        }
        if self.frames.is_empty() || self.frames.len() > 20 {
            return Err("В анимации должно быть от 1 до 20 кадров".into());
        }
        for frame in &self.frames {
            let mut seen = [false; KEY_COUNT];
            if frame.duration == 0 {
                return Err("Минимальная длительность кадра — 0,1 секунды".into());
            }
            for &key in &frame.keys {
                if key >= KEY_COUNT || seen[key] {
                    return Err("Некорректная маска кадра".into());
                }
                seen[key] = true;
            }
        }
        if let Some(settings) = &self.reactive {
            settings.validate()?;
        }
        if let Some(settings) = &self.firmware {
            settings.validate()?;
            if self.reactive.is_some() {
                return Err("Выберите встроенный эффект или реакцию через Studio".into());
            }
        }
        let mut seen = [[false; KEY_COUNT]; 2];
        for binding in &self.bindings {
            let layer = usize::from(binding.layer == Layer::Fn);
            if binding.key >= KEY_COUNT || KEYS[binding.key].0 == "fn" || seen[layer][binding.key] {
                return Err("Назначения повторяются или изменяют защищённую клавишу Fn".into());
            }
            if !supported_action(binding.action) {
                return Err("Это назначение клавиши пока не поддерживается".into());
            }
            seen[layer][binding.key] = true;
        }
        for item in &self.macros {
            item.validate()?;
            let layer = usize::from(item.layer == Layer::Fn);
            if seen[layer][item.key] {
                return Err("У клавиши уже есть назначение в этом слое".into());
            }
            seen[layer][item.key] = true;
        }
        Ok(())
    }

    pub fn validate_onboard(&self) -> Result<(), String> {
        self.validate()?;
        if self.reactive.is_some() {
            return Err(
                "Реактивная подсветка работает через Studio и не записывается в память клавиатуры"
                    .into(),
            );
        }
        Ok(())
    }

    pub fn colors(&self) -> Result<[[u8; 3]; KEY_COUNT], String> {
        self.validate()?;
        let mut colors = [[0; 3]; KEY_COUNT];
        for (color, key) in colors.iter_mut().zip(&self.keys) {
            let source = if key.effect == Effect::Cycle {
                [255; 3]
            } else {
                key.color
            };
            for (channel, value) in color.iter_mut().zip(source) {
                *channel = (u16::from(value) * u16::from(self.brightness) / 100) as u8;
            }
        }
        Ok(colors)
    }

    pub fn merge_bindings(&self, original: &[u8]) -> Result<Vec<u8>, String> {
        self.validate()?;
        if original.len() != 204 {
            return Err("Не удалось получить полную раскладку клавиатуры".into());
        }
        let mut changed = original.to_vec();
        for binding in &self.bindings {
            let index = KEYS[binding.key].1 + 1 + if binding.layer == Layer::Fn { 102 } else { 0 };
            changed[index] = binding.action;
        }
        for item in &self.macros {
            changed[item.index()] = 0xb2;
        }
        Ok(changed)
    }
}

pub fn supported_action(action: u8) -> bool {
    matches!(action, 0 | 4..=0x73 | 0xa5..=0xab | 0xad..=0xb0 | 0xe0..=0xe7)
}

#[cfg(test)]
mod tests {
    use super::*;
    pub fn profile() -> StudioProfile {
        StudioProfile {
            version: 1,
            id: "custom-1".into(),
            name: "Мой профиль".into(),
            description: String::new(),
            brightness: 50,
            keys: vec![
                KeyStyle {
                    color: [200, 100, 50],
                    effect: Effect::Static,
                    speed: 1,
                    pause: 32
                };
                87
            ],
            frames: vec![Frame {
                keys: (0..87).collect(),
                duration: 1,
            }],
            bindings: vec![],
            macros: vec![],
            reactive: None,
            firmware: None,
        }
    }
    #[test]
    fn factory_tuning_accepts_reaction_ranges_and_rejects_malformed_parameters() {
        let mut json = serde_json::to_value(profile()).unwrap();
        json["firmware"] = serde_json::json!({"mode":8,"tuning":{"brightness":12,"speed":50,"colors":[[10,20,30],[40,50,60]],"randomColors":false}});
        let parsed = serde_json::from_value::<StudioProfile>(json.clone());
        assert!(parsed.is_ok(), "reaction tuning must deserialize");
        assert!(parsed.unwrap().validate_onboard().is_ok());
        for (field, value) in [("brightness", 21), ("speed", 9), ("speed", 111)] {
            let mut bad = json.clone();
            bad["firmware"]["tuning"][field] = serde_json::json!(value);
            assert!(
                serde_json::from_value::<StudioProfile>(bad)
                    .unwrap()
                    .validate()
                    .is_err()
            );
        }
        json["firmware"]["mode"] = serde_json::json!(0);
        assert!(
            serde_json::from_value::<StudioProfile>(json)
                .unwrap()
                .validate()
                .is_err()
        );
    }

    #[test]
    fn accepts_only_documented_factory_modes_and_excludes_live_reactions() {
        let mut json = serde_json::to_value(profile()).unwrap();
        for mode in [0, 1, 2, 3, 4, 6, 7, 8, 9, 10] {
            json["firmware"] = serde_json::json!({"mode": mode});
            let parsed = serde_json::from_value::<StudioProfile>(json.clone());
            assert!(parsed.is_ok(), "factory mode {mode} must load");
            assert!(parsed.unwrap().validate_onboard().is_ok());
        }
        for mode in [5, 11, 15, 255] {
            json["firmware"] = serde_json::json!({"mode": mode});
            assert!(
                serde_json::from_value::<StudioProfile>(json.clone())
                    .map_or(true, |profile| profile.validate().is_err())
            );
        }
        json["firmware"] = serde_json::json!({"mode": 6});
        json["reactive"] = serde_json::json!({"kind":"flash", "colors":[[255,0,0]], "lifetimeMs":600, "speed":1, "background":0});
        assert!(
            serde_json::from_value::<StudioProfile>(json)
                .map_or(true, |profile| profile.validate().is_err())
        );
    }

    #[test]
    fn live_profiles_validate_for_library_but_not_for_onboard_storage() {
        let mut profile = profile();
        profile.reactive = Some(crate::legacy::Settings {
            kind: crate::legacy::Kind::Ripple,
            colors: vec![[0, 255, 255]],
            lifetime_ms: 1600,
            speed: 2,
            background: 0,
        });
        assert!(profile.validate().is_ok());
        assert!(profile.validate_onboard().is_err());
        profile.reactive = None;
        assert!(profile.validate_onboard().is_ok());
    }

    #[test]
    fn validates_a_custom_profile_and_scales_brightness_without_overflow() {
        let p = profile();
        assert!(p.validate().is_ok());
        assert_eq!(p.colors().unwrap()[0], [100, 50, 25]);
    }
    #[test]
    fn rejects_malformed_imports_and_frame_limits() {
        let p = profile();
        let mut bad = p.clone();
        bad.keys.pop();
        assert!(bad.validate().is_err());
        let mut bad = p.clone();
        bad.brightness = 101;
        assert!(bad.validate().is_err());
        let mut bad = p.clone();
        bad.version = 2;
        assert!(bad.validate().is_err());
        let mut bad = p.clone();
        bad.frames = vec![p.frames[0].clone(); 21];
        assert!(bad.validate().is_err());
        let mut bad = p.clone();
        bad.frames[0].keys = vec![87];
        assert!(bad.validate().is_err());
        let mut bad = p;
        bad.frames[0].duration = 0;
        assert!(bad.validate().is_err());
    }

    #[test]
    fn color_cycle_uses_white_channels_and_only_six_firmware_start_stages() {
        let mut p = profile();
        p.keys[0].effect = Effect::Cycle;
        p.keys[0].pause = 5;
        assert_eq!(p.colors().unwrap()[0], [127, 127, 127]);
        p.keys[0].pause = 6;
        assert!(p.validate().is_err());
    }
    #[test]
    fn remaps_only_the_selected_key_and_layer_preserving_every_other_byte() {
        let mut p = profile();
        p.bindings = vec![Binding {
            key: 1,
            layer: Layer::Fn,
            action: 0xb0,
        }];
        let original: Vec<u8> = (0..204).map(|n| n as u8).collect();
        let changed = p.merge_bindings(&original).unwrap();
        let mut expected = original;
        expected[114] = 0xb0;
        assert_eq!(changed, expected);
    }
    #[test]
    fn rejects_fn_key_rebinding_duplicate_assignments_and_unsafe_actions() {
        let mut p = profile();
        p.bindings = vec![Binding {
            key: 81,
            layer: Layer::Base,
            action: 0,
        }];
        assert!(p.validate().is_err());
        p.bindings = vec![Binding {
            key: 1,
            layer: Layer::Fn,
            action: 0xff,
        }];
        assert!(p.validate().is_err());
        p.bindings = vec![
            Binding {
                key: 1,
                layer: Layer::Fn,
                action: 4
            };
            2
        ];
        assert!(p.validate().is_err());
        assert!(profile().merge_bindings(&[0; 203]).is_err());
    }
}
