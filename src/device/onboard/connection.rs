use super::{
    BLOCKS, DeviceResult,
    reports::{collect_response, collect_response_for, packets, validate_ack, validate_ack_for},
    snapshot::Snapshot,
};
use crate::{device::usb, profile::macros::MACRO_BYTES};
use nusb::transfer::{Interrupt, Out};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

pub(super) struct Connection {
    _interface: nusb::Interface,
    output: nusb::Endpoint<Interrupt, Out>,
    input: hidapi::HidDevice,
    pub(super) release: u16,
}

impl Connection {
    pub(super) fn open() -> DeviceResult<Self> {
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

    pub(super) fn snapshot_blocks(&mut self, profile: u8) -> DeviceResult<Snapshot> {
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
    pub(super) fn snapshot(&mut self, profile: u8, extra: &[u8]) -> DeviceResult<Snapshot> {
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

    pub(super) fn active(&mut self) -> DeviceResult<u8> {
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
    pub(super) fn select(&mut self, profile: u8) -> DeviceResult<()> {
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
    pub(super) fn write_macros(
        &mut self,
        desired: &Snapshot,
        previous: &Snapshot,
    ) -> DeviceResult<()> {
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

    pub(super) fn write_verified(&mut self, snapshot: &Snapshot, block: usize) -> DeviceResult<()> {
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
