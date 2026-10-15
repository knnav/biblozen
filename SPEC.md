# Biblozen — v1 Spec

A portable, reader-first desktop markdown app for macOS and Windows. Folder-based, keyboard-driven, heavily themeable. Editing is a first-class secondary mode.

> **For Claude Code:** work through the milestones in order, one per session. Each milestone has acceptance criteria — don't start the next until they pass. Ask before deviating from a decision in §2.

---

## 1. Principles

1. **Reader first.** Opening anything lands in read mode. Editing is opt-in, one keystroke away.
2. **Polish is the product.** Typography, motion, empty states and keyboard flow get real design time — they're not a final pass.
3. **The file is the truth.** Never rewrite a user's markdown except on explicit save. No hidden metadata files inside the user's folder.
4. **Portable.** No installer, no registry, no file associations. All app state lives in one data directory (§4.6).
5. **Everything is a command.** Every action is registered in the command palette with its shortcut.

---

## 2. Decisions log

| Topic | Decision |
|---|---|
| Shell | Tauri 2 |
| Frontend | React + TypeScript + Vite, Zustand for state |
| Editor | CodeMirror 6 |
| Markdown | markdown-it + plugins, DOMPurify sanitization |
| Code highlighting | Shiki |
| Default mode on open | Read mode, always (edit mode is not remembered per file) |
| New file | Opens in edit mode |
| Tabs | None in v1 — single document per window + quick open + history |
| Preview while editing | Debounced re-render (~150 ms), not per keystroke |
| Live inline preview (Obsidian-style) | Not in v1 |
| Edit mode layouts | Editor + preview split, or editor only (toggle) |
| Wikilinks | Yes, incl. backlinks; no transclusion, no rename-updates-links |
| Windows | One window per folder; opening a path inside an open folder focuses that window |
| File associations / registry | None on either OS in v1 |
| Signing | Unsigned in v1; document the Gatekeeper/SmartScreen workaround in README |

---

## 3. Layout & modes

### 3.1 Panes
- **Folder tree** (left) — always collapsible (`Mod+B`), animated, width persisted per folder. Dragging below min width collapses it.
- **Editor** — edit mode only.
- **Preview** — read mode, and optionally in edit mode.
- **Status bar** (bottom) — word count, reading time, cursor position (edit), save state, current theme name (click → theme picker).
- **Custom title bar** — macOS: overlay traffic lights; Windows: custom min/max/close. Shows folder name + file name + dirty dot.

### 3.2 Modes
| Mode | Panes |
|---|---|
| Read | tree + preview |
| Edit (split) | tree + editor + preview |
| Edit (editor only) | tree + editor |

- `Mod+E` toggles read ⇄ edit. In read mode, plain `e` also enters edit.
- `Mod+\` toggles split ⇄ editor-only within edit mode.
- Split is resizable; double-click divider snaps to 50/50. Option to put preview on the left.
- Switching modes preserves position: the topmost visible source line in one view becomes the topmost in the other (via `data-line` mapping, §6.3).

### 3.3 Focus mode
`Mod+Shift+F` hides tree, status bar and title chrome; centers content at reading width. `Esc` exits. Works in both modes.

---

## 4. Architecture

### 4.1 Process split
Keep Rust thin — it does filesystem, OS and window work. All rendering, indexing of links and UI logic live in the frontend.

**Rust (custom commands + plugins):**
- `tauri-plugin-fs` (with `watch` feature), `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-single-instance`, `tauri-plugin-window-state`.
- Custom commands:
  - `list_tree(root) -> TreeNode` — respects `.gitignore` (use the `ignore` crate); skips `.git`, `node_modules`.
  - `search(root, query, opts) -> Vec<FileMatches>` — full-text search across the folder (`ignore` + `grep-searcher`, or a simple line scan). Streams results via events for large folders.
  - `trash(path)` — via the `trash` crate. **Never** hard-delete.
  - `open_path(path)` — window routing (§4.4).
  - `reveal_in_os(path)`.
  - `write_file_atomic(path, contents)` — write to temp file in same dir, then rename.
  - `save_pasted_image(doc_path, bytes, ext) -> rel_path` (§7.4).

**Frontend modules (suggested):**
```
src/
  app/            window shell, layout, mode state
  commands/       command registry + palette
  tree/           folder tree UI + file ops
  render/         markdown-it pipeline, plugins, sanitization, mermaid/katex lazy loaders
  editor/         CodeMirror setup, keymaps, extensions
  index/          file index, wikilink resolver, backlinks
  themes/         token schema, loader, VS Code importer, reading styles
  reader/         keyboard nav, outline/scroll-spy, find, scroll memory, history
  settings/       settings store (persisted to data dir)
```

### 4.2 State
- **Per window:** root folder, open file, mode, layout sizes, tree expansion, navigation history.
- **Per folder (persisted):** last open file, tree expansion, pane sizes.
- **Per file (persisted, LRU-capped ~500 entries):** last scroll position (as source line).
- **Global (persisted):** settings, theme, reading style, recent folders. Changes broadcast to all windows via Tauri events.

### 4.3 File watching
- Watch the window's root recursively. Debounce events (~100 ms).
- Tree updates live on add/remove/rename.
- Open file changed on disk:
  - No unsaved edits → reload silently, preserve scroll.
  - Unsaved edits → non-modal banner: "Changed on disk — Reload / Keep mine / Show diff" (diff can be a simple side-by-side in v1, or deferred to just Reload/Keep).
- Ignore events caused by our own writes (track write timestamps/hashes).

### 4.4 Window routing (one window per folder)
Rust keeps a registry `window_label → canonical_root`.

`open_path(p)`:
1. Canonicalize `p`. Compare paths case-insensitively on Windows and on macOS default (APFS case-insensitive) volumes.
2. **Directory:** if a window has exactly this root → focus it. Else → new window rooted at `p`.
3. **File:** find windows whose root is an ancestor of `p`; pick the **deepest** root. Focus it and emit `open-file(p)`. If none → new window rooted at `parent(p)`, opening `p`.

Entry points that call `open_path`:
- CLI args on first launch.
- `tauri-plugin-single-instance` callback (args from a second launch).
- File → Open File / Open Folder dialogs.
- Drag-and-drop onto a window: if the dropped path is inside this window's root, open it here; otherwise route via `open_path`.
- Recent folders list.

Launch with no args → restore last session's windows (folder + open file). If none, show the welcome/empty window.

### 4.5 Local images & asset access
- Use Tauri's asset protocol (`convertFileSrc`). On opening a folder, add the root to the asset scope at runtime; never allow the whole disk.
- Resolve relative image paths against the **document's** directory.

### 4.6 Portable data directory
- **Windows:** `<exe dir>/data/` if writable; fall back to `%APPDATA%/Biblozen/` and show a one-time notice.
- **macOS:** `~/Library/Application Support/Biblozen/`. (Writing next to/inside the `.app` is unreliable due to App Translocation and breaks signatures.)
- Contents: `settings.json`, `state.json`, `themes/` (user themes, hot-reloaded), `logs/`.

### 4.7 Security
- DOMPurify every rendered document. Allow `class`, `id`, `data-line`, `data-wikilink`, KaTeX/Mermaid output; strip scripts, event handlers, `javascript:` URLs, iframes.
- Strict CSP in `tauri.conf.json`. No remote scripts. Remote images: allowed by default with a setting to block.
- Expose only the commands listed in §4.1 via Tauri capabilities.
- External links always open in the system browser via `opener`, never navigate the webview.

---

## 5. Folder tree

- Open folder via dialog, drag-and-drop, CLI, or recent list.
- Toggle "Markdown only" (default on) / "All files". Images remain visible in "All files".
- Sort: folders first, natural sort (`file2` < `file10`).
- Operations: new file, new folder, inline rename (`F2`/`Enter`), drag to move, delete → OS trash (with confirm), duplicate.
- Context menu: the above + Reveal in Finder/Explorer, Copy path, Copy relative path.
- Reveal active file (`Mod+Shift+E`, also automatic on open).
- Keyboard navigation: arrows, `Enter` opens, `Left/Right` collapse/expand, type-to-filter.
- Active file highlighted; files with unsaved edits show a dot.

---

## 6. Rendering (preview)

### 6.1 Supported syntax
- CommonMark + GFM: tables, task lists, strikethrough, autolinks.
- Footnotes.
- Heading anchors (GitHub-style slugs) with hover link icon.
- GitHub alerts: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`.
- Math: `$inline$` and `$$block$$` via KaTeX (lazy-loaded).
- Mermaid code blocks (lazy-loaded; themed from current theme tokens).
- Front matter (YAML): rendered as a collapsible metadata card, not raw text.
- Wikilinks (§8).
- Code blocks: Shiki highlighting, language label, copy button. Load grammars lazily.

### 6.2 Links
- Relative `.md` links → open in-app (respecting window routing if outside root).
- `#anchor` → smooth scroll.
- `other.md#heading` → open + scroll.
- External → system browser.
- Hover on internal links shows the target path in the status bar.

### 6.3 Source mapping
- Every block element gets `data-line="<start source line>"` from markdown-it token maps.
- Used for: scroll sync, mode-switch position preservation, scroll memory, task checkbox toggling, outline jump.

### 6.4 Interactive task lists
Clicking a checkbox in the preview toggles `[ ]` ⇄ `[x]` at that source line and saves immediately (only if the file has no unsaved editor changes; otherwise apply to the editor buffer).

### 6.5 Performance
- Debounce re-render while editing (~150 ms).
- Cache rendered Mermaid/KaTeX output keyed by source string; only re-render changed blocks.
- Target: 1 MB markdown file renders in < 300 ms on a mid-range laptop.

---

## 7. Editor (edit mode)

### 7.1 Core
- CodeMirror 6 with markdown language support, themed from app tokens.
- Smart list continuation, `Tab`/`Shift+Tab` indent/outdent lists.
- Formatting: `Mod+B` bold, `Mod+I` italic, `Mod+K` link, `` Mod+` `` inline code. (Note: `Mod+B` in the editor is bold; tree toggle in edit mode uses `Mod+Shift+B`. In read mode `Mod+B` toggles the tree. Surface both in the palette.)
- Find/replace (`Mod+F`, `Mod+H`/`Mod+Alt+F`).
- Optional vim mode (`@replit/codemirror-vim`), setting toggle.
- Soft wrap on by default; configurable font, size, line height.

### 7.2 Scroll sync
Editor ⇄ preview, bidirectional, using `data-line` anchors with interpolation between them. Setting to disable.

### 7.3 Saving
- `Mod+S` save; dirty indicator in title bar, tree, and status bar.
- Optional autosave (on focus loss / after N seconds idle).
- Atomic writes (§4.1). Preserve the file's existing line endings and trailing newline.
- Switching files or closing a window with unsaved changes → prompt Save / Discard / Cancel.

### 7.4 Paste / drop images
Pasting or dropping an image saves it to `assets/` beside the document (configurable folder name), named `<doc-name>-<timestamp>.<ext>`, and inserts a relative markdown image link.

### 7.5 Wikilink autocomplete
Typing `[[` opens completion from the file index (fuzzy). After `#`, complete headings of the chosen file.

---

## 8. Wikilinks & index

### 8.1 Syntax
- `[[note]]`, `[[note#heading]]`, `[[note|alias]]`, `[[note#heading|alias]]`.
- `![[image.png]]` → image embed. (Note transclusion `![[note]]` is out of scope; render as a link.)

### 8.2 Resolution
- Match by filename (with or without `.md`), case-insensitive, anywhere in the root.
- Path-qualified links (`[[folder/note]]`) match by path suffix.
- Ambiguity → shortest path wins (Obsidian rule).
- Unresolved links get a distinct style; clicking creates the file (in the folder of the current doc) and opens it in edit mode.

### 8.3 Index
- Built on folder open; updated incrementally from watcher events.
- Holds: file list (for quick open + resolution), headings per file, outgoing links per file.
- Backlinks = inverted outgoing-links map.
- Large folders: build in a worker; UI usable immediately, panels show a loading state.

### 8.4 Backlinks panel
Toggleable panel (below outline or as a right sidebar section). Lists files linking to the current one, with a one-line context snippet; click to open at that line.

---

## 9. Navigation

- **Command palette** (`Mod+Shift+P`): every action, fuzzy, shows shortcut; recently used first.
- **Quick open** (`Mod+P`): fuzzy file finder over the index; `Mod+P` then `#` → jump to heading in current file (nice-to-have).
- **Search across files** (`Mod+Shift+S`): results grouped by file with match highlights; click opens at line in read mode.
- **Outline** (`o` in read mode / `Mod+Shift+O`): headings tree with scroll-spy highlighting the current section; click jumps.
- **History:** back/forward across files and anchor jumps (`Mod+[` / `Mod+]`, and `[` / `]` in read mode, mouse back/forward buttons).

---

## 10. Reader UX

- **Keyboard nav in read mode** (no text focus):

  | Key | Action |
  |---|---|
  | `j` / `k` | Scroll line |
  | `d` / `u` or `Space` / `Shift+Space` | Half / full page |
  | `g g` / `G` | Top / bottom |
  | `e` | Enter edit mode |
  | `/` | Find in document |
  | `n` / `N` | Next / previous match |
  | `o` | Toggle outline |
  | `b` | Toggle backlinks |
  | `[` / `]` | History back / forward |
  | `t` | Theme picker |

- **Find in document** (`Mod+F` / `/`): highlights all matches, match count, next/prev.
- **Scroll memory:** reopening a file restores its last position.
- **Reading progress:** thin progress bar under the title bar (setting).
- **Reading width:** adjustable max width (default ~70ch), centered.
- **Zoom:** separate preview and editor zoom (`Mod+=`, `Mod+-`, `Mod+0` act on the focused pane).

---

## 11. Theme system

### 11.1 Two independent axes
- **Color theme:** colors for chrome, editor, preview, code.
- **Reading style:** typography + layout for the preview only.

Settings: `theme.light`, `theme.dark`, `theme.followOS` (default true), `readingStyle`.

### 11.2 Color token schema
Themes are JSON; all UI uses CSS variables generated from tokens. Required tokens (others derived if missing):

```jsonc
{
  "name": "Example Dark",
  "type": "dark",
  "tokens": {
    "bg.base": "#1e1e2e",        // main content background
    "bg.sidebar": "#181825",
    "bg.elevated": "#252537",    // palette, menus, popovers
    "bg.titlebar": "#181825",
    "bg.statusbar": "#181825",
    "bg.selection": "#45475a",
    "bg.hover": "#313244",
    "bg.active": "#3a3a52",
    "bg.codeblock": "#181825",
    "bg.inlinecode": "#313244",
    "bg.callout": "#24243a",

    "fg.base": "#cdd6f4",
    "fg.muted": "#a6adc8",
    "fg.subtle": "#6c7086",
    "fg.heading": "#f5e0dc",
    "fg.link": "#89b4fa",
    "fg.linkUnresolved": "#f38ba8",
    "fg.inlinecode": "#f5c2e7",

    "accent": "#cba6f7",
    "accent.fg": "#1e1e2e",
    "border": "#313244",
    "border.strong": "#45475a",
    "focusRing": "#cba6f7",
    "scrollbar": "#45475a",

    "callout.note": "#89b4fa",
    "callout.tip": "#a6e3a1",
    "callout.important": "#cba6f7",
    "callout.warning": "#f9e2af",
    "callout.caution": "#f38ba8",

    "editor.cursor": "#f5e0dc",
    "editor.lineHighlight": "#24243a",
    "editor.gutterFg": "#6c7086"
  },
  "syntax": "catppuccin-mocha"   // Shiki theme id, or inline tokenColors
}
```

### 11.3 VS Code theme import
- Ship a catalog derived from Shiki's bundled themes: map the VS Code `colors` block → tokens (e.g. `editor.background → bg.base`, `sideBar.background → bg.sidebar`, `textLink.foreground → fg.link`, `focusBorder → focusRing`, `list.hoverBackground → bg.hover` …), and use the same theme for Shiki code highlighting.
- Missing tokens are derived with color math (e.g. `culori`): elevate/darken `bg.base`, mix `fg.base` toward background for muted/subtle, etc.
- Build step script generates `themes/builtin/*.json` from Shiki; hand-tune the top ~10 by overriding tokens in a separate overrides file (so regeneration doesn't lose tuning).
- Users can drop a VS Code theme `.json` **or** a native theme JSON into `data/themes/`; both are loaded and hot-reloaded.
- Editor (CodeMirror) and markdown syntax colors in the editor are derived from the theme's `tokenColors` via `markup.*` scopes, falling back to tokens.

### 11.4 Reading styles
CSS files scoped by `[data-reading-style]` on the preview root. Ship v1 with:
- **GitHub** — familiar sans, GitHub-like spacing (default).
- **Book** — serif body, generous leading, ~65ch, drop-cap option off.
- **Academic** — serif, numbered headings, tighter, footnotes prominent.
- **Compact** — dense, smaller headings, for reference docs.
- **Mono** — monospace everything, terminal feel.

Reading styles use only typography/spacing; colors always come from the color theme. Bundle fonts locally (no Google Fonts at runtime — portable + offline).

### 11.5 Theme picker
- Palette-style list with search; arrow keys **live-preview** each theme across the whole window; `Enter` applies, `Esc` reverts.
- Filter: All / Light / Dark. Shows swatches.
- Same picker pattern for reading styles.

---

## 12. Keyboard shortcuts (final map)

`Mod` = Cmd on macOS, Ctrl on Windows. All rebindable in a later version; in v1 they're fixed but listed in the palette.

| Action | Shortcut |
|---|---|
| Command palette | `Mod+Shift+P` |
| Quick open | `Mod+P` |
| Search in folder | `Mod+Shift+S` |
| Toggle read/edit | `Mod+E` |
| Toggle split/editor-only | `Mod+\` |
| Toggle tree | `Mod+B` (read) / `Mod+Shift+B` (edit) |
| Reveal active file in tree | `Mod+Shift+E` |
| Outline | `Mod+Shift+O` |
| Backlinks | `Mod+Shift+L` |
| Focus mode | `Mod+Shift+F` |
| Find in document | `Mod+F` |
| Save | `Mod+S` |
| New file | `Mod+N` |
| Open file | `Mod+O` |
| Open folder | `Mod+Alt+O` |
| New window | `Mod+Shift+N` |
| Back / forward | `Mod+[` / `Mod+]` |
| Zoom in / out / reset | `Mod+=` / `Mod+-` / `Mod+0` |
| Theme picker | `Mod+K Mod+T` (chord) / `t` in read mode |
| Settings | `Mod+,` |

---

## 13. Export

- **HTML:** single self-contained file — inlined CSS for current theme + reading style, inlined images as data URIs (setting), KaTeX CSS, pre-rendered Mermaid SVG.
- **PDF:** via the webview print dialog with a print stylesheet (light-forced option, page breaks before H1 option).
- **Copy as HTML** to clipboard.

---

## 14. Settings

A settings screen (`Mod+,`) with search, backed by `settings.json` (editable by hand, hot-reloaded). Groups: Appearance (themes, reading style, fonts, width, zoom), Reader (progress bar, scroll memory, remote images), Editor (font, vim, autosave, wrap, scroll sync, image folder), Files (markdown-only filter, ignored patterns), Advanced (open data folder).

---

## 15. Empty states & first run

- No folder open: centered panel — Open Folder, Open File, recent folders (with remove), drop-zone hint.
- Empty folder: "No markdown files" + New File button.
- First run: open a bundled **Welcome** folder (read-only copy in data dir) demonstrating every rendering feature, wikilinks, shortcuts and theme picker. Doubles as the manual test fixture.

---

## 16. Out of scope for v1

Tabs · live inline preview · note transclusion · rename-updates-links · file associations / registry · code signing · plugins · sync · git integration · spellcheck settings (native webview spellcheck may be on by default in the editor) · rebindable shortcuts · graph view · mobile.

---

## 17. Milestones

Each milestone ends with a working, launchable app.

### M0 — Scaffold & CI
- Tauri 2 + React + TS + Vite project, lint/format (ESLint, Prettier, rustfmt, clippy), Vitest.
- GitHub Actions: macOS universal (`.app` zipped) + Windows portable `.exe`, unsigned, as artifacts on every push to `main`.
- Data directory resolution (§4.6), settings store with hot reload.
- **Accept:** CI produces both builds; each launches and shows an empty window; settings file appears in the right place on each OS.

### M1 — Shell & layout
- Custom title bar (both OSes), panes, collapsible animated tree, resizable split, status bar, mode state machine (§3.2), focus mode.
- Command registry + palette; every later feature registers through it.
- **Accept:** all three layouts reachable via shortcuts and palette; sizes persist across restarts.

### M2 — Folder tree & file ops
- `list_tree`, watcher, file ops incl. trash, context menu, keyboard nav, markdown-only filter, empty states, recent folders.
- **Accept:** external changes appear live; delete goes to trash; tree is fully keyboard-operable.

### M3 — Rendering pipeline (read mode)
- markdown-it with all §6.1 syntax (wikilinks render but resolve in M7), Shiki, KaTeX, Mermaid lazy loading, DOMPurify, local images, link handling, `data-line` mapping, front matter card, task-list toggling.
- Welcome folder fixture.
- **Accept:** Welcome docs render correctly; a malicious fixture (`<script>`, `onerror`, `javascript:`) is neutralized; 1 MB file meets §6.5 target.

### M4 — Theme system
- Token schema → CSS variables, Shiki catalog import script with color derivation, overrides file, user themes folder with hot reload, follow-OS light/dark, reading styles, live-preview picker.
- **Accept:** ≥ 40 built-in themes all legible (contrast check script: body text ≥ 4.5:1); switching is instant; dropping a VS Code theme JSON into `data/themes/` makes it appear without restart.

### M5 — Reader UX
- Keyboard nav (§10), outline with scroll-spy, find in document, scroll memory, progress bar, reading width, zoom, history.
- **Accept:** a doc can be fully read and navigated without the mouse.

### M6 — Editor
- CodeMirror with theming, keymaps, list behavior, find/replace, vim toggle, split + editor-only, debounced preview, scroll sync, mode-switch position preservation, save/dirty/atomic writes, conflict banner, autosave, paste/drop images.
- **Accept:** edit → save round-trips preserve line endings; external change during edit shows banner; no data loss on window close.

### M7 — Index, wikilinks, search
- File index in worker, wikilink resolution + unresolved styling + create-on-click, `![[image]]` embeds, autocomplete, backlinks panel, quick open, folder search.
- **Accept:** on a 2,000-file folder, index builds in background without blocking UI; backlinks update when another file adds a link.

### M8 — Multi-window routing
- Window registry, `open_path` (§4.4), single-instance forwarding, drag-and-drop routing, session restore.
- **Accept:** opening a file inside an already-open folder (via CLI or dialog) focuses that window and opens the file; nested roots pick the deepest; settings/theme changes apply to all windows.

### M9 — Export & polish
- HTML/PDF/copy-as-HTML export, settings screen, motion pass (consistent durations/easing tokens), accessibility pass (focus rings, ARIA on tree/palette, reduced-motion support), README with unsigned-app launch instructions.
- **Accept:** exported HTML opens identically in a browser offline; full keyboard + screen-reader pass on tree, palette, settings.

---

## 18. Conventions

- TypeScript strict mode. No `any` without a comment explaining why.
- Unit tests for: wikilink resolution, path routing (`open_path` logic extracted to a pure function), theme derivation, `data-line` mapping, task-toggle source edits.
- Rust commands return typed errors; frontend shows them as toasts, never silently swallows.
- Motion: define duration/easing tokens once (e.g. 120 ms / 200 ms, `cubic-bezier(0.2, 0, 0, 1)`), respect `prefers-reduced-motion`.
- No network calls at runtime except user-content remote images (setting-controlled).
