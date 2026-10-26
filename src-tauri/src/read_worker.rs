//! Keep Windows HID/USB calls out of the GUI process. A stuck driver or a
//! native crash is recoverable without blocking the window or library saves.
use crate::{device, files::read_limited, state::Reply};
use serde::de::DeserializeOwned;
use std::{
    os::windows::process::CommandExt,
    process::{Child, Command, ExitStatus},
    time::{Duration, Instant},
};

const FLAG: &str = "--hardware-read-worker";

pub(crate) fn dispatch() -> bool {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_none_or(|arg| arg != FLAG) {
        return false;
    }
    // Also bound an orphaned reader if the user closes the parent window.
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(50));
        std::process::exit(2);
    });
    let Some(path) = args.get(3) else { return true };
    let result = match args.get(2).and_then(|arg| arg.to_str()) {
        Some("probe") => serde_json::to_vec(&Ok::<_, String>(device::device_presence())),
        Some("refresh") => serde_json::to_vec(&Ok::<_, String>(device::device_state())),
        Some("scan") => serde_json::to_vec(&device::scan()),
        _ => return true,
    };
    if let Ok(bytes) = result {
        let _ = std::fs::write(path, bytes);
    }
    true
}

pub(crate) fn read<T: DeserializeOwned>(operation: &str, timeout: Duration) -> Reply<T> {
    // A file avoids pipe-buffer deadlocks with four full profile responses.
    let response = tempfile::NamedTempFile::new()
        .map_err(|e| e.to_string())?
        .into_temp_path();
    let mut child = Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
        .args([FLAG, operation])
        .arg(response.as_os_str())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Не удалось запустить чтение USB: {e}"))?;
    let status = wait(&mut child, timeout)?;
    if !status.success() {
        return Err("Процесс чтения USB завершился с ошибкой. Переподключите клавиатуру и нажмите «Проверить подключение».".into());
    }
    let bytes = read_limited(&response)?;
    serde_json::from_slice(&bytes)
        .map_err(|e| format!("Не удалось получить результат чтения USB: {e}"))?
}

fn wait(child: &mut Child, timeout: Duration) -> Reply<ExitStatus> {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(20))
            }
            result => {
                let _ = child.kill();
                // Termination itself can be delayed by a faulty kernel driver.
                // Never follow a timeout with another unbounded wait.
                let stopped = Instant::now();
                while matches!(child.try_wait(), Ok(None))
                    && stopped.elapsed() < Duration::from_secs(1)
                {
                    std::thread::sleep(Duration::from_millis(10));
                }
                return Err(match result {
                    Err(error) => format!("Ошибка процесса чтения USB: {error}"),
                    _ => "Клавиатура не ответила вовремя. Чтение остановлено; переподключите её и нажмите «Проверить подключение».".into(),
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hung_reader_is_terminated_and_reaped() {
        let mut child = Command::new("ping.exe")
            .args(["-n", "10", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .creation_flags(0x08000000)
            .spawn()
            .unwrap();
        assert!(wait(&mut child, Duration::from_millis(30)).is_err());
        assert!(child.try_wait().unwrap().is_some());
    }

    #[test]
    fn successful_reader_is_allowed_to_finish() {
        let mut child = Command::new("cmd.exe")
            .args(["/C", "exit 0"])
            .creation_flags(0x08000000)
            .spawn()
            .unwrap();
        assert!(wait(&mut child, Duration::from_secs(5)).unwrap().success());
    }
}
