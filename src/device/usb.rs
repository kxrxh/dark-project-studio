use nusb::descriptors::{ConfigurationDescriptor, TransferType};
use nusb::{Device, DeviceInfo, MaybeFuture};
use std::error::Error;

pub const VID: u16 = 0x195d;
pub const PID: u16 = 0x2061;

pub fn devices() -> Result<Vec<DeviceInfo>, Box<dyn Error>> {
    Ok(nusb::list_devices()
        .wait()?
        .filter(|device| device.vendor_id() == VID && device.product_id() == PID)
        .collect())
}

pub fn open_keyboard() -> Result<Device, Box<dyn Error>> {
    match devices()?.as_slice() {
        [info] => Ok(info.open().wait()?),
        [] => Err("No KD3B rev.2 (195d:2061) found.".into()),
        _ => Err("Multiple KD3B keyboards found; connect just one before writing.".into()),
    }
}

pub fn lighting_interface() -> Result<nusb::Interface, Box<dyn Error>> {
    let device = open_keyboard()?;
    validate_lighting_interface(device.active_configuration()?)?;
    let interface = device
        .claim_interface(2)
        .wait()
        .map_err(|error| format!("Cannot claim lighting interface 2: {error}"))?;
    Ok(interface)
}

fn validate_lighting_interface(config: ConfigurationDescriptor<'_>) -> Result<(), &'static str> {
    let valid = config.interface_alt_settings().any(|interface| {
        interface.interface_number() == 2
            && interface.alternate_setting() == 0
            && interface.class() == 3
            && interface.endpoints().any(|endpoint| {
                endpoint.address() == 0x03
                    && endpoint.transfer_type() == TransferType::Interrupt
                    && endpoint.max_packet_size() == 64
            })
    });
    if valid {
        Ok(())
    } else {
        Err("Unexpected USB lighting interface; refusing to write.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: [u8; 41] = [
        9, 2, 41, 0, 1, 1, 0, 0x80, 50, 9, 4, 2, 0, 2, 3, 1, 1, 0, 9, 0x21, 0x11, 1, 0, 1, 0x22,
        33, 0, 7, 5, 0x83, 3, 64, 0, 1, 7, 5, 0x03, 3, 64, 0, 1,
    ];

    #[test]
    fn accepts_only_the_known_vendor_interface_and_out_endpoint() {
        assert!(
            validate_lighting_interface(ConfigurationDescriptor::new(&CONFIG).unwrap()).is_ok()
        );
    }

    #[test]
    fn rejects_other_interfaces_and_endpoint_shapes() {
        for (index, value) in [(11, 0), (12, 1), (14, 0xff), (36, 4), (37, 2), (38, 32)] {
            let mut config = CONFIG;
            config[index] = value;
            assert!(
                validate_lighting_interface(ConfigurationDescriptor::new(&config).unwrap())
                    .is_err()
            );
        }
    }
}
