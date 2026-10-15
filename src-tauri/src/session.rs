//! Window session (folder + open file per window), restored on launch.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionWindow {
    pub root: Option<String>,
    pub file: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionFile {
    pub windows: Vec<SessionWindow>,
}

pub fn path(data_dir: &Path) -> PathBuf {
    data_dir.join("session.json")
}

pub fn load(data_dir: &Path) -> Vec<SessionWindow> {
    std::fs::read_to_string(path(data_dir))
        .ok()
        .and_then(|t| serde_json::from_str::<SessionFile>(&t).ok())
        .map(|s| s.windows)
        .unwrap_or_default()
}

/// Windows worth restoring: those whose folder still exists, deduplicated by folder.
pub fn restorable(
    windows: Vec<SessionWindow>,
    exists: impl Fn(&Path) -> bool,
) -> Vec<SessionWindow> {
    let mut seen: Vec<String> = Vec::new();
    windows
        .into_iter()
        .filter(|w| {
            let Some(root) = &w.root else { return false };
            if !exists(Path::new(root)) || seen.contains(root) {
                return false;
            }
            seen.push(root.clone());
            true
        })
        .map(|w| SessionWindow {
            file: w.file.filter(|f| exists(Path::new(f))),
            ..w
        })
        .collect()
}

pub fn save(data_dir: &Path, windows: &BTreeMap<String, SessionWindow>) {
    let file = SessionFile {
        windows: windows
            .values()
            .filter(|w| w.root.is_some())
            .cloned()
            .collect(),
    };
    if let Ok(text) = serde_json::to_string_pretty(&file) {
        let _ = crate::fsops::write_atomic(&path(data_dir), text.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restores_existing_unique_folders_only() {
        let ws = vec![
            SessionWindow {
                root: Some("/a".into()),
                file: Some("/a/x.md".into()),
            },
            SessionWindow {
                root: Some("/gone".into()),
                file: None,
            },
            SessionWindow {
                root: Some("/a".into()),
                file: None,
            },
            SessionWindow {
                root: None,
                file: None,
            },
            SessionWindow {
                root: Some("/b".into()),
                file: Some("/b/deleted.md".into()),
            },
        ];
        let exists = |p: &Path| ["/a", "/a/x.md", "/b"].contains(&p.to_str().unwrap());
        assert_eq!(
            restorable(ws, exists),
            vec![
                SessionWindow {
                    root: Some("/a".into()),
                    file: Some("/a/x.md".into())
                },
                SessionWindow {
                    root: Some("/b".into()),
                    file: None
                },
            ]
        );
    }

    #[test]
    fn round_trips_through_disk() {
        let t = tempfile::tempdir().unwrap();
        let mut m = BTreeMap::new();
        m.insert(
            "w1".to_string(),
            SessionWindow {
                root: Some("/a".into()),
                file: None,
            },
        );
        m.insert(
            "w2".to_string(),
            SessionWindow {
                root: None,
                file: None,
            },
        );
        save(t.path(), &m);
        assert_eq!(
            load(t.path()),
            vec![SessionWindow {
                root: Some("/a".into()),
                file: None
            }]
        );
        std::fs::write(path(t.path()), "garbage").unwrap();
        assert!(load(t.path()).is_empty());
    }
}
