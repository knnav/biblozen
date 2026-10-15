//! Filesystem operations that need to be safe (atomic writes, trash).

use crate::error::{AppError, AppResult};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Writes `contents` to `path` by writing a temp file in the same directory and
/// renaming it over the target, so readers never observe a half-written file.
pub fn write_atomic(path: &Path, contents: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::InvalidPath(path.display().to_string()))?;
    let name = path
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(path.display().to_string()))?
        .to_string_lossy();
    let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = dir.join(format!(".{name}.{}-{n}.bztmp", std::process::id()));

    let result = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents)?;
        f.sync_all()?;
        drop(f);
        if let Ok(meta) = std::fs::metadata(path) {
            // Keep the original file's permissions (e.g. read-only bits, unix mode).
            let _ = std::fs::set_permissions(&tmp, meta.permissions());
        }
        std::fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// Lexically normalizes a path (resolves `.` and `..`) without touching the disk.
pub fn normalize(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Canonicalizes as much of `path` as exists, then re-appends the rest.
/// Lets us scope-check paths for files that are about to be created.
pub fn canonicalize_lenient(path: &Path) -> PathBuf {
    let norm = normalize(path);
    let mut existing = norm.clone();
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if let Ok(c) = dunce_canonicalize(&existing) {
            let mut out = c;
            for part in rest.iter().rev() {
                out.push(part);
            }
            return out;
        }
        match (
            existing.file_name().map(|s| s.to_os_string()),
            existing.parent(),
        ) {
            (Some(name), Some(parent)) => {
                rest.push(name);
                existing = parent.to_path_buf();
            }
            _ => return norm,
        }
    }
}

/// `std::fs::canonicalize` but without the `\\?\` prefix on Windows, so paths
/// stay comparable with what the user/frontend sees.
pub fn dunce_canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    let c = std::fs::canonicalize(path)?;
    #[cfg(windows)]
    {
        let s = c.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            if !stripped.starts_with("UNC") {
                return Ok(PathBuf::from(stripped));
            }
        }
    }
    Ok(c)
}

/// Creates a new file, failing if it already exists.
pub fn create_file(path: &Path, contents: &[u8]) -> AppResult<()> {
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    f.write_all(contents)?;
    Ok(())
}

/// Renames/moves without ever overwriting an existing target. A case-only rename
/// of the same entry is allowed (case-insensitive filesystems).
pub fn rename_no_clobber(from: &Path, to: &Path) -> AppResult<()> {
    if !from.exists() {
        return Err(AppError::NotFound(from.display().to_string()));
    }
    let same_entry = from.to_string_lossy().to_lowercase() == to.to_string_lossy().to_lowercase();
    if to.exists() && !same_entry {
        return Err(AppError::AlreadyExists(to.display().to_string()));
    }
    if to.starts_with(from) && !same_entry {
        return Err(AppError::InvalidPath(
            "Can't move a folder into itself".to_string(),
        ));
    }
    std::fs::rename(from, to)?;
    Ok(())
}

/// Picks `name copy.ext`, `name copy 2.ext`, … next to `path`.
pub fn duplicate_target(path: &Path, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let dir = path.parent().unwrap_or(Path::new(""));
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mut n = 1;
    loop {
        let name = if n == 1 {
            format!("{stem} copy{ext}")
        } else {
            format!("{stem} copy {n}{ext}")
        };
        let candidate = dir.join(name);
        if !exists(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub fn duplicate(path: &Path) -> AppResult<PathBuf> {
    let target = duplicate_target(path, |p| p.exists());
    if path.is_dir() {
        copy_dir_recursive(path, &target)?;
    } else {
        std::fs::copy(path, &target)?;
    }
    Ok(target)
}

pub const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

/// Validates a user-supplied folder name for images (a relative path inside the doc dir).
pub fn validate_image_folder(folder: &str) -> AppResult<PathBuf> {
    let p = Path::new(folder);
    if folder.is_empty()
        || p.is_absolute()
        || p.components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(AppError::InvalidPath(format!(
            "Invalid image folder: {folder}"
        )));
    }
    Ok(p.to_path_buf())
}

/// Writes image bytes beside `doc` as `<folder>/<doc-stem>-<timestamp>.<ext>`
/// (adding `-2`, `-3`… if taken). Returns the path relative to the doc's directory.
pub fn save_image_beside(
    doc: &Path,
    bytes: &[u8],
    ext: &str,
    folder: &str,
    timestamp: &str,
) -> AppResult<String> {
    let ext = ext.to_ascii_lowercase();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err(AppError::InvalidPath(format!("Not an image type: {ext}")));
    }
    if !timestamp.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(AppError::InvalidPath("Invalid timestamp".into()));
    }
    let folder_rel = validate_image_folder(folder)?;
    let doc_dir = doc
        .parent()
        .ok_or_else(|| AppError::InvalidPath(doc.display().to_string()))?;
    let dir = doc_dir.join(&folder_rel);
    std::fs::create_dir_all(&dir)?;
    let stem = doc
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".into());
    let mut n = 1;
    loop {
        let name = if n == 1 {
            format!("{stem}-{timestamp}.{ext}")
        } else {
            format!("{stem}-{timestamp}-{n}.{ext}")
        };
        let target = dir.join(&name);
        match create_file(&target, bytes) {
            Ok(()) => {
                let rel: Vec<String> = folder_rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .chain(std::iter::once(name))
                    .collect();
                return Ok(rel.join("/"));
            }
            Err(AppError::AlreadyExists(_)) => n += 1,
            Err(e) => return Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_images_beside_doc_without_clobbering() {
        let t = tempfile::tempdir().unwrap();
        let doc = t.path().join("My Note.md");
        let a = save_image_beside(&doc, b"1", "PNG", "assets", "20261015-101010").unwrap();
        let b = save_image_beside(&doc, b"2", "png", "assets", "20261015-101010").unwrap();
        assert_eq!(a, "assets/My Note-20261015-101010.png");
        assert_eq!(b, "assets/My Note-20261015-101010-2.png");
        assert_eq!(std::fs::read(t.path().join(&a)).unwrap(), b"1");
        assert!(save_image_beside(&doc, b"x", "exe", "assets", "1").is_err());
        assert!(save_image_beside(&doc, b"x", "png", "../out", "1").is_err());
        assert!(save_image_beside(&doc, b"x", "png", "/abs", "1").is_err());
        assert!(save_image_beside(&doc, b"x", "png", "assets", "1;rm").is_err());
        let nested = save_image_beside(&doc, b"3", "gif", "media/img", "1").unwrap();
        assert_eq!(nested, "media/img/My Note-1.gif");
    }

    #[test]
    fn duplicate_picks_free_names() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("note.md");
        std::fs::write(&p, "x").unwrap();
        let a = duplicate(&p).unwrap();
        let b = duplicate(&p).unwrap();
        assert_eq!(a.file_name().unwrap(), "note copy.md");
        assert_eq!(b.file_name().unwrap(), "note copy 2.md");
        let d = t.path().join("dir");
        std::fs::create_dir_all(d.join("sub")).unwrap();
        std::fs::write(d.join("sub/x.md"), "y").unwrap();
        let dc = duplicate(&d).unwrap();
        assert_eq!(std::fs::read_to_string(dc.join("sub/x.md")).unwrap(), "y");
    }

    #[test]
    fn rename_never_clobbers() {
        let t = tempfile::tempdir().unwrap();
        let a = t.path().join("a.md");
        let b = t.path().join("b.md");
        std::fs::write(&a, "a").unwrap();
        std::fs::write(&b, "b").unwrap();
        assert!(matches!(
            rename_no_clobber(&a, &b),
            Err(AppError::AlreadyExists(_))
        ));
        let c = t.path().join("c.md");
        rename_no_clobber(&a, &c).unwrap();
        assert_eq!(std::fs::read_to_string(&c).unwrap(), "a");
        let d = t.path().join("d");
        std::fs::create_dir(&d).unwrap();
        assert!(rename_no_clobber(&d, &d.join("inner")).is_err());
    }

    #[test]
    fn create_file_refuses_existing() {
        let t = tempfile::tempdir().unwrap();
        let a = t.path().join("a.md");
        create_file(&a, b"1").unwrap();
        assert!(matches!(
            create_file(&a, b"2"),
            Err(AppError::AlreadyExists(_))
        ));
        assert_eq!(std::fs::read_to_string(&a).unwrap(), "1");
    }

    #[test]
    fn atomic_write_creates_and_replaces() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("a.md");
        write_atomic(&p, b"one\r\n").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"one\r\n");
        write_atomic(&p, b"two").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"two");
        // No temp files left behind.
        let leftovers: Vec<_> = std::fs::read_dir(t.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().ends_with(".bztmp"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn atomic_write_fails_cleanly_in_missing_dir() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("nope").join("a.md");
        assert!(write_atomic(&p, b"x").is_err());
    }

    #[test]
    fn normalize_resolves_dots() {
        assert_eq!(
            normalize(Path::new("/a/b/../c/./d")),
            PathBuf::from("/a/c/d")
        );
    }

    #[test]
    fn lenient_canonicalize_handles_missing_tail() {
        let t = tempfile::tempdir().unwrap();
        let base = dunce_canonicalize(t.path()).unwrap();
        let p = t.path().join("new").join("file.md");
        assert_eq!(canonicalize_lenient(&p), base.join("new").join("file.md"));
    }
}
