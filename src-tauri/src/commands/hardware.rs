use crate::{
    files::read_limited,
    state::{Reply, Studio, work},
};
use darkproject_core::{device::onboard, profile::model::StudioProfile};
use std::path::{Path, PathBuf};
use tauri::State;

#[tauri::command]
pub(crate) async fn read_hardware(
    state: State<'_, Studio>,
    slot: u8,
) -> Reply<onboard::HardwareProfile> {
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
pub(crate) async fn apply_profile(
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
pub(crate) async fn select_slot(state: State<'_, Studio>, slot: u8) -> Reply<()> {
    work(&state, move |_| {
        onboard::select(slot).map_err(|e| e.to_string())
    })
    .await
}
#[tauri::command]
pub(crate) async fn list_backups(state: State<'_, Studio>) -> Reply<Vec<String>> {
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
pub(crate) async fn restore_backup(state: State<'_, Studio>, name: String) -> Reply<()> {
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
