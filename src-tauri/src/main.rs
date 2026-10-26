#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod device;
mod files;
mod state;

use state::Studio;
use std::sync::{Arc, Mutex};
use tauri::Manager;

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
            commands::profiles::bootstrap,
            device::refresh_device,
            device::open_input_monitoring_settings,
            device::probe_device,
            device::scan_hardware,
            commands::profiles::save_library,
            commands::hardware::read_hardware,
            commands::hardware::apply_profile,
            commands::hardware::select_slot,
            commands::profiles::import_profile,
            commands::profiles::export_profile,
            commands::hardware::list_backups,
            commands::hardware::restore_backup
        ])
        .build(tauri::generate_context!())
        .expect("Не удалось запустить Dark Project Studio")
        .run(|_, _| {});
}
