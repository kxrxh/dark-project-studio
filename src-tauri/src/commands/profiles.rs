use crate::{
    device::{DeviceState, device_state},
    files::read_limited,
    state::{Reply, Studio, work},
};
use darkproject_core::profile::{model::StudioProfile, storage};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Serialize)]
pub(crate) struct Bootstrap {
    profiles: Vec<StudioProfile>,
    templates: Vec<StudioProfile>,
    device: DeviceState,
}
#[tauri::command]
pub(crate) async fn bootstrap(state: State<'_, Studio>) -> Reply<Bootstrap> {
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
pub(crate) async fn save_library(
    state: State<'_, Studio>,
    profiles: Vec<StudioProfile>,
) -> Reply<()> {
    work(&state, move |directory| {
        storage::save_user_library(&directory.join("library.json"), &profiles)
    })
    .await
}
#[tauri::command]
pub(crate) async fn import_profile(
    state: State<'_, Studio>,
    path: PathBuf,
) -> Reply<StudioProfile> {
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
#[tauri::command]
pub(crate) async fn export_profile(
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
