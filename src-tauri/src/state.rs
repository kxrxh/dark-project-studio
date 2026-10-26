use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

pub(crate) type Reply<T> = Result<T, String>;
#[derive(Clone)]
pub(crate) struct Studio {
    pub(crate) directory: PathBuf,
    pub(crate) lock: Arc<Mutex<()>>,
    pub(crate) library_lock: Arc<Mutex<()>>,
}

pub(crate) async fn work<T: Send + 'static>(
    state: &Studio,
    operation: impl FnOnce(&Path) -> Reply<T> + Send + 'static,
) -> Reply<T> {
    run(state, state.lock.clone(), true, operation).await
}

pub(crate) async fn file_work<T: Send + 'static>(
    state: &Studio,
    operation: impl FnOnce(&Path) -> Reply<T> + Send + 'static,
) -> Reply<T> {
    run(state, state.library_lock.clone(), false, operation).await
}

async fn run<T: Send + 'static>(
    state: &Studio,
    lock: Arc<Mutex<()>>,
    hardware: bool,
    operation: impl FnOnce(&Path) -> Reply<T> + Send + 'static,
) -> Reply<T> {
    let state = state.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = if hardware {
            lock.try_lock()
                .map_err(|_| "Клавиатура занята другой операцией".to_string())?
        } else {
            lock.lock()
                .map_err(|_| "Операция прервана. Перезапустите приложение".to_string())?
        };
        operation(&state.directory)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_can_save_while_hardware_is_stuck() {
        let directory = tempfile::tempdir().unwrap();
        let state = Studio {
            directory: directory.path().into(),
            lock: Arc::new(Mutex::new(())),
            library_lock: Arc::new(Mutex::new(())),
        };
        let guard = state.lock.lock().unwrap();
        let worker = state.clone();
        let (sender, receiver) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let result = tauri::async_runtime::block_on(file_work(&worker, |path| {
                std::fs::write(path.join("saved.json"), b"[]").map_err(|e| e.to_string())
            }));
            let _ = sender.send(result);
        });
        let result = receiver.recv_timeout(std::time::Duration::from_secs(2));
        drop(guard);
        thread.join().unwrap();
        assert!(result.unwrap().is_ok());
        assert_eq!(
            std::fs::read(directory.path().join("saved.json")).unwrap(),
            b"[]"
        );
    }
}
