//! Tauri commands exposed to the frontend. Every path is scope-checked.

use crate::error::{AppError, AppResult};
use crate::fsops;
use crate::tree::{self, TreeListing};
use crate::AppState;
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_fs::FsExt;

#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> crate::datadir::DataDir {
    state.data_dir.clone()
}

#[tauri::command]
pub fn write_file_atomic(
    state: State<'_, AppState>,
    path: PathBuf,
    contents: String,
) -> AppResult<()> {
    let p = state.scope.check(&path)?;
    fsops::write_atomic(&p, contents.as_bytes())
}

/// Binds a folder to the calling window: grants fs + asset access to it and records
/// it in the window registry. Returns the canonical root.
#[tauri::command]
pub fn set_window_root(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    root: PathBuf,
) -> AppResult<String> {
    let canonical = fsops::dunce_canonicalize(&root)?;
    if !canonical.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Not a folder: {}",
            root.display()
        )));
    }
    allow_root(&app, &state, &canonical)?;
    state
        .windows
        .lock()
        .unwrap()
        .insert(window.label().to_string(), canonical.clone());
    Ok(canonical.to_string_lossy().into_owned())
}

pub fn allow_root(
    app: &tauri::AppHandle,
    state: &AppState,
    root: &std::path::Path,
) -> AppResult<()> {
    state.scope.allow_root(root);
    app.fs_scope()
        .allow_directory(root, true)
        .map_err(|e| AppError::Other(e.to_string()))?;
    app.asset_protocol_scope()
        .allow_directory(root, true)
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn list_tree(
    state: State<'_, AppState>,
    root: PathBuf,
    ignored: Vec<String>,
) -> AppResult<TreeListing> {
    let root = state.scope.check(&root)?;
    tauri::async_runtime::spawn_blocking(move || tree::list_tree(&root, &ignored))
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn create_file(state: State<'_, AppState>, path: PathBuf, contents: String) -> AppResult<()> {
    let p = state.scope.check(&path)?;
    fsops::create_file(&p, contents.as_bytes())
}

#[tauri::command]
pub fn create_dir(state: State<'_, AppState>, path: PathBuf) -> AppResult<()> {
    let p = state.scope.check(&path)?;
    if p.exists() {
        return Err(AppError::AlreadyExists(p.display().to_string()));
    }
    std::fs::create_dir_all(&p)?;
    Ok(())
}

#[tauri::command]
pub fn rename_path(state: State<'_, AppState>, from: PathBuf, to: PathBuf) -> AppResult<()> {
    let a = state.scope.check(&from)?;
    let b = state.scope.check(&to)?;
    fsops::rename_no_clobber(&a, &b)
}

#[tauri::command]
pub fn duplicate_path(state: State<'_, AppState>, path: PathBuf) -> AppResult<String> {
    let p = state.scope.check(&path)?;
    Ok(fsops::duplicate(&p)?.to_string_lossy().into_owned())
}

/// Moves to the OS trash. Never hard-deletes.
#[tauri::command]
pub async fn trash(state: State<'_, AppState>, path: PathBuf) -> AppResult<()> {
    let p = state.scope.check(&path)?;
    if !p.exists() {
        return Err(AppError::NotFound(p.display().to_string()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        trash::delete(&p).map_err(|e| AppError::Trash(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn reveal_in_os(state: State<'_, AppState>, path: PathBuf) -> AppResult<()> {
    let p = state.scope.check(&path)?;
    tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| AppError::Other(e.to_string()))
}

/// Directory for the self-test run (env `BIBLOZEN_SMOKE_DIR`), if any.
#[tauri::command]
pub fn smoke_config(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    // Only the self-test window runs it; windows it spawns boot normally.
    let Some(dir) = std::env::var_os("BIBLOZEN_SMOKE_DIR").filter(|_| window.label() == "main")
    else {
        return Ok(None);
    };
    let dir = fsops::dunce_canonicalize(std::path::Path::new(&dir))?;
    allow_root(&app, &state, &dir)?;
    Ok(Some(dir.to_string_lossy().into_owned()))
}

/// Ends a self-test run. Only works when the smoke env var is set.
#[tauri::command]
pub fn smoke_exit(app: tauri::AppHandle, code: i32) {
    if std::env::var_os("BIBLOZEN_SMOKE_DIR").is_some() {
        app.exit(code);
    }
}

fn header<'a>(req: &'a tauri::ipc::Request<'_>, name: &str) -> AppResult<&'a str> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Other(format!("missing header {name}")))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Saves pasted image bytes (raw IPC body) beside a document. SPEC §7.4.
#[tauri::command]
pub fn save_pasted_image(
    state: State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::Other("expected raw image bytes".into()));
    };
    let doc = PathBuf::from(percent_decode(header(&request, "x-doc-path")?));
    let ext = header(&request, "x-ext")?;
    let folder = percent_decode(header(&request, "x-folder")?);
    let timestamp = header(&request, "x-timestamp")?;
    let doc = state.scope.check(&doc)?;
    fsops::save_image_beside(&doc, bytes, ext, &folder, timestamp)
}

/// Copies an image the user dropped from the OS into the document's image folder.
#[tauri::command]
pub fn import_image(
    state: State<'_, AppState>,
    doc_path: PathBuf,
    src_path: PathBuf,
    folder: String,
    timestamp: String,
) -> AppResult<String> {
    let doc = state.scope.check(&doc_path)?;
    let ext = src_path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if !fsops::IMAGE_EXTS.contains(&ext.as_str()) {
        return Err(AppError::InvalidPath(format!(
            "Not an image: {}",
            src_path.display()
        )));
    }
    let bytes = std::fs::read(&src_path)?;
    fsops::save_image_beside(&doc, &bytes, &ext, &folder, &timestamp)
}

#[cfg(test)]
mod tests {
    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(
            super::percent_decode("C%3A%5CMy%20Notes%5C%C3%A9.md"),
            "C:\\My Notes\\é.md"
        );
        assert_eq!(super::percent_decode("plain"), "plain");
    }
}

/// Streams search results per file over `on_event`. A newer search cancels older ones.
#[tauri::command]
pub async fn search(
    state: State<'_, AppState>,
    root: PathBuf,
    query: String,
    opts: crate::search::SearchOpts,
    ignored: Vec<String>,
    on_event: tauri::ipc::Channel<SearchEvent>,
) -> AppResult<crate::search::SearchSummary> {
    use std::sync::atomic::Ordering;
    let root = state.scope.check(&root)?;
    let re = crate::search::build_regex(&query, &opts)
        .map_err(|e| AppError::Other(format!("Invalid pattern: {e}")))?;
    let gen = state.search_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let gen_ref = state.search_gen.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::search::search_folder(&root, &re, &opts, &ignored, |file| {
            if gen_ref.load(Ordering::SeqCst) != gen {
                return false;
            }
            on_event.send(SearchEvent::File(file)).is_ok()
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum SearchEvent {
    File(crate::search::FileMatches),
}

/// Opens the system print dialog for this window (PDF export goes through it).
#[tauri::command]
pub async fn print_window(window: tauri::WebviewWindow) -> AppResult<()> {
    window.print().map_err(|e| AppError::Other(e.to_string()))
}

/// Asks where to save an export (the path never comes from the page) and writes it.
#[tauri::command]
pub async fn save_export(
    app: tauri::AppHandle,
    default_name: String,
    contents: String,
    filter_name: String,
    extension: String,
) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&filter_name, &[extension.as_str()])
        .blocking_save_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    fsops::write_atomic(&path, contents.as_bytes())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
