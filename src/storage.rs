use crate::model::StudioProfile;
use std::{io::Read, path::Path};

pub fn defaults() -> Result<Vec<StudioProfile>, String> {
    let profiles: Vec<StudioProfile> =
        serde_json::from_str(include_str!("../resources/presets.json"))
            .map_err(|error| format!("Не удалось загрузить подборку профилей: {error}"))?;
    validate(&profiles)?;
    Ok(profiles)
}

pub fn load_with_catalog(path: &Path) -> Result<Vec<StudioProfile>, String> {
    let mut profiles = load(path)?;
    if profiles.iter().any(|profile| profile.reactive.is_some()) {
        let backup = path.with_extension("before-onboard-only.json");
        if !backup.exists() {
            std::fs::copy(path, backup).map_err(|error| error.to_string())?;
        }
        for profile in &mut profiles {
            profile.reactive = None;
        }
        save(path, &profiles)?;
    }
    let marker = path.with_extension("catalog-v1");
    let reactive_marker = path.with_extension("reactive-v1");
    let effects_marker = path.with_extension("effects-v2");
    let static_marker = path.with_extension("static-v3");
    let ordinary_seeded = marker.exists() && path.exists();
    let reactive_seeded = ordinary_seeded && reactive_marker.exists();
    let effects_seeded = ordinary_seeded && effects_marker.exists();
    let static_seeded = ordinary_seeded && static_marker.exists();
    if ordinary_seeded && reactive_seeded && effects_seeded && static_seeded {
        return Ok(profiles);
    }
    let backup = path.with_extension(if !ordinary_seeded {
        "before-catalog.json"
    } else if !reactive_seeded {
        "before-reactive.json"
    } else if !effects_seeded {
        "before-effects-v2.json"
    } else {
        "before-static-v3.json"
    });
    if path.exists() && !backup.exists() {
        std::fs::copy(path, backup).map_err(|error| error.to_string())?;
    }
    if !ordinary_seeded {
        profiles.retain(|profile| profile.id != "gaming");
    }
    for preset in defaults()? {
        let new_cohort = preset.id.starts_with("motion-v2-");
        let eligible = !ordinary_seeded
            || (!effects_seeded && new_cohort)
            || (!static_seeded && preset.id.starts_with("static-v3-"));
        if !eligible {
            continue;
        }
        if profiles.len() >= 256 {
            break;
        }
        if profiles.iter().any(|profile| profile.id == preset.id) {
            continue;
        }
        profiles.push(preset);
        if serde_json::to_vec_pretty(&profiles)
            .map_err(|error| error.to_string())?
            .len()
            > 2_000_000
        {
            profiles.pop();
            break;
        }
    }
    save(path, &profiles)?;
    std::fs::write(marker, b"1").map_err(|error| error.to_string())?;
    std::fs::write(reactive_marker, b"1").map_err(|error| error.to_string())?;
    std::fs::write(effects_marker, b"1").map_err(|error| error.to_string())?;
    std::fs::write(static_marker, b"1").map_err(|error| error.to_string())?;
    Ok(profiles)
}

fn validate(profiles: &[StudioProfile]) -> Result<(), String> {
    if profiles.len() > 256 {
        return Err("В библиотеке может быть не больше 256 профилей".into());
    }
    let mut ids = std::collections::HashSet::new();
    for profile in profiles {
        profile.validate()?;
        if !ids.insert(&profile.id) {
            return Err("Идентификаторы профилей повторяются".into());
        }
    }
    Ok(())
}

pub fn load(path: &Path) -> Result<Vec<StudioProfile>, String> {
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return defaults(),
        Err(error) => return Err(format!("Не удалось прочитать библиотеку: {error}")),
    };
    read_library(file)
}

fn read_library(reader: impl Read) -> Result<Vec<StudioProfile>, String> {
    let mut data = Vec::new();
    reader
        .take(2_000_001)
        .read_to_end(&mut data)
        .map_err(|error| format!("Не удалось прочитать библиотеку: {error}"))?;
    if data.len() > 2_000_000 {
        return Err("Библиотека слишком большая (максимум 2 МБ)".into());
    }
    let profiles: Vec<StudioProfile> =
        serde_json::from_slice(&data).map_err(|error| format!("Библиотека повреждена: {error}"))?;
    validate(&profiles)?;
    Ok(profiles)
}

pub fn save(path: &Path, profiles: &[StudioProfile]) -> Result<(), String> {
    use std::io::Write;
    validate(profiles)?;
    let data = serde_json::to_vec_pretty(profiles).map_err(|error| error.to_string())?;
    if data.len() > 2_000_000 {
        return Err("Библиотека слишком большая (максимум 2 МБ)".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    let mut file = std::fs::File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(&data)
        .and_then(|()| file.sync_all())
        .map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, path)
        .map_err(|error| format!("Не удалось сохранить библиотеку: {error}"))
}

pub fn save_user_library(path: &Path, profiles: &[StudioProfile]) -> Result<(), String> {
    let backup = path.with_extension("before-user-library.json");
    if path.exists() && !backup.exists() {
        std::fs::copy(path, backup)
            .map_err(|error| format!("Не удалось сохранить исходную библиотеку: {error}"))?;
    }
    save(path, profiles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::Profile;

    fn path() -> std::path::PathBuf {
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "dpstudio-library-{}-{}-{}.json",
            std::process::id(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn retiring_host_reactions_preserves_base_lighting_and_backs_up_the_original_library() {
        let file = path();
        let mut original = Profile::Sunset.config();
        original.id = "my-reaction".into();
        original.bindings.push(crate::model::Binding {
            key: 1,
            layer: crate::model::Layer::Fn,
            action: 176,
        });
        original.macros.push(crate::macros::MacroBinding {
            key: 2,
            layer: crate::model::Layer::Base,
            name: "Tap".into(),
            repeat: 2,
            events: vec![
                crate::macros::MacroEvent {
                    code: 4,
                    down: true,
                    delay_ms: 20,
                },
                crate::macros::MacroEvent {
                    code: 4,
                    down: false,
                    delay_ms: 20,
                },
            ],
        });
        original.reactive = Some(crate::legacy::Settings {
            kind: crate::legacy::Kind::Flash,
            colors: vec![[7, 8, 9]],
            lifetime_ms: 600,
            speed: 1,
            background: 0,
        });
        save(&file, std::slice::from_ref(&original)).unwrap();
        for marker in ["catalog-v1", "reactive-v1", "effects-v2", "static-v3"] {
            std::fs::write(file.with_extension(marker), b"1").unwrap();
        }
        let mut expected = original.clone();
        expected.reactive = None;
        assert_eq!(load_with_catalog(&file).unwrap(), vec![expected.clone()]);
        let backup = file.with_extension("before-onboard-only.json");
        assert_eq!(load(&backup).unwrap(), vec![original.clone()]);
        assert_eq!(load_with_catalog(&file).unwrap(), vec![expected]);
        assert_eq!(load(&backup).unwrap(), vec![original]);
        std::fs::remove_file(&file).unwrap();
        for marker in [
            "catalog-v1",
            "reactive-v1",
            "effects-v2",
            "static-v3",
            "before-onboard-only.json",
        ] {
            std::fs::remove_file(file.with_extension(marker)).unwrap();
        }
    }

    #[test]
    fn rejects_oversized_stream_without_reading_the_rest() {
        use std::io::Read;
        struct UnreadTail;
        impl Read for UnreadTail {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                panic!("read beyond the library size limit");
            }
        }
        let stream = std::io::repeat(b' ').take(2_000_001).chain(UnreadTail);
        assert!(read_library(stream).unwrap_err().contains("2 МБ"));
    }

    #[test]
    fn persists_real_profiles_and_rejects_duplicate_ids_without_replacing_the_file() {
        let file = path();
        let profiles = vec![Profile::Cyberpunk.config()];
        save(&file, &profiles).unwrap();
        assert_eq!(load(&file).unwrap(), profiles);
        assert!(save(&file, &[profiles[0].clone(), profiles[0].clone()]).is_err());
        assert_eq!(load(&file).unwrap(), profiles);
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    fn separating_user_library_keeps_the_original_library_backup_once() {
        let file = path();
        let original = vec![Profile::Cyberpunk.config(), Profile::Sunset.config()];
        save(&file, &original).unwrap();
        save_user_library(&file, &original[1..]).unwrap();
        let backup = file.with_extension("before-user-library.json");
        assert!(backup.exists());
        assert_eq!(load(&backup).unwrap(), original);
        save_user_library(&file, &[]).unwrap();
        assert_eq!(load(&backup).unwrap(), original);
        assert!(load(&file).unwrap().is_empty());
        std::fs::remove_file(file).unwrap();
        std::fs::remove_file(backup).unwrap();
    }

    #[test]
    fn catalog_upgrade_removes_gaming_preserves_edits_and_runs_once() {
        let file = path();
        let mut personal = Profile::Sunset.config();
        personal.name = "Мой закат".into();
        personal.brightness = 42;
        let mut custom = Profile::Cyberpunk.config();
        custom.id = "custom-rain".into();
        save(
            &file,
            &[personal.clone(), Profile::Gaming.config(), custom.clone()],
        )
        .unwrap();
        let upgraded = load_with_catalog(&file).unwrap();
        assert!(upgraded.len() >= 34);
        assert!(!upgraded.iter().any(|profile| profile.id == "gaming"));
        assert!(upgraded.contains(&personal));
        assert!(upgraded.contains(&custom));
        assert!(file.with_extension("before-catalog.json").exists());
        save(&file, std::slice::from_ref(&personal)).unwrap();
        assert_eq!(load_with_catalog(&file).unwrap(), vec![personal]);
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_file(file.with_extension("before-catalog.json")).unwrap();
        std::fs::remove_file(file.with_extension("catalog-v1")).unwrap();
        std::fs::remove_file(file.with_extension("reactive-v1")).unwrap();
        std::fs::remove_file(file.with_extension("effects-v2")).unwrap();
        std::fs::remove_file(file.with_extension("static-v3")).unwrap();
    }

    #[test]
    fn retired_reactive_upgrade_does_not_readd_host_or_deleted_ordinary_presets() {
        let file = path();
        let personal = Profile::Sunset.config();
        save(&file, std::slice::from_ref(&personal)).unwrap();
        std::fs::write(file.with_extension("catalog-v1"), b"1").unwrap();
        let result = load_with_catalog(&file).unwrap();
        assert!(result.iter().all(|p| p.reactive.is_none()));
        assert!(!result.iter().any(|p| p.id == "cyberpunk"));
        save(&file, std::slice::from_ref(&personal)).unwrap();
        assert_eq!(load_with_catalog(&file).unwrap(), vec![personal]);
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_file(file.with_extension("catalog-v1")).unwrap();
        std::fs::remove_file(file.with_extension("reactive-v1")).unwrap();
        std::fs::remove_file(file.with_extension("effects-v2")).unwrap();
        std::fs::remove_file(file.with_extension("static-v3")).unwrap();
        std::fs::remove_file(file.with_extension("before-reactive.json")).unwrap();
    }

    #[test]
    fn effects_upgrade_seeds_only_motion_cohort_and_preserves_existing_profiles() {
        let file = path();
        let mut custom = Profile::Cyberpunk.config();
        custom.id = "my-colors".into();
        custom.keys[0].color = [7, 8, 9];
        let personal = Profile::Sunset.config();
        let originals = vec![personal, custom];
        save(&file, &originals).unwrap();
        std::fs::write(file.with_extension("catalog-v1"), b"1").unwrap();
        std::fs::write(file.with_extension("reactive-v1"), b"1").unwrap();
        std::fs::write(file.with_extension("static-v3"), b"1").unwrap();
        let result = load_with_catalog(&file).unwrap();
        assert_eq!(result.len(), 10);
        assert!(originals.iter().all(|profile| result.contains(profile)));
        assert!(
            !result
                .iter()
                .any(|p| p.id == "cyberpunk" || p.id == "reactive-neon-echo")
        );
        assert_eq!(
            load(&file.with_extension("before-effects-v2.json")).unwrap(),
            originals
        );
        save(&file, &[]).unwrap();
        assert!(load_with_catalog(&file).unwrap().is_empty());
        std::fs::remove_file(&file).unwrap();
        for suffix in [
            "catalog-v1",
            "reactive-v1",
            "effects-v2",
            "static-v3",
            "before-effects-v2.json",
        ] {
            std::fs::remove_file(file.with_extension(suffix)).unwrap();
        }
    }

    #[test]
    fn static_upgrade_preserves_edits_and_earlier_deletions_and_does_not_reseed() {
        let file = path();
        let mut edited = defaults()
            .unwrap()
            .into_iter()
            .find(|profile| profile.id == "static-v3-porcelain")
            .unwrap();
        edited.name = "Мой фарфор".into();
        edited.keys[0].color = [7, 8, 9];
        let originals = vec![Profile::Sunset.config(), edited];
        save(&file, &originals).unwrap();
        for marker in ["catalog-v1", "reactive-v1", "effects-v2"] {
            std::fs::write(file.with_extension(marker), b"1").unwrap();
        }
        let result = load_with_catalog(&file).unwrap();
        assert_eq!(result.len(), 25);
        assert!(originals.iter().all(|profile| result.contains(profile)));
        assert!(!result.iter().any(|profile| profile.id == "cyberpunk"));
        assert_eq!(
            load(&file.with_extension("before-static-v3.json")).unwrap(),
            originals
        );
        save(&file, &[]).unwrap();
        assert!(load_with_catalog(&file).unwrap().is_empty());
        std::fs::remove_file(&file).unwrap();
        for suffix in [
            "catalog-v1",
            "reactive-v1",
            "effects-v2",
            "static-v3",
            "before-static-v3.json",
        ] {
            std::fs::remove_file(file.with_extension(suffix)).unwrap();
        }
    }

    #[test]
    fn catalog_profiles_are_valid_and_new_libraries_exclude_gaming() {
        let profiles = defaults().unwrap();
        assert!(profiles.len() >= 34);
        assert!(
            profiles
                .iter()
                .all(|profile| profile.id != "gaming" && profile.validate().is_ok())
        );
        validate(&profiles).unwrap();
    }

    #[test]
    fn missing_library_seeds_presets_but_a_corrupt_library_is_not_silently_replaced() {
        let file = path();
        assert!(load(&file).unwrap().len() >= 34);
        std::fs::write(&file, "not json").unwrap();
        assert!(load(&file).is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "not json");
        std::fs::remove_file(file).unwrap();
    }
}
