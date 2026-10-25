use crate::macros::{MACRO_BYTES, MacroBinding};
use crate::model::{
    Binding, Effect, FirmwareSettings, FirmwareTuning, Frame, KeyStyle, Layer, StudioProfile,
    supported_action,
};
#[cfg(test)]
use crate::profiles::Profile;
use crate::protocol::{KEY_COUNT, KEYS};
use crate::usb;
use nusb::transfer::{Interrupt, Out};
use std::collections::BTreeMap;
use std::error::Error;
use std::{
    fs::OpenOptions,
    io::Write,
    path::Path,
    time::{Duration, Instant},
};

type DeviceResult<T> = Result<T, Box<dyn Error>>;

const BLOCKS: [(u8, usize); 5] = [
    (0x02, 139),
    (0x08, 306),
    (0x09, 381),
    (0x0a, 323),
    (0x03, 204),
];

#[derive(Clone, Debug, PartialEq)]
struct Snapshot {
    profile: u8,
    release: u16,
    blocks: [Vec<u8>; 5],
    macros: BTreeMap<u8, Vec<u8>>,
}

impl Snapshot {
    fn encode(&self) -> Vec<u8> {
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

    fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
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

    fn with_config(&self, config: &StudioProfile) -> Result<Self, String> {
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
    fn with_preset(&self, preset: Profile) -> Self {
        self.with_config(&preset.config()).unwrap()
    }

    fn config(&self) -> Result<StudioProfile, String> {
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

fn custom_data(colors: &[[u8; 3]; KEY_COUNT]) -> [Vec<u8>; 3] {
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

fn packets(profile: u8, block: usize, data: &[u8]) -> Result<Vec<[u8; 256]>, &'static str> {
    let &(opcode, length) = BLOCKS.get(block).ok_or("Invalid profile data block.")?;
    if !(1..=4).contains(&profile) || data.len() != length {
        return Err("Invalid profile number or data length.");
    }
    if block == 0 || block == 4 {
        let mut packet = [0; 256];
        packet[..4].copy_from_slice(&[8, opcode, profile, 0]);
        packet[4..4 + data.len()].copy_from_slice(data);
        return Ok(vec![packet]);
    }
    let mut reports = vec![[0; 256]; 2];
    for (index, report) in reports.iter_mut().enumerate() {
        report[..5].copy_from_slice(&[8, opcode, profile, 0, index as u8]);
        let start = index * 251;
        let length = (data.len() - start).min(251);
        report[5..5 + length].copy_from_slice(&data[start..start + length]);
    }
    Ok(reports)
}

fn checksum(bytes: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for byte in bytes {
        a = (a + u32::from(*byte)) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

fn validate_ack(report: &[u8], opcode: u8, profile: u8) -> Result<(), &'static str> {
    validate_ack_for(report, opcode, profile, 0)
}
fn validate_ack_for(report: &[u8], opcode: u8, profile: u8, index: u8) -> Result<(), &'static str> {
    if report == [4, 0xf8, opcode, profile, index, 0, 0, 0, 0] {
        Ok(())
    } else {
        Err("Unexpected keyboard completion report; stopping.")
    }
}
fn collect_response(
    opcode: u8,
    profile: u8,
    length: usize,
    next: impl FnMut() -> DeviceResult<[u8; 9]>,
) -> DeviceResult<Vec<u8>> {
    collect_response_for(opcode, profile, 0, length, next)
}
fn collect_response_for(
    opcode: u8,
    profile: u8,
    index: u8,
    length: usize,
    mut next: impl FnMut() -> DeviceResult<[u8; 9]>,
) -> DeviceResult<Vec<u8>> {
    let mut data = Vec::with_capacity(length.div_ceil(8) * 8);
    for _ in 0..length.div_ceil(8) {
        data.extend_from_slice(&next()?[1..]);
    }
    validate_ack_for(&next()?, opcode, profile, index)?;
    data.truncate(length);
    Ok(data)
}

struct Connection {
    _interface: nusb::Interface,
    output: nusb::Endpoint<Interrupt, Out>,
    input: hidapi::HidDevice,
    release: u16,
}

impl Connection {
    fn open() -> DeviceResult<Self> {
        let interface = usb::lighting_interface()?;
        let api = hidapi::HidApi::new()?;
        let info = api
            .device_list()
            .find(|device| {
                device.vendor_id() == usb::VID
                    && device.product_id() == usb::PID
                    && device.interface_number() == 1
                    && device.usage_page() == 1
                    && device.usage() == 2
            })
            .ok_or("KD3B vendor input interface not found.")?;
        if info.release_number() != 0x3131 {
            return Err("Onboard operations currently require USB device revision 0x3131.".into());
        }
        let input = info.open_device(&api)?;
        let mut buffer = [0; 64];
        for _ in 0..128 {
            if input.read_timeout(&mut buffer, 0)? == 0 {
                break;
            }
        }
        Ok(Self {
            output: interface.endpoint::<Interrupt, Out>(3)?,
            _interface: interface,
            input,
            release: info.release_number(),
        })
    }

    fn send(&mut self, packet: &[u8; 256]) -> DeviceResult<()> {
        let completion = self
            .output
            .transfer_blocking(packet.to_vec().into(), Duration::from_secs(2));
        completion.status?;
        if completion.actual_len != 256 {
            return Err("Short onboard report write; stopping.".into());
        }
        Ok(())
    }

    fn report(&self, deadline: Instant) -> DeviceResult<[u8; 9]> {
        let mut buffer = [0; 64];
        while Instant::now() < deadline {
            let length = self.input.read_timeout(&mut buffer, 100)?;
            // Other report IDs may contain input events; never retain or log them.
            if length > 0 && buffer[0] == 4 {
                return buffer[..length]
                    .try_into()
                    .map_err(|_| "Invalid vendor report length.".into());
            }
        }
        Err("Timed out waiting for the keyboard; stopping without retry.".into())
    }

    fn read(&mut self, profile: u8, block: usize) -> DeviceResult<Vec<u8>> {
        let (opcode, length) = BLOCKS[block];
        let mut request = [0; 256];
        request[..4].copy_from_slice(&[8, opcode | 0x80, profile, 0]);
        self.send(&request)?;
        let deadline = Instant::now() + Duration::from_secs(3);
        collect_response(opcode | 0x80, profile, length, || self.report(deadline))
    }

    fn snapshot_blocks(&mut self, profile: u8) -> DeviceResult<Snapshot> {
        let mut blocks = std::array::from_fn(|_| Vec::new());
        for (index, block) in blocks.iter_mut().enumerate() {
            *block = self.read(profile, index)?;
            if *block != self.read(profile, index)? {
                return Err("Keyboard readbacks differ; refusing to write".into());
            }
        }
        Ok(Snapshot {
            profile,
            release: self.release,
            blocks,
            macros: BTreeMap::new(),
        })
    }
    fn snapshot(&mut self, profile: u8, extra: &[u8]) -> DeviceResult<Snapshot> {
        let mut snapshot = self.snapshot_blocks(profile)?;
        let indexes: std::collections::BTreeSet<u8> = snapshot.blocks[4]
            .iter()
            .enumerate()
            .filter(|(_, action)| **action == 0xb2)
            .map(|(index, _)| index as u8)
            .chain(extra.iter().copied())
            .collect();
        for index in indexes {
            let data = self.read_macro(profile, index)?;
            if data != self.read_macro(profile, index)? {
                return Err("Macro readbacks differ; refusing to write".into());
            }
            snapshot.macros.insert(index, data);
        }
        Ok(snapshot)
    }

    fn active(&mut self) -> DeviceResult<u8> {
        let mut request = [0; 256];
        request[..2].copy_from_slice(&[8, 0x81]);
        self.send(&request)?;
        let deadline = Instant::now() + Duration::from_secs(3);
        let data = collect_response(0x81, 0, 1, || self.report(deadline))?;
        if !(1..=4).contains(&data[0]) {
            return Err("Invalid active hardware profile".into());
        }
        Ok(data[0])
    }
    fn select(&mut self, profile: u8) -> DeviceResult<()> {
        if !(1..=4).contains(&profile) {
            return Err("Invalid hardware profile".into());
        }
        let mut packet = [0; 256];
        packet[..3].copy_from_slice(&[8, 1, profile]);
        self.send(&packet)?;
        validate_ack(
            &self.report(Instant::now() + Duration::from_secs(3))?,
            1,
            profile,
        )?;
        Ok(())
    }
    fn with_macro_profile<T>(
        &mut self,
        profile: u8,
        operation: impl FnOnce(&mut Self) -> DeviceResult<T>,
    ) -> DeviceResult<T> {
        let active = self.active()?;
        let result = (|| {
            self.select(profile)?;
            operation(self)
        })();
        if active != profile {
            if let Err(error) = self.select(active) {
                return Err(format!(
                    "Could not restore active slot {active}: {error}; operation result: {}",
                    result
                        .as_ref()
                        .err()
                        .map(|e| e.to_string())
                        .unwrap_or_else(|| "completed".into())
                )
                .into());
            }
        }
        result
    }
    fn read_macro_selected(&mut self, profile: u8, index: u8) -> DeviceResult<Vec<u8>> {
        if !(1..=4).contains(&profile) || index >= 204 {
            return Err("Invalid macro address".into());
        }
        let mut packet = [0; 256];
        packet[..4].copy_from_slice(&[8, 0x85, profile, index]);
        self.send(&packet)?;
        let deadline = Instant::now() + Duration::from_secs(3);
        collect_response_for(0x85, profile, index, MACRO_BYTES, || self.report(deadline))
    }
    fn read_macro(&mut self, profile: u8, index: u8) -> DeviceResult<Vec<u8>> {
        // Macro commands 05/85 ignore their profile field and use the active slot.
        self.with_macro_profile(profile, |connection| {
            connection.read_macro_selected(profile, index)
        })
    }
    fn write_macros(&mut self, desired: &Snapshot, previous: &Snapshot) -> DeviceResult<()> {
        if desired
            .macros
            .iter()
            .all(|(index, data)| previous.macros.get(index) == Some(data))
        {
            return Ok(());
        }
        self.with_macro_profile(desired.profile, |connection| {
            for (&index, data) in &desired.macros {
                if previous.macros.get(&index) == Some(data) {
                    continue;
                }
                if index >= 204 || data.len() != MACRO_BYTES {
                    return Err("Invalid macro snapshot".into());
                }
                let mut packet = [0; 256];
                packet[..4].copy_from_slice(&[8, 5, desired.profile, index]);
                packet[4..246].copy_from_slice(data);
                connection.send(&packet)?;
                validate_ack_for(
                    &connection.report(Instant::now() + Duration::from_secs(3))?,
                    5,
                    desired.profile,
                    index,
                )?;
                // Reload the slot before checking persistence, rather than trusting an immediate echo.
                connection.select(desired.profile)?;
                if connection.read_macro_selected(desired.profile, index)? != *data {
                    return Err("Macro readback mismatch; restore backup".into());
                }
            }
            Ok(())
        })
    }

    fn write_verified(&mut self, snapshot: &Snapshot, block: usize) -> DeviceResult<()> {
        for packet in packets(snapshot.profile, block, &snapshot.blocks[block])? {
            self.send(&packet)?;
            validate_ack(
                &self.report(Instant::now() + Duration::from_secs(3))?,
                BLOCKS[block].0,
                snapshot.profile,
            )?;
        }
        if self.read(snapshot.profile, block)? != snapshot.blocks[block] {
            return Err(
                "Stored data did not match the requested profile; use the backup to restore."
                    .into(),
            );
        }
        Ok(())
    }
}

pub fn save(profile: u8, config: &StudioProfile, backup: &Path) -> DeviceResult<HardwareProfile> {
    if !(1..=4).contains(&profile) {
        return Err("Hardware profile must be 1 through 4.".into());
    }
    config.validate_onboard()?;
    let mut connection = Connection::open()?;
    let extra: Vec<u8> = config
        .macros
        .iter()
        .map(|item| item.index() as u8)
        .collect();
    let original = connection.snapshot(profile, &extra)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(backup)?;
    file.write_all(&original.encode())?;
    file.sync_all()?;
    let desired = original.with_config(config)?;
    // The firmware retains macro cells only when their keymap marker is already installed.
    if desired.blocks[4] != original.blocks[4] {
        connection.write_verified(&desired, 4)?;
    }
    connection.write_macros(&desired, &original)?;
    // Publish the selected mode only after lighting and keymap data verify.
    for block in [1, 2, 3, 0] {
        if desired.blocks[block] != original.blocks[block] {
            connection.write_verified(&desired, block)?;
        }
    }
    connection.select(profile).map_err(|error| {
        format!("Профиль записан и проверен, но переключение не удалось: {error}")
    })?;
    Ok(describe_profile(desired))
}

pub fn restore(backup: &Path, safety_backup: &Path) -> DeviceResult<()> {
    let original = Snapshot::decode(&std::fs::read(backup)?)?;
    let mut connection = Connection::open()?;
    if connection.release != original.release {
        return Err("Backup device revision does not match the keyboard.".into());
    }
    let extra: Vec<u8> = original.macros.keys().copied().collect();
    let current = connection.snapshot(original.profile, &extra)?;
    let mut safety = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(safety_backup)?;
    safety.write_all(&current.encode())?;
    safety.sync_all()?;
    if !original.blocks[4].is_empty() {
        connection.write_verified(&original, 4)?;
    }
    connection.write_macros(&original, &current)?;
    // Restore the old mode first, before restoring possibly unused custom data.
    for block in 0..4 {
        if !original.blocks[block].is_empty() {
            connection.write_verified(&original, block)?;
        }
    }
    Ok(())
}

pub fn reload_active_profile() -> DeviceResult<u8> {
    let mut connection = Connection::open()?;
    let active = connection.active()?;
    connection.select(active)?;
    Ok(active)
}

pub fn select(profile: u8) -> DeviceResult<()> {
    Connection::open()?.select(profile)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub base: Vec<u8>,
    pub function: Vec<u8>,
    pub config: Option<StudioProfile>,
    pub notice: Option<String>,
}

pub fn read_profile(profile: u8) -> DeviceResult<HardwareProfile> {
    if !(1..=4).contains(&profile) {
        return Err("Invalid hardware profile".into());
    }
    Ok(describe_profile(
        Connection::open()?.snapshot(profile, &[])?,
    ))
}
/// Automatic discovery reads configuration only; it must not temporarily activate another keymap.
pub fn read_profile_summary(profile: u8) -> DeviceResult<HardwareProfile> {
    if !(1..=4).contains(&profile) {
        return Err("Invalid hardware profile".into());
    }
    Ok(describe_profile(
        Connection::open()?.snapshot_blocks(profile)?,
    ))
}
fn describe_profile(snapshot: Snapshot) -> HardwareProfile {
    let (config, notice) = match snapshot.config() {
        Ok(config) => (Some(config), None),
        Err(error) => (None, Some(error)),
    };
    HardwareProfile {
        base: KEYS
            .iter()
            .map(|(_, offset)| snapshot.blocks[4][offset + 1])
            .collect(),
        function: KEYS
            .iter()
            .map(|(_, offset)| snapshot.blocks[4][offset + 103])
            .collect(),
        config,
        notice,
    }
}

pub fn active_profile() -> DeviceResult<u8> {
    Connection::open()?.active()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readback_treats_ack_like_color_bytes_as_data_and_consumes_the_trailer() {
        let mut reports = [
            [4, 0xf8, 0x88, 4, 0, 0, 0, 0, 0],
            [4, 0xf8, 0x88, 4, 0, 0, 0, 0, 0],
        ]
        .into_iter();
        let data = collect_response(0x88, 4, 3, || {
            reports.next().ok_or_else(|| "End of stream".into())
        })
        .unwrap();
        assert_eq!(data, [0xf8, 0x88, 4]);
        assert!(reports.next().is_none());
    }

    #[test]
    fn readback_rejects_a_missing_completion_trailer() {
        let mut reports = [[4; 9]].into_iter();
        assert!(
            collect_response(0x88, 4, 3, || reports
                .next()
                .ok_or_else(|| "End of stream".into()))
            .is_err()
        );
    }

    fn snapshot() -> Snapshot {
        Snapshot {
            profile: 4,
            release: 0x3131,
            macros: BTreeMap::new(),
            blocks: BLOCKS.map(|(opcode, size)| {
                (0..size)
                    .map(|index| (index as u8).wrapping_add(opcode))
                    .collect()
            }),
        }
    }

    #[test]
    fn reaction_tuning_changes_only_proven_fields_and_roundtrips_colors_and_speed() {
        for (mode, first_color) in [(6, 51), (7, 57), (8, 63), (9, 69), (10, 75)] {
            let original = snapshot();
            let mut json = serde_json::to_value(Profile::Cyberpunk.config()).unwrap();
            json["firmware"] = serde_json::json!({"mode":mode,"tuning":{"brightness":12,"speed":50,"colors":[[10,20,30],[40,50,60]],"randomColors":true}});
            let profile: StudioProfile = serde_json::from_value(json).unwrap();
            let desired = original.with_config(&profile).unwrap();
            let mut expected = original.clone();
            expected.blocks[0][3] = mode;
            expected.blocks[0][4] = 12;
            expected.blocks[0][11 + usize::from(mode)] = 50;
            expected.blocks[0][22 + usize::from(mode)] = 1;
            expected.blocks[0][first_color..first_color + 6]
                .copy_from_slice(&[10, 40, 20, 50, 30, 60]);
            assert_eq!(desired, expected);
            assert_eq!(desired.config().unwrap().firmware, profile.firmware);
        }
    }

    #[test]
    fn factory_selection_preserves_all_other_device_settings_and_custom_programs() {
        let original = snapshot();
        let mut json = serde_json::to_value(Profile::Cyberpunk.config()).unwrap();
        json["firmware"] = serde_json::json!({"mode": 7});
        let profile: StudioProfile = serde_json::from_value(json).unwrap();
        let desired = original.with_config(&profile).unwrap();
        let mut expected = original.clone();
        expected.blocks[0][3] = 7;
        assert_eq!(desired, expected);
        assert_eq!(
            &packets(4, 0, &desired.blocks[0]).unwrap()[0][..8],
            &[8, 2, 4, 0, 2, 3, 4, 7]
        );
    }

    #[test]
    fn factory_readback_does_not_parse_unused_custom_frames_and_keeps_bindings() {
        let mut original = snapshot();
        original.blocks[0][3] = 8;
        original.blocks[2].fill(0xff);
        original.blocks[4].fill(0xff);
        original.blocks[4][14] = 0x1a;
        let config = original.config().unwrap();
        assert_eq!(
            serde_json::to_value(&config).unwrap()["firmware"],
            serde_json::json!({"mode":8})
        );
        assert!(config.reactive.is_none());
        assert_eq!(config.bindings.len(), 1);
        assert_eq!(config.bindings[0].action, 0x1a);
        assert_eq!(original.with_config(&config).unwrap(), original);
    }

    #[test]
    fn cyberpunk_sweeps_a_three_column_band_in_seventeen_onboard_frames() {
        let changed = snapshot().with_preset(Profile::Cyberpunk);
        let frames = &changed.blocks[2];
        assert_eq!(frames[0], 17);
        assert_eq!(frames[2] & 1, 1); // Frame 0: Escape is on
        assert_eq!(frames[3] & 1, 1); // Frame 0: F1 is on
        assert_eq!(frames[17] & 0x20, 0); // Frame 0: right arrow is off
        assert_eq!(frames[19] & 1, 0); // Frame 1: Escape is off
        assert_eq!(frames[20] & 1, 1); // Frame 1: F1 remains on
        assert_eq!(frames[274] & 1, 1); // Frame 16 wraps to Escape
        assert_eq!(frames[289] & 0x20, 0x20); // Frame 16: right arrow is on
        assert_eq!(&frames[341..375], &[0, 1].repeat(17));
    }

    #[test]
    fn sunset_uses_native_breathing_for_every_physical_key() {
        let changed = snapshot().with_preset(Profile::Sunset);
        let effects = &changed.blocks[3];
        for (_, offset) in KEYS {
            let index = offset + 1;
            assert_eq!(
                [effects[index], effects[index + 102], effects[index + 204]],
                [1, 1, 64]
            );
        }
        assert_eq!(changed.blocks[1], custom_data(&Profile::Sunset.colors())[0]);
    }

    #[test]
    fn gaming_pulses_movement_keys_while_the_background_stays_static() {
        let changed = snapshot().with_preset(Profile::Gaming);
        let effects = &changed.blocks[3];
        assert_eq!([effects[14], effects[116], effects[218]], [1, 1, 32]); // W: matrix index 14
        assert_eq!([effects[94], effects[196], effects[298]], [1, 1, 32]); // Up: matrix index 94
        assert_eq!(effects[27], 2); // F stays static
        assert_eq!(effects[6], 2); // Escape stays static
    }

    #[test]
    fn static_colors_use_the_onboard_one_based_matrix_and_a_selected_frame() {
        let mut colors = [[0; 3]; KEY_COUNT];
        colors[1] = [0x12, 0x34, 0x56];
        colors[86] = [0x78, 0x9a, 0xbc];
        let [rgb, frames, effects] = custom_data(&colors);
        assert_eq!([rgb[12], rgb[114], rgb[216]], [0x12, 0x34, 0x56]);
        assert_eq!([rgb[101], rgb[203], rgb[305]], [0x78, 0x9a, 0xbc]);
        assert_eq!([rgb[0], rgb[102], rgb[204]], [0; 3]);
        assert_eq!(frames[0], 1);
        assert_eq!(frames[3] & 1, 1); // F1: matrix index 12
        assert_eq!(frames[17] & 0x20, 0x20); // Right: matrix index 101
        assert_eq!(&frames[341..343], &[0, 1]);
        assert_eq!(&effects[..102], &[2; 102]);
    }

    #[test]
    fn color_reports_preserve_headers_and_the_251_byte_split() {
        let mut data = vec![0; 306];
        data[250] = 11;
        data[251] = 22;
        data[305] = 33;
        let reports = packets(4, 1, &data).unwrap();
        assert_eq!(reports.len(), 2);
        assert_eq!(&reports[0][..5], &[8, 8, 4, 0, 0]);
        assert_eq!(&reports[1][..5], &[8, 8, 4, 0, 1]);
        assert_eq!(
            [reports[0][255], reports[1][5], reports[1][59]],
            [11, 22, 33]
        );
        assert!(reports[1][60..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn metadata_changes_only_the_four_custom_lighting_fields() {
        let mut original = snapshot();
        original.blocks[0] = (0..139).map(|i| i as u8).collect();
        let changed = original.with_preset(Profile::Gaming);
        for index in 0..139 {
            let expected = match index {
                3 => 15,
                136 => 0,
                137 | 138 => 1,
                _ => index as u8,
            };
            assert_eq!(changed.blocks[0][index], expected, "metadata byte {index}");
        }
        let reports = packets(4, 0, &changed.blocks[0]).unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(&reports[0][..4], &[8, 2, 4, 0]);
    }

    #[test]
    fn packet_encoder_rejects_invalid_profiles_blocks_and_lengths() {
        for profile in [0, 5, 255] {
            assert!(packets(profile, 0, &[0; 139]).is_err());
        }
        assert!(packets(4, 4, &[]).is_err());
        assert!(packets(4, 1, &[0; 305]).is_err());
    }

    #[test]
    fn backup_round_trips_and_rejects_corruption_or_truncation() {
        let original = snapshot();
        let encoded = original.encode();
        assert_eq!(&encoded[..16], b"DPBK0002\x5d\x19\x61\x20\x31\x31\x04\x00");
        assert_eq!(Snapshot::decode(&encoded).unwrap(), original);
        let mut corrupt = encoded.clone();
        corrupt[100] ^= 1;
        assert!(Snapshot::decode(&corrupt).is_err());
        assert!(Snapshot::decode(&encoded[..100]).is_err());
    }

    #[test]
    fn checksum_matches_the_standard_adler32_vector() {
        assert_eq!(checksum(b"Wikipedia"), 0x11e60398);
    }

    #[test]
    fn acknowledgements_must_match_the_request_exactly() {
        assert!(validate_ack(&[4, 0xf8, 0x88, 4, 0, 0, 0, 0, 0], 0x88, 4).is_ok());
        for report in [
            vec![4, 0xf8, 0x82, 4, 0, 0, 0, 0, 0],
            vec![4, 0xf8, 0x88, 3, 0, 0, 0, 0, 0],
            vec![4, 0xf8, 0x88, 4, 1, 0, 0, 0, 0],
            vec![4, 0xf8, 0x88, 4, 0, 0, 0, 0],
        ] {
            assert!(validate_ack(&report, 0x88, 4).is_err());
        }
    }

    #[test]
    fn keymap_is_one_report_and_backup_v2_preserves_it() {
        let original = snapshot();
        let reports = packets(4, 4, &[0x1a; 204]).unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(&reports[0][..5], &[8, 3, 4, 0, 0x1a]);
        assert_eq!(&reports[0][208..], &[0; 48]);
        assert_eq!(original.encode().len(), 1373);
        assert_eq!(Snapshot::decode(&original.encode()).unwrap(), original);
    }

    #[test]
    fn editable_profile_round_trips_lighting_and_imports_supported_bindings() {
        let mut original = snapshot();
        original.blocks[4].fill(0xff);
        original.blocks[4][14] = 0x1a;
        original.blocks[4][114] = 0xb0;
        let mut config = Profile::Gaming.config();
        config.keys[0].effect = Effect::Rainbow;
        config.keys[1].effect = Effect::Cycle;
        config.keys[1].color = [255; 3];
        config.keys[1].pause = 0;
        let encoded = original.with_config(&config).unwrap();
        let decoded = encoded.config().unwrap();
        assert_eq!(decoded.keys, config.keys);
        assert_eq!(decoded.frames, config.frames);
        assert_eq!(decoded.bindings.len(), 2);
        assert_eq!(decoded.bindings[0].action, 0xb0);
        assert_eq!(decoded.bindings[1].action, 0x1a);
        assert!(decoded.validate().is_ok());
        assert_eq!(original.blocks[4], encoded.blocks[4]);
    }

    #[test]
    fn old_lighting_backups_remain_restorable_without_overwriting_keymaps() {
        let mut bytes = snapshot().encode();
        bytes[..8].copy_from_slice(b"DPBK0001");
        bytes.truncate(1165);
        bytes.extend_from_slice(&checksum(&bytes).to_le_bytes());
        let decoded = Snapshot::decode(&bytes).unwrap();
        assert!(decoded.blocks[4].is_empty());
        assert_eq!(decoded.blocks[0], snapshot().blocks[0]);
    }

    #[test]
    fn macro_backups_preserve_original_raw_sequences_and_reject_duplicate_indexes() {
        let mut original = snapshot();
        original.macros.insert(180, vec![0xff; 242]);
        let bytes = original.encode();
        assert_eq!(&bytes[..8], b"DPBK0003");
        assert_eq!(Snapshot::decode(&bytes).unwrap(), original);
        let mut bad = bytes[..bytes.len() - 4].to_vec();
        bad[1369..1371].copy_from_slice(&2u16.to_le_bytes());
        bad.extend_from_slice(&bytes[1371..1614]);
        bad.extend_from_slice(&checksum(&bad).to_le_bytes());
        assert!(Snapshot::decode(&bad).is_err());
    }
}
