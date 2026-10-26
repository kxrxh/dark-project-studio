use super::{BLOCKS, DeviceResult};

pub(super) fn packets(
    profile: u8,
    block: usize,
    data: &[u8],
) -> Result<Vec<[u8; 256]>, &'static str> {
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

pub(super) fn checksum(bytes: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for byte in bytes {
        a = (a + u32::from(*byte)) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

pub(super) fn validate_ack(report: &[u8], opcode: u8, profile: u8) -> Result<(), &'static str> {
    validate_ack_for(report, opcode, profile, 0)
}
pub(super) fn validate_ack_for(
    report: &[u8],
    opcode: u8,
    profile: u8,
    index: u8,
) -> Result<(), &'static str> {
    if report == [4, 0xf8, opcode, profile, index, 0, 0, 0, 0] {
        Ok(())
    } else {
        Err("Unexpected keyboard completion report; stopping.")
    }
}
pub(super) fn collect_response(
    opcode: u8,
    profile: u8,
    length: usize,
    next: impl FnMut() -> DeviceResult<[u8; 9]>,
) -> DeviceResult<Vec<u8>> {
    collect_response_for(opcode, profile, 0, length, next)
}
pub(super) fn collect_response_for(
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
