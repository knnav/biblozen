//! Full-text search across a folder (SPEC §4.1, §9). Results stream per file.

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOpts {
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
    #[serde(default = "yes")]
    pub markdown_only: bool,
    #[serde(default = "default_max")]
    pub max_results: usize,
}

fn yes() -> bool {
    true
}
fn default_max() -> usize {
    2000
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// 0-based line number.
    pub line: usize,
    pub text: String,
    /// Match ranges in UTF-16 code units within `text` (for JS).
    pub ranges: Vec<(usize, usize)>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub matches: Vec<LineMatch>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummary {
    pub files: usize,
    pub matches: usize,
    pub truncated: bool,
    pub cancelled: bool,
}

pub const MAX_LINE_CHARS: usize = 300;
pub const MAX_PER_FILE: usize = 100;
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

pub fn build_regex(query: &str, opts: &SearchOpts) -> Result<Regex, regex::Error> {
    let mut pat = if opts.regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    if opts.whole_word {
        pat = format!(r"\b(?:{pat})\b");
    }
    RegexBuilder::new(&pat)
        .case_insensitive(!opts.case_sensitive)
        .size_limit(1 << 22)
        .build()
}

fn is_markdown(p: &Path) -> bool {
    matches!(
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("md" | "markdown" | "mdown" | "mkd" | "mdx")
    )
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Matches in one file's text.
pub fn search_text(re: &Regex, text: &str) -> Vec<LineMatch> {
    let mut out = Vec::new();
    for (i, line) in text.lines().enumerate() {
        let mut ranges = Vec::new();
        for m in re.find_iter(line) {
            if m.start() == m.end() {
                continue;
            }
            ranges.push((m.start(), m.end()));
        }
        if ranges.is_empty() {
            continue;
        }
        // Trim long lines around the first match so the context stays readable.
        let first = ranges[0].0;
        let mut start = 0;
        if line.len() > MAX_LINE_CHARS && first > 80 {
            start = first - 60;
            while !line.is_char_boundary(start) {
                start -= 1;
            }
        }
        let mut end = line.len().min(start + MAX_LINE_CHARS * 2);
        while !line.is_char_boundary(end) {
            end -= 1;
        }
        let shown = &line[start..end];
        let prefix = if start > 0 { "…" } else { "" };
        let text = format!("{prefix}{}", shown.trim_end());
        let base = utf16_len(prefix);
        let ranges = ranges
            .into_iter()
            .filter(|(s, e)| *s >= start && *e <= end)
            .map(|(s, e)| {
                let a = base + utf16_len(&line[start..s]);
                (a, a + utf16_len(&line[s..e]))
            })
            .collect();
        out.push(LineMatch {
            line: i,
            text,
            ranges,
        });
        if out.len() >= MAX_PER_FILE {
            break;
        }
    }
    out
}

/// Walks `root` (respecting .gitignore etc.) and reports files with matches.
/// `on_file` returns false to stop early (cancellation).
pub fn search_folder(
    root: &Path,
    re: &Regex,
    opts: &SearchOpts,
    extra_ignores: &[String],
    mut on_file: impl FnMut(FileMatches) -> bool,
) -> SearchSummary {
    let mut summary = SearchSummary::default();
    for entry in crate::tree::walker(root, extra_ignores).build().flatten() {
        let path = entry.path();
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        if opts.markdown_only && !is_markdown(path) {
            continue;
        }
        if entry
            .metadata()
            .map(|m| m.len() > MAX_FILE_BYTES)
            .unwrap_or(true)
        {
            continue;
        }
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        if bytes.iter().take(8192).any(|b| *b == 0) {
            continue; // binary
        }
        let text = String::from_utf8_lossy(&bytes);
        let matches = search_text(re, &text);
        if matches.is_empty() {
            continue;
        }
        summary.files += 1;
        summary.matches += matches.iter().map(|m| m.ranges.len()).sum::<usize>();
        let keep_going = on_file(FileMatches {
            path: path.to_string_lossy().into_owned(),
            matches,
        });
        if !keep_going {
            summary.cancelled = true;
            break;
        }
        if summary.matches >= opts.max_results {
            summary.truncated = true;
            break;
        }
    }
    summary
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> SearchOpts {
        SearchOpts {
            case_sensitive: false,
            whole_word: false,
            regex: false,
            markdown_only: true,
            max_results: 2000,
        }
    }

    #[test]
    fn finds_matches_with_utf16_ranges() {
        let re = build_regex("cat", &opts()).unwrap();
        let m = search_text(&re, "no\nThe Cat and the cat 🐈 cat\n");
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].line, 1);
        // "The Cat and the cat 🐈 cat": 🐈 is 2 UTF-16 units.
        assert_eq!(m[0].ranges, vec![(4, 7), (16, 19), (23, 26)]);
    }

    #[test]
    fn options_change_matching() {
        let mut o = opts();
        o.case_sensitive = true;
        assert_eq!(
            search_text(&build_regex("Cat", &o).unwrap(), "cat Cat").len(),
            1
        );
        let mut w = opts();
        w.whole_word = true;
        assert_eq!(
            search_text(&build_regex("cat", &w).unwrap(), "concat")[..].len(),
            0
        );
        let mut r = opts();
        r.regex = true;
        assert_eq!(
            search_text(&build_regex(r"c.t", &r).unwrap(), "cut")[0].ranges,
            vec![(0, 3)]
        );
        assert!(build_regex("(", &r).is_err());
        assert_eq!(
            search_text(&build_regex("(", &opts()).unwrap(), "f(x)")[0].ranges,
            vec![(1, 2)]
        );
    }

    #[test]
    fn walks_folder_respecting_ignores_and_markdown_only() {
        let t = tempfile::tempdir().unwrap();
        let r = t.path();
        std::fs::write(r.join(".gitignore"), "skip/\n").unwrap();
        std::fs::write(r.join("a.md"), "alpha needle").unwrap();
        std::fs::write(r.join("b.txt"), "needle in txt").unwrap();
        std::fs::create_dir_all(r.join("skip")).unwrap();
        std::fs::write(r.join("skip/c.md"), "needle").unwrap();
        std::fs::write(r.join("bin.md"), b"needle\0binary").unwrap();
        let re = build_regex("needle", &opts()).unwrap();
        let mut found = Vec::new();
        let s = search_folder(r, &re, &opts(), &[], |f| {
            found.push(f.path);
            true
        });
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("a.md"));
        assert_eq!(s.matches, 1);
        let mut all = opts();
        all.markdown_only = false;
        let s2 = search_folder(r, &re, &all, &[], |_| true);
        assert_eq!(s2.files, 2);
        let s3 = search_folder(r, &re, &all, &[], |_| false);
        assert!(s3.cancelled);
    }

    #[test]
    fn trims_long_lines_around_the_match() {
        let line = format!("{}needle{}", "x".repeat(500), "y".repeat(500));
        let m = search_text(&build_regex("needle", &opts()).unwrap(), &line);
        assert!(m[0].text.starts_with('…'));
        let (a, b) = m[0].ranges[0];
        let units: Vec<u16> = m[0].text.encode_utf16().collect();
        assert_eq!(String::from_utf16(&units[a..b]).unwrap(), "needle");
    }
}
