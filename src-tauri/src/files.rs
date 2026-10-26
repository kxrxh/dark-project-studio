use crate::state::Reply;
use std::path::Path;

pub(crate) fn read_limited(path: &Path) -> Reply<Vec<u8>> {
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
