use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

pub(crate) type Reply<T> = Result<T, String>;
#[derive(Clone)]
pub(crate) struct Studio {
    pub(crate) directory: PathBuf,
    pub(crate) lock: Arc<Mutex<()>>,
}

pub(crate) async fn work<T: Send + 'static>(
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
