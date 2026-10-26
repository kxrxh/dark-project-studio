use super::reports::{checksum, collect_response, packets, validate_ack};
use super::snapshot::custom_data;
use super::*;
use crate::device::protocol::KEY_COUNT;
use crate::profile::{model::Effect, presets::Profile};
use std::collections::BTreeMap;

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
        expected.blocks[0][first_color..first_color + 6].copy_from_slice(&[10, 40, 20, 50, 30, 60]);
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
