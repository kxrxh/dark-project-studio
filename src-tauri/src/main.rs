#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use darkproject_core::{model::StudioProfile, onboard, storage, usb};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};

type Reply<T> = Result<T, String>;
#[derive(Clone)]
struct Studio {
    directory: PathBuf,
    lock: Arc<Mutex<()>>,
}

async fn work<T: Send + 'static>(
    state: &Studio,
    operation: impl FnOnce(&Path) -> Reply<T> + Send + 'static,
) -> Reply<T> {
    let state = state.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state
            .lock
            .lock()
            .map_err(|_| "Операция прервана. Перезапустите приложение".to_string())?;
        operation(&state.directory)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceState {
    connected: bool,
    supported: bool,
    revision: Option<String>,
    active: Option<u8>,
    message: String,
    identity: Option<String>,
    input_monitoring_required: bool,
}
impl DeviceState {
    fn apply_active_result(&mut self, result: Reply<u8>, input_monitoring_required: bool) {
        match result {
            Ok(active) => self.active = Some(active),
            Err(error) => {
                self.supported = false;
                self.input_monitoring_required = input_monitoring_required;
                self.message = if input_monitoring_required {
                    "В настройках macOS откройте «Конфиденциальность и безопасность» → «Мониторинг ввода», включите Dark Project Studio и перезапустите приложение. Доступ нужен для чтения ответов клавиатуры; вводимый текст не записывается.".into()
                } else {
                    error
                };
            }
        }
    }
}
fn device_presence() -> DeviceState {
    match usb::devices() {
        Ok(devices) if devices.len() == 1 => {
            let revision = devices[0].device_version();
            let supported = revision == 0x3131;
            DeviceState {
                connected: true,
                supported,
                revision: Some(format!("{revision:04x}")),
                identity: Some(format!("{:?}", devices[0].id())),
                active: None,
                input_monitoring_required: false,
                message: if supported {
                    "KD3B rev.2 подключена".into()
                } else {
                    "Эта ревизия клавиатуры пока не поддерживается".into()
                },
            }
        }
        other => DeviceState {
            connected: false,
            supported: false,
            revision: None,
            identity: None,
            active: None,
            input_monitoring_required: false,
            message: match other {
                Ok(list) if list.is_empty() => "Подключите KD3B rev.2 по USB".into(),
                Ok(_) => "Подключено несколько KD3B. Оставьте одну для настройки".into(),
                Err(error) => error.to_string(),
            },
        },
    }
}
fn device_state() -> DeviceState {
    let mut state = device_presence();
    if state.supported {
        let result = onboard::active_profile().map_err(|e| e.to_string());
        let needs_permission = result.is_err() && input_monitoring_required();
        state.apply_active_result(result, needs_permission);
    }
    state
}

fn input_monitoring_required() -> bool {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "IOKit", kind = "framework")]
        unsafe extern "C" {
            fn IOHIDCheckAccess(request_type: i32) -> i32;
        }
        const LISTEN_EVENT: i32 = 1;
        const ACCESS_GRANTED: i32 = 0;
        // SAFETY: IOKit's permission query takes a valid enum value and no pointers.
        unsafe { IOHIDCheckAccess(LISTEN_EVENT) != ACCESS_GRANTED }
    }
    #[cfg(not(target_os = "macos"))]
    false
}

#[tauri::command]
fn open_input_monitoring_settings() -> Reply<()> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Не удалось открыть настройки macOS".into())
        }
    }
    #[cfg(not(target_os = "macos"))]
    Err("Настройка доступна только в macOS".into())
}
#[derive(Serialize)]
struct HardwareSlot {
    slot: u8,
    data: Option<onboard::HardwareProfile>,
    error: Option<String>,
}
#[derive(Serialize)]
struct HardwareScan {
    device: DeviceState,
    profiles: Vec<HardwareSlot>,
}
fn collect_hardware_profiles(
    mut read: impl FnMut(u8) -> Reply<onboard::HardwareProfile>,
) -> Vec<HardwareSlot> {
    (1..=4)
        .map(|slot| match read(slot) {
            Ok(data) => HardwareSlot {
                slot,
                data: Some(data),
                error: None,
            },
            Err(error) => HardwareSlot {
                slot,
                data: None,
                error: Some(error),
            },
        })
        .collect()
}
#[tauri::command]
async fn probe_device(state: State<'_, Studio>) -> Reply<DeviceState> {
    work(&state, |_| Ok(device_presence())).await
}
#[tauri::command]
async fn scan_hardware(state: State<'_, Studio>) -> Reply<HardwareScan> {
    work(&state, |_| {
        let device = device_state();
        let profiles = if device.supported {
            collect_hardware_profiles(|slot| {
                onboard::read_profile_summary(slot).map_err(|e| e.to_string())
            })
        } else {
            vec![]
        };
        let after = device_presence();
        if after.identity != device.identity {
            return Err("Клавиатура отключена во время чтения".into());
        }
        Ok(HardwareScan { device, profiles })
    })
    .await
}

#[derive(Serialize)]
struct Bootstrap {
    profiles: Vec<StudioProfile>,
    templates: Vec<StudioProfile>,
    device: DeviceState,
}
#[tauri::command]
async fn bootstrap(state: State<'_, Studio>) -> Reply<Bootstrap> {
    work(&state, |directory| {
        Ok(Bootstrap {
            profiles: storage::load_with_catalog(&directory.join("library.json"))?,
            templates: storage::defaults()?,
            device: device_state(),
        })
    })
    .await
}
#[tauri::command]
async fn refresh_device(state: State<'_, Studio>) -> Reply<DeviceState> {
    work(&state, |_| Ok(device_state())).await
}
#[tauri::command]
async fn save_library(state: State<'_, Studio>, profiles: Vec<StudioProfile>) -> Reply<()> {
    work(&state, move |directory| {
        storage::save_user_library(&directory.join("library.json"), &profiles)
    })
    .await
}
#[tauri::command]
async fn read_hardware(state: State<'_, Studio>, slot: u8) -> Reply<onboard::HardwareProfile> {
    work(&state, move |_| {
        onboard::read_profile(slot).map_err(|e| e.to_string())
    })
    .await
}
fn backup_path(directory: &Path, slot: u8) -> Reply<PathBuf> {
    let folder = directory.join("backups");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    Ok(folder.join(format!("slot-{slot}-{now}.dpcbk")))
}
#[tauri::command]
async fn apply_profile(
    state: State<'_, Studio>,
    slot: u8,
    profile: StudioProfile,
) -> Reply<onboard::HardwareProfile> {
    work(&state, move |directory| {
        profile.validate()?;
        let backup = backup_path(directory, slot)?;
        onboard::save(slot, &profile, &backup)
            .map_err(|e| format!("{e}. Резервная копия: {}", backup.display()))
    })
    .await
}
#[tauri::command]
async fn select_slot(state: State<'_, Studio>, slot: u8) -> Reply<()> {
    work(&state, move |_| {
        onboard::select(slot).map_err(|e| e.to_string())
    })
    .await
}
#[tauri::command]
async fn import_profile(state: State<'_, Studio>, path: PathBuf) -> Reply<StudioProfile> {
    work(&state, move |_| {
        let data = read_limited(&path)?;
        let mut profile: StudioProfile =
            serde_json::from_slice(&data).map_err(|e| format!("Некорректный файл профиля: {e}"))?;
        profile.validate()?;
        profile.reactive = None;
        Ok(profile)
    })
    .await
}
fn read_limited(path: &Path) -> Reply<Vec<u8>> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(2_000_001)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 2_000_000 {
        return Err("Размер файла превышает 2 МБ".into());
    }
    Ok(bytes)
}
#[tauri::command]
async fn export_profile(
    state: State<'_, Studio>,
    path: PathBuf,
    profile: StudioProfile,
) -> Reply<()> {
    work(&state, move |_| {
        profile.validate()?;
        let data = serde_json::to_vec_pretty(&profile).map_err(|e| e.to_string())?;
        std::fs::write(path, data).map_err(|e| e.to_string())
    })
    .await
}
#[tauri::command]
async fn list_backups(state: State<'_, Studio>) -> Reply<Vec<String>> {
    work(&state, |directory| {
        let folder = directory.join("backups");
        if !folder.exists() {
            return Ok(vec![]);
        }
        let mut files: Vec<String> = std::fs::read_dir(folder)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| name.ends_with(".dpcbk"))
            .collect();
        files.sort_by(|a, b| b.cmp(a));
        Ok(files)
    })
    .await
}
#[tauri::command]
async fn restore_backup(state: State<'_, Studio>, name: String) -> Reply<()> {
    work(&state, move |directory| {
        if !name.starts_with("slot-") || !name.ends_with(".dpcbk") || name.contains(['/', '\\']) {
            return Err("Некорректное имя резервной копии".into());
        }
        let path = directory.join("backups").join(name);
        let bytes = read_limited(&path)?;
        let slot = bytes
            .get(14)
            .copied()
            .filter(|slot| (1..=4).contains(slot))
            .ok_or("Некорректная резервная копия")?;
        onboard::restore(&path, &backup_path(directory, slot)?).map_err(|e| e.to_string())
    })
    .await
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            app.manage(Studio {
                directory,
                lock: Arc::new(Mutex::new(())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            refresh_device,
            open_input_monitoring_settings,
            probe_device,
            scan_hardware,
            save_library,
            read_hardware,
            apply_profile,
            select_slot,
            import_profile,
            export_profile,
            list_backups,
            restore_backup
        ])
        .build(tauri::generate_context!())
        .expect("Не удалось запустить Dark Project Studio")
        .run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn denied_input_access_explains_how_to_recover_and_blocks_hardware() {
        let mut state = DeviceState {
            connected: true,
            supported: true,
            revision: Some("3131".into()),
            active: None,
            message: String::new(),
            identity: Some("keyboard".into()),
            input_monitoring_required: false,
        };
        state.apply_active_result(Err("IOHIDDeviceOpen failed".into()), true);
        assert!(state.input_monitoring_required);
        assert!(state.connected);
        assert!(!state.supported);
        assert!(state.message.contains("Мониторинг ввода"));
    }

    #[test]
    fn other_usb_errors_keep_their_diagnostic_without_permission_guidance() {
        let mut state = DeviceState {
            connected: true,
            supported: true,
            revision: Some("3131".into()),
            active: None,
            message: String::new(),
            identity: Some("keyboard".into()),
            input_monitoring_required: false,
        };
        state.apply_active_result(Err("disconnected during read".into()), false);
        assert!(!state.input_monitoring_required);
        assert!(!state.supported);
        assert_eq!(state.message, "disconnected during read");
    }

    #[test]
    fn scans_every_profile_and_isolates_unreadable_memory() {
        let mut seen = vec![];
        let result = collect_hardware_profiles(|slot| {
            seen.push(slot);
            if slot == 2 {
                return Err("unreadable".into());
            }
            Ok(onboard::HardwareProfile {
                base: vec![slot; 87],
                function: vec![0; 87],
                config: None,
                notice: None,
            })
        });
        assert_eq!(seen, [1, 2, 3, 4]);
        assert_eq!(result.len(), 4);
        assert_eq!(result[1].error.as_deref(), Some("unreadable"));
        assert_eq!(result[2].data.as_ref().unwrap().base[0], 3);
    }
}
