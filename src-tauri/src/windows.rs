//! Window lifecycle: creation with an initial folder/file, `open_path` routing,
//! session tracking, quit handling.

use crate::error::{AppError, AppResult};
use crate::routing::{self, Route};
use crate::session::{self, SessionWindow};
use crate::{commands, fsops, AppState};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInit {
    pub root: Option<String>,
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteResult {
    /// "focused" (another or this window took it), "this-window" (caller should open it),
    /// or "new-window".
    pub kind: &'static str,
    pub label: Option<String>,
    pub root: Option<String>,
    pub file: Option<String>,
}

fn to_s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

pub fn build_window(app: &AppHandle, label: &str) -> AppResult<tauri::WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Biblozen")
        .inner_size(1180.0, 780.0)
        .min_inner_size(520.0, 360.0)
        .visible(true);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(14.0, 13.0));
    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false);
    Ok(builder.build()?)
}

/// Opens a new window, optionally rooted at a folder (and opening a file in it).
pub fn spawn(app: &AppHandle, root: Option<PathBuf>, file: Option<PathBuf>) -> AppResult<String> {
    let state = app.state::<AppState>();
    state.exiting.store(false, Ordering::SeqCst);
    let n = state.next_window.fetch_add(1, Ordering::SeqCst);
    let label = format!("w{n}");
    let root = match root {
        Some(r) => {
            let c = fsops::dunce_canonicalize(&r)?;
            commands::allow_root(app, &state, &c)?;
            state
                .windows
                .lock()
                .unwrap()
                .insert(label.clone(), c.clone());
            Some(c)
        }
        None => None,
    };
    let init = WindowInit {
        root: root.as_deref().map(to_s),
        file: file.as_deref().map(to_s),
    };
    state.session.lock().unwrap().insert(
        label.clone(),
        SessionWindow {
            root: init.root.clone(),
            file: init.file.clone(),
        },
    );
    state
        .pending_init
        .lock()
        .unwrap()
        .insert(label.clone(), init);
    build_window(app, &label)?;
    Ok(label)
}

fn focus(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Routes `target` per SPEC §4.4 and carries it out (except "this-window").
pub fn open_path(app: &AppHandle, target: &Path, caller: Option<&str>) -> AppResult<RouteResult> {
    let state = app.state::<AppState>();
    let target = fsops::dunce_canonicalize(target)
        .map_err(|_| AppError::NotFound(target.display().to_string()))?;
    let is_dir = target.is_dir();
    let windows: Vec<(String, PathBuf)> = state
        .windows
        .lock()
        .unwrap()
        .iter()
        .filter(|(l, _)| app.get_webview_window(l).is_some())
        .map(|(l, r)| (l.clone(), r.clone()))
        .collect();
    let caller = caller.map(|l| (l, windows.iter().any(|(wl, _)| wl == l)));
    match routing::route(
        &target,
        is_dir,
        &windows,
        caller,
        routing::case_insensitive(),
    ) {
        Route::FocusFolder { label } => {
            focus(app, &label);
            Ok(RouteResult {
                kind: "focused",
                label: Some(label),
                root: None,
                file: None,
            })
        }
        Route::FocusFile { label, file } => {
            focus(app, &label);
            // A window that hasn't loaded yet can't hear events: hand it the file
            // through its init payload instead.
            let queued = match state.pending_init.lock().unwrap().get_mut(&label) {
                Some(init) => {
                    init.file = Some(to_s(&file));
                    true
                }
                None => false,
            };
            if !queued {
                app.emit_to(label.as_str(), "open-file", to_s(&file))?;
            }
            Ok(RouteResult {
                kind: "focused",
                label: Some(label),
                root: None,
                file: Some(to_s(&file)),
            })
        }
        Route::ThisWindow { root, file } => Ok(RouteResult {
            kind: "this-window",
            label: caller.map(|(l, _)| l.to_string()),
            root: Some(to_s(&root)),
            file: file.as_deref().map(to_s),
        }),
        Route::NewWindow { root, file } => {
            let file_s = file.as_deref().map(to_s);
            let label = spawn(app, Some(root.clone()), file)?;
            Ok(RouteResult {
                kind: "new-window",
                label: Some(label),
                root: Some(to_s(&root)),
                file: file_s,
            })
        }
    }
}

/// Opens paths from the command line or a second launch. No paths → focus or create a window.
pub fn open_args(app: &AppHandle, args: &[String], cwd: &Path) {
    let paths = routing::cli_paths(args, cwd);
    if paths.is_empty() {
        let any = app.webview_windows().keys().next().cloned();
        match any {
            Some(l) => focus(app, &l),
            None => {
                let _ = spawn(app, None, None);
            }
        }
        return;
    }
    for p in paths {
        if let Err(e) = open_path(app, &p, None) {
            eprintln!("could not open {}: {e}", p.display());
        }
    }
}

/// First launch: open CLI paths, else restore the last session, else one empty window.
pub fn startup(app: &AppHandle) {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    if !routing::cli_paths(&args, &cwd).is_empty() {
        open_args(app, &args, &cwd);
        return;
    }
    let state = app.state::<AppState>();
    let restore = session::restorable(session::load(&state.data_dir.path), |p| p.exists());
    if restore.is_empty() {
        let _ = spawn(app, None, None);
        return;
    }
    for w in restore {
        let _ = spawn(app, w.root.map(PathBuf::from), w.file.map(PathBuf::from));
    }
}

/// Window closed: forget it, unless the whole app is quitting (then keep it for restore).
pub fn on_destroyed(app: &AppHandle, label: &str) {
    let state = app.state::<AppState>();
    state.windows.lock().unwrap().remove(label);
    state.pending_init.lock().unwrap().remove(label);
    let others = app.webview_windows().keys().any(|l| l != label);
    if others && !state.exiting.load(Ordering::SeqCst) {
        let mut s = state.session.lock().unwrap();
        s.remove(label);
        session::save(&state.data_dir.path, &s);
    }
}

// ---- Commands ----

#[tauri::command]
pub fn window_init(window: tauri::WebviewWindow, state: tauri::State<'_, AppState>) -> WindowInit {
    state
        .pending_init
        .lock()
        .unwrap()
        .remove(window.label())
        .unwrap_or_default()
}

// Window-creating commands are async: building a webview from a sync command (which
// runs on the main thread) deadlocks on Windows.
#[tauri::command]
pub async fn open_path_cmd(
    app: AppHandle,
    window: tauri::WebviewWindow,
    path: PathBuf,
) -> AppResult<RouteResult> {
    open_path(&app, &path, Some(window.label()))
}

#[tauri::command]
pub async fn new_window(app: AppHandle) -> AppResult<String> {
    spawn(&app, None, None)
}

/// The frontend reports its folder/open file so the session can be restored.
#[tauri::command]
pub fn report_session(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
    root: Option<String>,
    file: Option<String>,
) {
    state.exiting.store(false, Ordering::SeqCst);
    if root.is_none() {
        state.windows.lock().unwrap().remove(window.label());
    }
    let mut s = state.session.lock().unwrap();
    s.insert(window.label().to_string(), SessionWindow { root, file });
    session::save(&state.data_dir.path, &s);
}
