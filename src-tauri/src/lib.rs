mod commands;
mod datadir;
mod error;
mod fsops;
mod routing;
mod scope;
mod search;
mod session;
mod tree;
mod windows;

use error::AppError;
use scope::Scope;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

pub struct AppState {
    pub data_dir: datadir::DataDir,
    pub scope: Scope,
    /// window label → canonical root folder
    pub windows: Mutex<HashMap<String, PathBuf>>,
    /// Bumped per search; older searches stop when it changes.
    pub search_gen: std::sync::Arc<std::sync::atomic::AtomicU64>,
    /// Initial folder/file for windows that haven't asked yet.
    pub pending_init: Mutex<HashMap<String, windows::WindowInit>>,
    /// Session per window label (persisted to session.json).
    pub session: Mutex<std::collections::BTreeMap<String, session::SessionWindow>>,
    pub next_window: std::sync::atomic::AtomicU64,
    /// Set while quitting so closing windows keeps their session entries.
    pub exiting: std::sync::atomic::AtomicBool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = datadir::resolve_current().expect("could not determine a data directory");
    if let Err(e) = datadir::ensure_layout(&data_dir.path) {
        eprintln!("failed to create data dir {}: {e}", data_dir.path.display());
    }

    let smoke = std::env::var_os("BIBLOZEN_SMOKE_DIR").is_some();
    tauri::Builder::default()
        // Must be first: a second launch forwards its arguments here and exits.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Off the main thread: creating a window synchronously here deadlocks on Windows.
            let app = app.clone();
            let args: Vec<String> = argv.get(1..).unwrap_or(&[]).to_vec();
            tauri::async_runtime::spawn(async move {
                windows::open_args(&app, &args, std::path::Path::new(&cwd));
            });
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState {
            scope: Scope::new(data_dir.path.clone()),
            data_dir: data_dir.clone(),
            windows: Mutex::new(HashMap::new()),
            search_gen: Default::default(),
            pending_init: Mutex::new(HashMap::new()),
            session: Mutex::new(Default::default()),
            next_window: std::sync::atomic::AtomicU64::new(1),
            exiting: Default::default(),
        })
        .setup(move |app| {
            app.fs_scope()
                .allow_directory(&data_dir.path, true)
                .map_err(|e| AppError::Other(e.to_string()))?;
            if smoke {
                // Self-test: one plain window labelled "main".
                windows::build_window(app.handle(), "main")?;
            } else {
                windows::startup(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_data_dir,
            commands::write_file_atomic,
            commands::set_window_root,
            commands::list_tree,
            commands::create_file,
            commands::create_dir,
            commands::rename_path,
            commands::duplicate_path,
            commands::trash,
            commands::reveal_in_os,
            commands::search,
            commands::print_window,
            commands::save_export,
            commands::save_pasted_image,
            commands::import_image,
            commands::smoke_config,
            commands::smoke_exit,
            windows::window_init,
            windows::open_path_cmd,
            windows::new_window,
            windows::report_session,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                windows::on_destroyed(window.app_handle(), window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Biblozen")
        .run(|app, event| {
            // Quit (Cmd+Q, last window, OS shutdown): close windows one by one so each
            // can ask about unsaved changes; exit once none are left.
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = event
            {
                let open = app.webview_windows();
                if !open.is_empty() {
                    api.prevent_exit();
                    app.state::<AppState>()
                        .exiting
                        .store(true, std::sync::atomic::Ordering::SeqCst);
                    for w in open.values() {
                        let _ = w.close();
                    }
                }
            }
        });
}
