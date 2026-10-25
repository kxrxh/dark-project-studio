use crate::{
    model::Layer,
    protocol::{KEY_COUNT, KEYS},
};
use serde::{Deserialize, Serialize};

pub const MACRO_BYTES: usize = 242;
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroEvent {
    pub code: u8,
    pub down: bool,
    pub delay_ms: u16,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MacroBinding {
    pub key: usize,
    pub layer: Layer,
    pub name: String,
    pub repeat: u8,
    pub events: Vec<MacroEvent>,
}
impl MacroBinding {
    pub fn index(&self) -> usize {
        KEYS[self.key].1 + 1 + if self.layer == Layer::Fn { 102 } else { 0 }
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.key >= KEY_COUNT
            || KEYS[self.key].0 == "fn"
            || self.name.trim().is_empty()
            || self.name.chars().count() > 64
        {
            return Err("Укажите клавишу и название макроса; Fn защищена".into());
        }
        if self.repeat == 0 || self.repeat > 32 || self.events.is_empty() || self.events.len() > 80
        {
            return Err("Макрос: 1–32 повтора, от 1 до 80 событий".into());
        }
        let mut held = [false; 256];
        for event in &self.events {
            if !matches!(event.code,4..=0x73|0xe0..=0xe7)
                || !(20..=5000).contains(&event.delay_ms)
                || event.delay_ms % 20 != 0
            {
                return Err("Используйте клавиши и задержки 20–5000 мс с шагом 20 мс".into());
            }
            let pressed = &mut held[usize::from(event.code)];
            if *pressed == event.down {
                return Err("У каждого нажатия должно быть одно отпускание".into());
            }
            *pressed = event.down;
            if held[4..=0x73].iter().filter(|value| **value).count() > 6 {
                return Err("Одновременно допускается не больше 6 обычных клавиш".into());
            }
        }
        if held.iter().any(|value| *value) {
            return Err("Макрос оставляет нажатые клавиши. Добавьте отпускания".into());
        }
        Ok(())
    }
    pub fn encode(&self) -> Result<Vec<u8>, String> {
        self.validate()?;
        let mut data = vec![0; MACRO_BYTES];
        data[1] = self.repeat;
        for (i, event) in self.events.iter().enumerate() {
            let delay = event.delay_ms / 20;
            data[2 + i * 3] = (delay >> 8) as u8 | if event.down { 0x80 } else { 0 };
            data[3 + i * 3] = delay as u8;
            data[4 + i * 3] = event.code;
        }
        Ok(data)
    }
    pub fn decode(key: usize, layer: Layer, data: &[u8]) -> Result<Self, String> {
        if data.len() != MACRO_BYTES || data[0] != 0 {
            return Err("Неизвестный формат макроса".into());
        }
        let mut events = vec![];
        let mut ended = false;
        for chunk in data[2..].chunks_exact(3) {
            if chunk == [0, 0, 0] {
                ended = true;
                continue;
            }
            if ended {
                return Err("Неизвестная последовательность макроса".into());
            }
            let delay = u16::from_be_bytes([chunk[0] & 0x7f, chunk[1]])
                .checked_mul(20)
                .ok_or("Слишком длинная задержка")?;
            events.push(MacroEvent {
                code: chunk[2],
                down: chunk[0] & 0x80 != 0,
                delay_ms: delay,
            });
        }
        let value = Self {
            key,
            layer,
            name: "Макрос из клавиатуры".into(),
            repeat: data[1],
            events,
        };
        value.validate()?;
        Ok(value)
    }
    pub fn packet(&self, profile: u8) -> Result<[u8; 256], String> {
        if !(1..=4).contains(&profile) {
            return Err("Некорректный слот".into());
        }
        let data = self.encode()?;
        let mut packet = [0; 256];
        packet[..4].copy_from_slice(&[8, 5, profile, self.index() as u8]);
        packet[4..246].copy_from_slice(&data);
        Ok(packet)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Layer;
    fn sample() -> MacroBinding {
        MacroBinding {
            key: 12,
            layer: Layer::Fn,
            name: "Copy".into(),
            repeat: 2,
            events: vec![
                MacroEvent {
                    code: 0xe0,
                    down: true,
                    delay_ms: 20,
                },
                MacroEvent {
                    code: 6,
                    down: true,
                    delay_ms: 40,
                },
                MacroEvent {
                    code: 6,
                    down: false,
                    delay_ms: 20,
                },
                MacroEvent {
                    code: 0xe0,
                    down: false,
                    delay_ms: 20,
                },
            ],
        }
    }
    #[test]
    fn encodes_balanced_chord_delays_and_repeat_in_firmware_format() {
        let config = sample();
        let data = config.encode().unwrap();
        assert_eq!(
            &data[..14],
            &[0, 2, 0x80, 1, 0xe0, 0x80, 2, 6, 0, 1, 6, 0, 1, 0xe0]
        );
        assert!(data[14..].iter().all(|b| *b == 0));
        assert_eq!(
            MacroBinding::decode(12, Layer::Fn, &data).unwrap().events,
            config.events
        );
        let packet = config.packet(4).unwrap();
        assert_eq!(&packet[..4], &[8, 5, 4, 180]);
        assert_eq!(&packet[4..246], data.as_slice());
        assert_eq!(&packet[246..], &[0; 10]);
    }
    #[test]
    fn rejects_stuck_keys_duplicate_presses_unbounded_repeats_and_bad_delays() {
        let mut m = sample();
        m.events.pop();
        assert!(m.validate().is_err());
        let mut m = sample();
        m.events[2].down = true;
        assert!(m.validate().is_err());
        let mut m = sample();
        m.repeat = 0;
        assert!(m.validate().is_err());
        let mut m = sample();
        m.events[0].delay_ms = 21;
        assert!(m.validate().is_err());
        let mut m = sample();
        m.key = 81;
        assert!(m.validate().is_err());
        let mut m = sample();
        m.events = sample().events.repeat(21);
        assert!(m.validate().is_err());
    }
    #[test]
    fn validates_real_storage_length_and_does_not_import_unknown_sequences() {
        assert!(MacroBinding::decode(12, Layer::Fn, &[0xff; 242]).is_err());
        assert!(MacroBinding::decode(12, Layer::Fn, &[0; 241]).is_err());
    }
}
