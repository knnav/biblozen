# Decisions

## ⚠️ Deviations from spec

_None so far._

## Log

Format: date · milestone · question → choice (reason)

- 2026-10-15 · M0 · TypeScript version → `~6.0` rather than the newest 7.x (typescript-eslint's peer range is `<6.1`).
- 2026-10-15 · M0 · Linux data dir (not in spec; dev host only) → `$XDG_CONFIG_HOME/Biblozen` or `~/.config/Biblozen`.
- 2026-10-15 · M0 · How the frontend reads/writes app state → reads via `tauri-plugin-fs` (data dir added to the fs scope at startup); writes via our `write_file_atomic` command, which is scope-checked in Rust (data dir + opened roots). Added one command not in §4.1, `get_data_dir`, because the frontend needs the path. (Simplest; keeps all writes atomic.)
- 2026-10-15 · M0 · Settings hot reload + cross-window broadcast → every window watches `settings.json`; a write from one window (or a hand edit) reloads all others. No separate Tauri event needed. Own-write echoes are ignored by comparing file text.
- 2026-10-15 · M0 · Settings file shape → nested JSON (`theme.light` lives at `{"theme":{"light":…}}`); values of the wrong type fall back to defaults per key; invalid JSON keeps the current in-memory settings and shows an error.
- 2026-10-15 · M0 · Windows are created from Rust (`WebviewWindowBuilder`) instead of `tauri.conf.json`, so chrome can differ per OS (macOS overlay title bar; Windows/Linux undecorated with custom controls).
- 2026-10-15 · M0 · Bundling → macOS `app` bundle only; Windows and Linux use `bundle.active=false` (portable exe / raw binary, no installer).
- 2026-10-15 · M0 · Version control → the user's Claude settings block committing and pushing. All work stays uncommitted on branch `v1`; PROGRESS.md records milestone boundaries instead of commits. The Windows build is verified locally by cross-compiling with `cargo-xwin`.
- 2026-10-15 · M2 · Extra commands beyond §4.1 → `set_window_root`, `create_file`, `create_dir`, `rename_path`, `duplicate_path`, plus env-gated `smoke_config`/`smoke_exit`. File operations need scope-checked, no-clobber semantics that the fs plugin's generic API doesn't give us.
- 2026-10-15 · M2 · "Markdown only" filter → shows Markdown files and folders that contain Markdown somewhere below; folders with no files at all also stay visible, so a newly created folder doesn't vanish.
- 2026-10-15 · M2 · `Enter` in the tree: §5 lists it for both rename and open → `Enter` opens (keyboard-nav rule), `F2` renames on every OS.
- 2026-10-15 · M2 · Focus after opening from the tree → click/`Enter` moves focus to the content so reader keys (`j`, `e`, …) work at once; `Space` opens while keeping focus in the tree. Otherwise type-to-filter would swallow reader keys.
- 2026-10-15 · M2 · `Delete` only trashes when the tree has focus (never while reading), and always asks for confirmation.
- 2026-10-15 · M2 · Hidden files/folders (dot-prefixed) are not listed, matching the `ignore` crate's defaults.
- 2026-10-15 · M2 · Real-backend verification without WebDriver → env-gated self-test mode (`BIBLOZEN_SMOKE_DIR`), run against the Linux binary and, via WSL interop, the Windows exe.
- 2026-10-15 · M3 · Sanitizing 1 MB with DOMPurify took ~480 ms → DOMPurify still sanitizes all untrusted HTML, but only the top-level blocks that contain raw HTML (merged across blocks while tags are left open). markdown-it escapes everything else; our own generated markup uses a separate `bz_html` token type. The CSP (no inline scripts) is a second layer.
- 2026-10-15 · M3 · Mermaid/math sources are kept in text content, not attributes: DOMPurify drops attributes containing `-->`, which breaks diagrams like `A-->B`.
- 2026-10-15 · M3 · Mermaid uses SVG text labels (`htmlLabels: false`); HTML labels inside `foreignObject` don't survive SVG sanitizing.
- 2026-10-15 · M3 · Shiki uses the JavaScript regex engine (no WASM) and per-language lazy loading; code renders as plain text first, then highlights.
- 2026-10-15 · M3 · Links to non-Markdown local files (PDFs etc.) are revealed in the OS file manager rather than opened, to keep the opener permission surface minimal.
- 2026-10-15 · M3 · The Welcome folder is copied into the data dir once (missing files restored by "Open Welcome Folder"); it isn't made read-only on disk, so the editing tour works on it.
- 2026-10-15 · M3 · Launch with no args reopens the most recent folder (full multi-window session restore comes in M8).
- 2026-10-15 · M3 · Large documents (>400 top-level blocks) render in chunks with `content-visibility: auto`, split at h1–h3 so margins stay right. Per-block `content-visibility` was pathological in Chromium (~10 s layout).
- 2026-10-15 · M4 · Headings in derived themes use a slightly stronger body color, not the code theme's `markup.heading` color (which is often red/pink and loud for reading). Hand-tuned themes choose their own (Dracula keeps its purple).
- 2026-10-15 · M4 · Calm chrome: a theme's title bar, status bar and active-row colors are used only when close to the editor background; saturated ones (VS Code's blue status bar, Nord's cyan selection) are replaced by derived surfaces.
- 2026-10-15 · M4 · Legibility fixes move secondary surfaces (code block, palette, active row, selection backgrounds) rather than the theme's body text color.
- 2026-10-15 · M4 · "GitHub Dark" in the top 10 is Shiki's `github-dark-default` (today's GitHub palette); the older `github-dark` stays as its own entry.
- 2026-10-15 · M4 · Picking a theme of the other appearance while following the OS turns following off (otherwise the choice wouldn't show) and offers a "Follow system" action in a toast.
- 2026-10-15 · M4 · Academic reading style is ragged-right with hyphenation; justified text rivered badly on screen around inline code.
- 2026-10-15 · M4 · Settings saves merge: only keys changed in-app are written over the current disk copy, fixing a lost-update race with hand edits/other windows. Files are not rewritten when only their formatting differs.
- 2026-10-15 · M4 · The perf budget can be loosened with `PERF_BUDGET_MS` on slower machines; the default is the spec's 300 ms.
- 2026-10-15 · M5 · Scroll memory and history store the source line of the top visible block (per spec), skipping a block that's almost scrolled past; restoring therefore lands on block starts rather than exact pixels.
- 2026-10-15 · M5 · `Mod+F` opens the reader's find bar in read mode; in edit mode it's left to the editor's own find (M6).
- 2026-10-15 · M5 · Arrow keys scroll the preview in read mode when focus isn't already inside the preview (where the browser scrolls natively).
- 2026-10-15 · M6 · One persistent CodeMirror view per window, re-attached on mode/layout switches (rather than re-created), so undo history and selection survive read ⇄ edit toggles.
- 2026-10-15 · M6 · Editor shows line numbers (uses the theme's `editor.gutterFg` token); no setting for it in v1.
- 2026-10-15 · M6 · `Tab` indents list items and otherwise inserts a tab; leaving the editor by keyboard uses the global shortcuts (e.g. `Mod+Shift+E` → sidebar), since Tab is taken.
- 2026-10-15 · M6 · Pasted images travel as a raw IPC body (headers carry the percent-encoded doc path, folder and timestamp) instead of a JSON byte array. The timestamp is the frontend's local time (`YYYYMMDD-HHMMSS`).
- 2026-10-15 · M6 · Images dropped from the OS onto the editor (Tauri gives paths) are copied via `import_image`, which reads any path the user dropped but only accepts image extensions and only writes inside the open folder.
- 2026-10-15 · M6 · "Show diff" is a unified line diff in a dialog (LCS after trimming common prefix/suffix; refuses very large inputs) rather than side-by-side.
- 2026-10-15 · M6 · The reading progress bar stays empty for documents that fit on screen.
- 2026-10-15 · M7 · Workers can't use Tauri IPC, so the main thread reads files (async, batched, yielding between batches) and the worker parses and answers queries. Without `Worker` (unit tests) the same core runs in-thread.
- 2026-10-15 · M7 · Backlinks count wikilinks and relative Markdown links (`[x](note.md)`); image embeds aren't backlinks.
- 2026-10-15 · M7 · Folder search follows the sidebar's Markdown-only setting (all text files when off), skips binaries and files over 10 MB, and caps at 2,000 matches / 100 per file.
- 2026-10-15 · M7 · Search uses Rust's `regex` crate (patterns follow its syntax, which is close to JavaScript's); invalid patterns show the parser error.
- 2026-10-15 · M7 · Quick open shows 50 results at most (render cost in big folders); typing narrows further.
- 2026-10-15 · M8 · Session restore is owned by Rust (`session.json` in the data dir, written as windows report their folder/file), so it works before any frontend loads; per-folder UI state stays in the frontend's `state.json`.
- 2026-10-15 · M8 · A window without a folder adopts what it opens (dialog, recent list, drop) instead of spawning a second window; a window with a folder opening another folder spawns/focuses per §4.4.
- 2026-10-15 · M8 · Files routed to a window that hasn't loaded yet travel in its init payload rather than as an event (events to not-yet-loaded webviews are lost).
- 2026-10-15 · M8 · Window-creating commands and the single-instance callback run off the main thread (async), because creating a webview synchronously there deadlocks on Windows.
- 2026-10-15 · M8 · "Open Welcome Folder" from a window that already has a folder routes like any other folder (new window).
- 2026-10-15 · M9 · PDF export uses Tauri's native `WebviewWindow::print()` (works in WKWebView, unlike `window.print()`) with a print stylesheet; "force light" temporarily previews the configured light theme while the dialog is up.
- 2026-10-15 · M9 · HTML export renders the document off-screen with the live theme, embeds the fonts actually used (reading style, code, KaTeX) and local images as data URIs, drops interactive bits (copy buttons, anchors, checkbox clicks) and points wikilinks at the target `.md` files. It includes the app's whole stylesheet (simplest way to guarantee identical rendering); a typical page is ~1.4 MB, mostly fonts.
- 2026-10-15 · M9 · The export save dialog is shown by Rust (`save_export`), so the page never chooses a write path outside the open folder.
- 2026-10-15 · M9 · `connect-src` now includes `'self'` and the asset protocol so the exporter can fetch bundled fonts and local images; `data:` stays excluded (existing data-URL fonts are reused without fetching).
- 2026-10-15 · M9 · Accessibility pass raised contrast requirements: `fg.subtle` (small UI text) and editor line numbers now need 4.5:1 on every surface they appear on, alert titles 5:1 on the callout surface (to survive its 8% tint), and muted/subtle text 4.5:1 on hover/selected rows. All 65 themes were regenerated and pass.
- 2026-10-15 · M9 · The axe check skips `scrollable-region-focusable` for CodeMirror's scroller (it contains the focusable contenteditable, which the rule doesn't detect) instead of adding a redundant tab stop.
- 2026-10-15 · post-run · The GitHub Actions workflow was removed at the user's request; builds and checks run locally (see README and PROGRESS.md).
