//! Folder listing for the tree (SPEC §5): respects .gitignore, skips .git/node_modules.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub kind: NodeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    File,
    Dir,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeListing {
    pub root: TreeNode,
    pub truncated: bool,
    pub count: usize,
}

pub const ALWAYS_SKIP: &[&str] = &[".git", "node_modules"];
pub const MAX_ENTRIES: usize = 50_000;

/// Builds a walker shared by tree listing and search.
pub fn walker(root: &Path, extra_ignores: &[String]) -> ignore::WalkBuilder {
    let mut b = ignore::WalkBuilder::new(root);
    b.hidden(true)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(true)
        .require_git(false)
        .ignore(true)
        .parents(false)
        .follow_links(false)
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !ALWAYS_SKIP.iter().any(|s| *s == name)
        });
    if !extra_ignores.is_empty() {
        let mut ob = ignore::overrides::OverrideBuilder::new(root);
        for pat in extra_ignores {
            // Overrides are whitelists by default; "!" turns a glob into an ignore.
            let _ = ob.add(&format!("!{pat}"));
        }
        if let Ok(o) = ob.build() {
            b.overrides(o);
        }
    }
    b
}

pub fn list_tree(root: &Path, extra_ignores: &[String]) -> TreeListing {
    let mut dirs: BTreeMap<PathBuf, Vec<TreeNode>> = BTreeMap::new();
    let mut dir_paths: Vec<PathBuf> = Vec::new();
    let mut count = 0usize;
    let mut truncated = false;

    for entry in walker(root, extra_ignores).build().flatten() {
        if entry.depth() == 0 {
            continue;
        }
        if count >= MAX_ENTRIES {
            truncated = true;
            break;
        }
        count += 1;
        let Some(ft) = entry.file_type() else {
            continue;
        };
        let path = entry.path().to_path_buf();
        let parent = path.parent().unwrap_or(root).to_path_buf();
        let name = entry.file_name().to_string_lossy().into_owned();
        if ft.is_dir() {
            dir_paths.push(path.clone());
            dirs.entry(path.clone()).or_default();
            dirs.entry(parent).or_default().push(TreeNode {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: NodeKind::Dir,
                children: None,
            });
        } else if ft.is_file() {
            dirs.entry(parent).or_default().push(TreeNode {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: NodeKind::File,
                children: None,
            });
        }
    }

    fn build(path: &Path, dirs: &mut BTreeMap<PathBuf, Vec<TreeNode>>) -> Vec<TreeNode> {
        let mut kids = dirs.remove(path).unwrap_or_default();
        for k in kids.iter_mut() {
            if k.kind == NodeKind::Dir {
                k.children = Some(build(Path::new(&k.path), dirs));
            }
        }
        kids
    }

    let children = build(root, &mut dirs);
    TreeListing {
        root: TreeNode {
            name: root
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| root.to_string_lossy().into_owned()),
            path: root.to_string_lossy().into_owned(),
            kind: NodeKind::Dir,
            children: Some(children),
        },
        truncated,
        count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn names(n: &TreeNode) -> Vec<String> {
        let mut v: Vec<String> = n
            .children
            .as_ref()
            .unwrap()
            .iter()
            .map(|c| c.name.clone())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn respects_gitignore_and_skips_noise() {
        let t = tempfile::tempdir().unwrap();
        let r = t.path();
        fs::write(r.join(".gitignore"), "build/\n*.log\n").unwrap();
        fs::write(r.join("a.md"), "").unwrap();
        fs::write(r.join("x.log"), "").unwrap();
        fs::create_dir_all(r.join("build")).unwrap();
        fs::write(r.join("build/out.md"), "").unwrap();
        fs::create_dir_all(r.join("node_modules/p")).unwrap();
        fs::write(r.join("node_modules/p/readme.md"), "").unwrap();
        fs::create_dir_all(r.join(".git")).unwrap();
        fs::create_dir_all(r.join("docs/deep")).unwrap();
        fs::write(r.join("docs/deep/b.md"), "").unwrap();

        let l = list_tree(r, &[]);
        assert_eq!(names(&l.root), vec!["a.md", "docs"]);
        let docs = &l
            .root
            .children
            .as_ref()
            .unwrap()
            .iter()
            .find(|c| c.name == "docs")
            .unwrap();
        assert_eq!(names(docs), vec!["deep"]);
        assert!(!l.truncated);
    }

    #[test]
    fn extra_ignore_patterns_apply() {
        let t = tempfile::tempdir().unwrap();
        let r = t.path();
        fs::write(r.join("a.md"), "").unwrap();
        fs::create_dir_all(r.join("drafts")).unwrap();
        fs::write(r.join("drafts/b.md"), "").unwrap();
        let l = list_tree(r, &["drafts".to_string()]);
        assert_eq!(names(&l.root), vec!["a.md"]);
    }
}
