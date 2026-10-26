use super::{
    BLOCKS, DeviceResult,
    reports::{collect_response, collect_response_for, packets, validate_ack, validate_ack_for},
    snapshot::Snapshot,
};
use crate::{device::usb, profile::macros::MACRO_BYTES};
#[cfg(not(target_os = "windows"))]
use nusb::transfer::{Interrupt, Out};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

pub(super) struct Connection {
    #[cfg(not(target_os = "windows"))]
    _interface: nusb::Interface,
    #[cfg(not(target_os = "windows"))]
    output: nusb::Endpoint<Interrupt, Out>,
    #[cfg(target_os = "windows")]
    output: hidapi::HidDevice,
    input: hidapi::HidDevice,
    pub(super) release: u16,
}

impl Connection {
    pub(super) fn open() -> DeviceResult<Self> {
        #[cfg(not(target_os = "windows"))]
        let interface = usb::lighting_interface()?;
        // Enumeration needs no WinUSB driver. Keep the single-keyboard guard
        // before opening separate HID collections for commands and replies.
        #[cfg(target_os = "windows")]
        let _ = usb::keyboard_info()?;
        let api = hidapi::HidApi::new()?;
        let info = api
            .device_list()
            .find(|device| {
                device.vendor_id() == usb::VID
                    && device.product_id() == usb::PID
                    && is_input_collection(
                        device.interface_number(),
                        device.usage_page(),
                        device.usage(),
                    )
            })
            .ok_or("KD3B vendor input interface not found.")?;
        if info.release_number() != 0x3131 {
            return Err("Onboard operations currently require USB device revision 0x3131.".into());
        }
        let input = info.open_device(&api)?;
        #[cfg(target_os = "windows")]
        let output = {
            let mut candidates = api.device_list().filter(|device| {
                is_windows_output_collection(
                    device.vendor_id(),
                    device.product_id(),
                    device.interface_number(),
                    device.usage_page(),
                    device.usage(),
                )
            });
            let info = candidates.next().ok_or("KD3B vendor output interface not found. Restore the standard Windows HID driver if it was replaced.")?;
            if candidates.next().is_some() {
                return Err("Multiple KD3B output collections found; refusing to write.".into());
            }
            info.open_device(&api)
                .map_err(|error| format!("Cannot open KD3B vendor output interface 2: {error}"))?
        };
        let mut buffer = [0; 64];
        for _ in 0..128 {
            if input.read_timeout(&mut buffer, 0)? == 0 {
                break;
            }
        }
        Ok(Self {
            #[cfg(not(target_os = "windows"))]
            output: interface.endpoint::<Interrupt, Out>(3)?,
            #[cfg(not(target_os = "windows"))]
            _interface: interface,
            #[cfg(target_os = "windows")]
            output,
            input,
            release: info.release_number(),
        })
    }

    fn send(&mut self, packet: &[u8; 256]) -> DeviceResult<()> {
        #[cfg(not(target_os = "windows"))]
        let actual_len = {
            let completion = self
                .output
                .transfer_blocking(packet.to_vec().into(), Duration::from_secs(2));
            completion.status?;
            completion.actual_len
        };
        // The packet already starts with report ID 8. HIDAPI writes the full
        // report through HIDClass/WriteFile; do not prepend a zero report ID or
        // split it into endpoint-sized chunks.
        #[cfg(target_os = "windows")]
        let actual_len = self.output.write(packet)?;
        if actual_len != packet.len() {
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

fn is_input_collection(interface: i32, usage_page: u16, usage: u16) -> bool {
    // Linux/macOS expose the whole interface through its first collection.
    // Windows exposes each top-level collection separately and reserves the
    // mouse collection for the system. Report 4 belongs to the FF00 collection.
    #[cfg(target_os = "windows")]
    let collection = (0xff00, 0xff00);
    #[cfg(not(target_os = "windows"))]
    let collection = (1, 2);
    interface == 1 && (usage_page, usage) == collection
}

#[cfg(any(target_os = "windows", test))]
fn is_windows_output_collection(
    vendor: u16,
    product: u16,
    interface: i32,
    usage_page: u16,
    usage: u16,
) -> bool {
    vendor == usb::VID
        && product == usb::PID
        && interface == 2
        && usage_page == 0xffc2
        && usage == 4
}

#[cfg(test)]
mod transport_tests {
    use super::*;

    #[test]
    fn replies_use_the_platforms_report_four_collection() {
        #[cfg(target_os = "windows")]
        let (page, usage) = (0xff00, 0xff00);
        #[cfg(not(target_os = "windows"))]
        let (page, usage) = (1, 2);
        assert!(is_input_collection(1, page, usage));
        assert!(!is_input_collection(0, page, usage));
        assert!(!is_input_collection(2, page, usage));
        assert!(!is_input_collection(1, 1, 6));
        #[cfg(target_os = "windows")]
        assert!(!is_input_collection(1, 1, 2));
    }

    #[test]
    fn windows_output_selects_only_the_vendor_command_collection() {
        assert!(is_windows_output_collection(0x195d, 0x2061, 2, 0xffc2, 4));
        for candidate in [
            (0x195d, 0x2061, 0, 1, 6), // typing collection
            (0x195d, 0x2061, 1, 1, 2), // reply collection
            (0x195d, 0x2061, 2, 1, 6),
            (0x195d, 0x2061, 2, 0xffc2, 3),
            (0x195d, 0x2062, 2, 0xffc2, 4),
            (0x195e, 0x2061, 2, 0xffc2, 4),
        ] {
            assert!(!is_windows_output_collection(
                candidate.0,
                candidate.1,
                candidate.2,
                candidate.3,
                candidate.4
            ));
        }
    }
}
