//! Window routing for `open_path` (SPEC §4.4). Pure: decides, doesn't act.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// A window already has exactly this folder open.
    FocusFolder { label: String },
    /// A window's folder contains the file: focus it and open the file there.
    FocusFile { label: String, file: PathBuf },
    /// The calling window has no folder yet: open here.
    ThisWindow {
        root: PathBuf,
        file: Option<PathBuf>,
    },
    /// Nothing fits: a new window rooted at `root`, opening `file` if given.
    NewWindow {
        root: PathBuf,
        file: Option<PathBuf>,
    },
}

/// Paths compare case-insensitively on Windows and macOS (default APFS/NTFS).
pub fn case_insensitive() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

fn key(p: &Path, ci: bool) -> Vec<String> {
    p.components()
        .map(|c| {
            let s = c.as_os_str().to_string_lossy();
            if ci {
                s.to_lowercase()
            } else {
                s.into_owned()
            }
        })
        .collect()
}

pub fn same_path(a: &Path, b: &Path, ci: bool) -> bool {
    key(a, ci) == key(b, ci)
}

/// True when `child` is inside `root` (strictly).
pub fn is_inside(root: &Path, child: &Path, ci: bool) -> bool {
    let r = key(root, ci);
    let c = key(child, ci);
    c.len() > r.len() && c[..r.len()] == r[..]
}

/// Decides where `target` opens.
/// - `windows`: (label, canonical root) for windows that have a folder open
/// - `caller`: the window asking (if any) and whether it has a folder
pub fn route(
    target: &Path,
    target_is_dir: bool,
    windows: &[(String, PathBuf)],
    caller: Option<(&str, bool)>,
    ci: bool,
) -> Route {
    let empty_caller = caller.filter(|(_, has_root)| !has_root).map(|(l, _)| l);
    if target_is_dir {
        if let Some((label, _)) = windows.iter().find(|(_, r)| same_path(r, target, ci)) {
            return Route::FocusFolder {
                label: label.clone(),
            };
        }
        return match empty_caller {
            Some(_) => Route::ThisWindow {
                root: target.to_path_buf(),
                file: None,
            },
            None => Route::NewWindow {
                root: target.to_path_buf(),
                file: None,
            },
        };
    }
    // File: the deepest root containing it wins.
    let best = windows
        .iter()
        .filter(|(_, r)| is_inside(r, target, ci))
        .max_by_key(|(_, r)| r.components().count());
    if let Some((label, _)) = best {
        return Route::FocusFile {
            label: label.clone(),
            file: target.to_path_buf(),
        };
    }
    let parent = target
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| target.to_path_buf());
    match empty_caller {
        Some(_) => Route::ThisWindow {
            root: parent,
            file: Some(target.to_path_buf()),
        },
        None => Route::NewWindow {
            root: parent,
            file: Some(target.to_path_buf()),
        },
    }
}

/// Paths from command-line arguments (skips flags like `-psn_…` from macOS).
pub fn cli_paths(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() {
                p
            } else {
                cwd.join(p)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(label: &str, root: &str) -> (String, PathBuf) {
        (label.to_string(), PathBuf::from(root))
    }

    #[test]
    fn focuses_window_with_exact_folder() {
        let ws = [w("a", "/notes"), w("b", "/work")];
        assert_eq!(
            route(Path::new("/work"), true, &ws, Some(("a", true)), false),
            Route::FocusFolder { label: "b".into() }
        );
    }

    #[test]
    fn new_window_for_unknown_folder_unless_caller_is_empty() {
        let ws = [w("a", "/notes")];
        assert_eq!(
            route(Path::new("/other"), true, &ws, Some(("a", true)), false),
            Route::NewWindow {
                root: "/other".into(),
                file: None
            }
        );
        assert_eq!(
            route(Path::new("/other"), true, &ws, Some(("e", false)), false),
            Route::ThisWindow {
                root: "/other".into(),
                file: None
            }
        );
    }

    #[test]
    fn file_goes_to_the_deepest_containing_root() {
        let ws = [
            w("outer", "/notes"),
            w("inner", "/notes/project"),
            w("x", "/notes/project-b"),
        ];
        assert_eq!(
            route(Path::new("/notes/project/a.md"), false, &ws, None, false),
            Route::FocusFile {
                label: "inner".into(),
                file: "/notes/project/a.md".into()
            }
        );
        assert_eq!(
            route(Path::new("/notes/b.md"), false, &ws, None, false),
            Route::FocusFile {
                label: "outer".into(),
                file: "/notes/b.md".into()
            }
        );
        // "/notes/project-b" must not match "/notes/project".
        assert_eq!(
            route(Path::new("/notes/project-b/c.md"), false, &ws, None, false),
            Route::FocusFile {
                label: "x".into(),
                file: "/notes/project-b/c.md".into()
            }
        );
    }

    #[test]
    fn file_outside_all_roots_opens_its_parent() {
        let ws = [w("a", "/notes")];
        assert_eq!(
            route(
                Path::new("/tmp/x/readme.md"),
                false,
                &ws,
                Some(("a", true)),
                false
            ),
            Route::NewWindow {
                root: "/tmp/x".into(),
                file: Some("/tmp/x/readme.md".into())
            }
        );
    }

    #[test]
    fn case_insensitive_comparison_when_asked() {
        let ws = [w("a", "/Users/Me/Notes")];
        assert_eq!(
            route(Path::new("/users/me/notes/A.md"), false, &ws, None, true),
            Route::FocusFile {
                label: "a".into(),
                file: "/users/me/notes/A.md".into()
            }
        );
        assert!(matches!(
            route(Path::new("/users/me/notes/A.md"), false, &ws, None, false),
            Route::NewWindow { .. }
        ));
        assert!(same_path(Path::new("/A/b"), Path::new("/a/B"), true));
        assert!(!is_inside(Path::new("/a"), Path::new("/a"), true));
    }

    #[test]
    fn parses_cli_paths() {
        let args = vec![
            "-psn_0_123".to_string(),
            "notes".to_string(),
            "/abs/x.md".to_string(),
        ];
        assert_eq!(
            cli_paths(&args, Path::new("/home/me")),
            vec![PathBuf::from("/home/me/notes"), PathBuf::from("/abs/x.md")]
        );
    }
}
