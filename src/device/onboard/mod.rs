mod connection;
mod reports;
mod snapshot;
#[cfg(test)]
mod tests;

use self::{connection::Connection, snapshot::Snapshot};
use crate::{device::protocol::KEYS, profile::model::StudioProfile};
use std::{error::Error, fs::OpenOptions, io::Write, path::Path};

type DeviceResult<T> = Result<T, Box<dyn Error>>;

const BLOCKS: [(u8, usize); 5] = [
    (0x02, 139),
    (0x08, 306),
    (0x09, 381),
    (0x0a, 323),
    (0x03, 204),
];

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

#[derive(serde::Serialize, serde::Deserialize)]
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
