//! Tracks which directories the frontend may touch through our own commands.
//! The data dir is always allowed; folder roots are added when a window opens one.

use crate::error::{AppError, AppResult};
use crate::fsops::canonicalize_lenient;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Scope {
    data_dir: PathBuf,
    roots: Mutex<Vec<PathBuf>>,
}

impl Scope {
    pub fn new(data_dir: PathBuf) -> Self {
        let data_dir = canonicalize_lenient(&data_dir);
        Scope {
            data_dir,
            roots: Mutex::new(Vec::new()),
        }
    }

    pub fn allow_root(&self, root: &Path) {
        let root = canonicalize_lenient(root);
        let mut roots = self.roots.lock().unwrap();
        if !roots.iter().any(|r| r == &root) {
            roots.push(root);
        }
    }

    /// Returns the canonical path if it lies within the data dir or an allowed root.
    pub fn check(&self, path: &Path) -> AppResult<PathBuf> {
        let p = canonicalize_lenient(path);
        if p.starts_with(&self.data_dir) {
            return Ok(p);
        }
        let roots = self.roots.lock().unwrap();
        if roots.iter().any(|r| p.starts_with(r)) {
            Ok(p)
        } else {
            Err(AppError::OutOfScope(path.display().to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_outside_and_traversal() {
        let t = tempfile::tempdir().unwrap();
        let data = t.path().join("data");
        let root = t.path().join("notes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        let s = Scope::new(data.clone());
        assert!(s.check(&data.join("settings.json")).is_ok());
        assert!(s.check(&root.join("a.md")).is_err());
        s.allow_root(&root);
        assert!(s.check(&root.join("a.md")).is_ok());
        assert!(s.check(&root.join("..").join("data2").join("x")).is_err());
    }
}
