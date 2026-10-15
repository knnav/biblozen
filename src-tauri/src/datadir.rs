//! Portable data directory resolution (SPEC §4.6).

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Windows,
    Mac,
    Linux,
}

impl Os {
    pub fn current() -> Os {
        if cfg!(target_os = "windows") {
            Os::Windows
        } else if cfg!(target_os = "macos") {
            Os::Mac
        } else {
            Os::Linux
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDir {
    pub path: PathBuf,
    /// True when the data lives next to the executable (Windows portable mode).
    pub portable: bool,
    /// True when portable mode was wanted but the exe dir wasn't writable.
    pub fell_back: bool,
}

/// Inputs for resolution, injected so the logic is a pure function.
pub struct Env<'a> {
    pub exe_dir: Option<&'a Path>,
    pub home: Option<&'a Path>,
    pub appdata: Option<&'a Path>,
    pub xdg_config: Option<&'a Path>,
}

pub const APP_DIR_NAME: &str = "Biblozen";

pub fn resolve(os: Os, env: &Env, is_writable: impl Fn(&Path) -> bool) -> Option<DataDir> {
    match os {
        Os::Windows => {
            if let Some(exe) = env.exe_dir {
                if is_writable(exe) {
                    return Some(DataDir {
                        path: exe.join("data"),
                        portable: true,
                        fell_back: false,
                    });
                }
            }
            let base = env
                .appdata
                .map(Path::to_path_buf)
                .or_else(|| env.home.map(|h| h.join("AppData").join("Roaming")))?;
            Some(DataDir {
                path: base.join(APP_DIR_NAME),
                portable: false,
                fell_back: env.exe_dir.is_some(),
            })
        }
        Os::Mac => Some(DataDir {
            path: env
                .home?
                .join("Library")
                .join("Application Support")
                .join(APP_DIR_NAME),
            portable: false,
            fell_back: false,
        }),
        Os::Linux => {
            let base = env
                .xdg_config
                .map(Path::to_path_buf)
                .or_else(|| env.home.map(|h| h.join(".config")))?;
            Some(DataDir {
                path: base.join(APP_DIR_NAME),
                portable: false,
                fell_back: false,
            })
        }
    }
}

/// Checks writability by actually creating (and removing) a probe file.
pub fn dir_is_writable(dir: &Path) -> bool {
    let probe = dir.join(".biblozen-write-probe");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub fn resolve_current() -> Option<DataDir> {
    let exe = std::env::current_exe().ok();
    let exe_dir = exe.as_deref().and_then(Path::parent).map(Path::to_path_buf);
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    let xdg = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from);
    let env = Env {
        exe_dir: exe_dir.as_deref(),
        home: home.as_deref(),
        appdata: appdata.as_deref(),
        xdg_config: xdg.as_deref(),
    };
    resolve(Os::current(), &env, dir_is_writable)
}

pub fn ensure_layout(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::create_dir_all(dir.join("themes"))?;
    std::fs::create_dir_all(dir.join("logs"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env<'a>(
        exe: Option<&'a Path>,
        home: Option<&'a Path>,
        appdata: Option<&'a Path>,
    ) -> Env<'a> {
        Env {
            exe_dir: exe,
            home,
            appdata,
            xdg_config: None,
        }
    }

    #[test]
    fn windows_uses_exe_dir_when_writable() {
        let exe = Path::new("C:/Apps/Biblozen");
        let d = resolve(Os::Windows, &env(Some(exe), None, None), |_| true).unwrap();
        assert_eq!(d.path, exe.join("data"));
        assert!(d.portable);
        assert!(!d.fell_back);
    }

    #[test]
    fn windows_falls_back_to_appdata() {
        let exe = Path::new("C:/Program Files/Biblozen");
        let appdata = Path::new("C:/Users/a/AppData/Roaming");
        let d = resolve(Os::Windows, &env(Some(exe), None, Some(appdata)), |_| false).unwrap();
        assert_eq!(d.path, appdata.join("Biblozen"));
        assert!(!d.portable);
        assert!(d.fell_back);
    }

    #[test]
    fn macos_uses_application_support() {
        let home = Path::new("/Users/a");
        let d = resolve(
            Os::Mac,
            &env(Some(Path::new("/x")), Some(home), None),
            |_| true,
        )
        .unwrap();
        assert_eq!(d.path, home.join("Library/Application Support/Biblozen"));
        assert!(!d.portable);
    }

    #[test]
    fn linux_uses_xdg_config_or_home() {
        let home = Path::new("/home/a");
        let d = resolve(Os::Linux, &env(None, Some(home), None), |_| true).unwrap();
        assert_eq!(d.path, home.join(".config/Biblozen"));
    }

    #[test]
    fn writable_probe_works_on_temp_dir() {
        let t = tempfile::tempdir().unwrap();
        assert!(dir_is_writable(t.path()));
        assert!(!dir_is_writable(&t.path().join("missing")));
    }
}
