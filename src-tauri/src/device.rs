use crate::state::{Reply, Studio, work};
use darkproject_core::device::{onboard, usb};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceState {
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
pub(crate) fn device_presence() -> DeviceState {
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
pub(crate) fn device_state() -> DeviceState {
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
pub(crate) fn open_input_monitoring_settings() -> Reply<()> {
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
#[derive(Serialize, Deserialize)]
struct HardwareSlot {
    slot: u8,
    data: Option<onboard::HardwareProfile>,
    error: Option<String>,
}
#[derive(Serialize, Deserialize)]
pub(crate) struct HardwareScan {
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
pub(crate) async fn probe_device(state: State<'_, Studio>) -> Reply<DeviceState> {
    work(&state, |_| {
        #[cfg(target_os = "windows")]
        {
            crate::read_worker::read("probe", std::time::Duration::from_secs(5))
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(device_presence())
        }
    })
    .await
}
#[tauri::command]
pub(crate) async fn scan_hardware(state: State<'_, Studio>) -> Reply<HardwareScan> {
    work(&state, |_| {
        #[cfg(target_os = "windows")]
        {
            crate::read_worker::read("scan", std::time::Duration::from_secs(45))
        }
        #[cfg(not(target_os = "windows"))]
        {
            scan()
        }
    })
    .await
}

pub(crate) fn scan() -> Reply<HardwareScan> {
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
}

#[tauri::command]
pub(crate) async fn refresh_device(state: State<'_, Studio>) -> Reply<DeviceState> {
    work(&state, |_| {
        #[cfg(target_os = "windows")]
        {
            crate::read_worker::read("refresh", std::time::Duration::from_secs(5))
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(device_state())
        }
    })
    .await
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
