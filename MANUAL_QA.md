# Manual QA

Steps a human should run on real hardware, grouped by milestone. The run summary in PROGRESS.md re-orders them by risk.

## M0 — Scaffold

- [ ] **macOS launch (unsigned).** Build the universal `.app` on a Mac (see README), copy it to another Mac or download it so it gets quarantined, then right-click → Open (Gatekeeper). Expect a window with overlay traffic lights. Confirm `~/Library/Application Support/Biblozen/settings.json` exists, along with `themes/` and `logs/`.
- [ ] **Windows portable launch.** Put `Biblozen.exe` in a writable folder (e.g. `Desktop\Biblozen\`) and run it (SmartScreen → More info → Run anyway). Confirm `data\settings.json` appears next to the exe.
- [ ] **Windows fallback.** Copy `Biblozen.exe` into `C:\Program Files\Biblozen\` (not writable without elevation) and run it as a normal user. Confirm settings land in `%APPDATA%\Biblozen\` and a one-time notice is shown (from M1 onwards).
- [ ] **Settings hot reload (M0).** With the app open, edit `settings.json` by hand (e.g. change `readingStyle`), save, and confirm the app picks up the change without a restart (visible from M4 onwards).

## M1 — Shell & layout

- [ ] **macOS title bar.** Traffic lights sit vertically centred in the 38px title bar, don't overlap the sidebar toggle, and the bar drags the window. Double-clicking the bar zooms the window.
- [ ] **Windows title bar.** Minimize / maximize / close work; close turns red on hover; dragging the bar moves the window; double-click maximizes; Aero Snap (drag to screen edge) works.
- [ ] **Sidebar animation.** `Ctrl/Cmd+B` collapses and expands the sidebar smoothly; dragging the divider far left collapses it.
- [ ] **Focus mode.** `Ctrl/Cmd+Shift+F` hides chrome; on macOS the window can still be dragged from the top edge; `Esc` restores.

## M2 — Folder tree & file ops

- [ ] **Open folder dialog** (`Ctrl/Cmd+Alt+O`) shows the native picker; the chosen folder appears in the tree and in Recent.
- [ ] **Live updates.** Create, rename and delete files in Finder/Explorer while the folder is open; the tree updates within about a second.
- [ ] **Trash.** Right-click a file → Move to Trash → confirm. The file is in the macOS Trash / Windows Recycle Bin and can be restored.
- [ ] **Reveal.** Context menu → Reveal in Finder/Explorer selects the file in the OS file manager.
- [ ] **Copy path.** Context menu → Copy Path / Copy Relative Path, then paste into another app.
- [ ] **Drag from the OS.** Drag a folder from Finder/Explorer onto the window; it opens. Drag a `.md` file; it opens in its folder.
- [ ] **Case-only rename** on macOS/Windows (`note.md` → `Note.md`) works and the tree shows the new casing.

## M3 — Rendering

- [ ] **First run.** With an empty data folder, the app opens the Welcome folder at `Welcome.md`.
- [ ] **Rendering tour** (`Rendering.md`): compare against `docs/screenshots/m3/` — alerts, tables, Shiki code, KaTeX math, both Mermaid diagrams, footnotes, the local SVG and the `![[sketch.svg]]` embed all display on macOS and Windows.
- [ ] **External link** in Welcome opens the system browser; the app window doesn't navigate.
- [ ] **Task checkbox** in `Rendering.md` toggles and the file on disk changes (check in another editor).
- [ ] **Large file.** Open a 1 MB+ Markdown file; it appears in well under a second and scrolls smoothly.
- [ ] **Remote images** load (e.g. a `https://` image) when the setting allows it.

## M4 — Themes

- [ ] **Follow OS.** Switch macOS/Windows between light and dark; Biblozen follows within a second (GitHub Light ↔ Catppuccin Mocha by default).
- [ ] **Picker.** Press `t` in a document: arrow keys preview each theme across the whole window (title bar, sidebar, code, diagrams); `Esc` restores the original; `Enter` keeps the new one after a restart.
- [ ] **VS Code theme drop-in.** Copy any VS Code theme `.json` (e.g. from an extension's `themes/` folder) into `<data>/themes/`; it appears in the picker immediately.
- [ ] **Theme legibility review.** Look through `docs/screenshots/m4/theme-*.png` and, in the app, a handful of non-hand-tuned themes (e.g. Houston, Laserwave, Synthwave '84, Red) for anything that's hard to read.
- [ ] **Reading styles.** Each style in `docs/screenshots/m4/style-*.png` looks right on real hardware: fonts load (no fallback serif/sans), Book's indented paragraphs, Academic's numbered headings, Mono's markers.

## M5 — Reader UX

- [ ] **Keyboard reading** on a long real document: `j k d u Space Shift+Space g g G` feel smooth (no stutter on key repeat); reduced-motion setting in the OS disables smooth scrolling.
- [ ] **Mouse back/forward buttons** (side buttons) go back/forward in history on both OSes.
- [ ] **Trackpad** two-finger swipe doesn't navigate the webview away (it shouldn't do anything).
- [ ] **Scroll memory** after quitting and relaunching the real app.

## M6 — Editor

- [ ] **Close with unsaved changes** via the title-bar close button, `Cmd+Q` / `Alt+F4`, and (macOS) the red traffic light: the Save / Don't Save / Cancel prompt appears each time; Cancel keeps the window; Save writes the file.
- [ ] **CRLF round-trip on Windows**: open a CRLF file created in Notepad, edit, save; `git diff` shows only your change (no line-ending churn).
- [ ] **IME / dead keys**: type accented characters (e.g. `´` + `e`) and CJK input in the editor; nothing is lost or doubled; shortcuts don't fire mid-composition.
- [ ] **Paste a screenshot** (Cmd+Shift+4 to clipboard on macOS / Win+Shift+S on Windows) into the editor → `assets/<doc>-<timestamp>.png` appears and renders in the preview.
- [ ] **Drag an image from Finder/Explorer onto the editor** → copied into `assets/` and linked at the drop point. Dropping a folder elsewhere still opens it.
- [ ] **External editor conflict**: with unsaved edits, change the file in another editor; the banner appears; try Reload, Keep Mine and Show Diff.
- [ ] **Vim mode**: toggle from the palette; `i`, `Esc`, `dd`, `:w` work.
- [ ] **Spellcheck**: native webview spellcheck underlines misspellings in the editor (both OSes).

## M7 — Index & search

- [ ] **Large real folder** (e.g. a docs repo with thousands of files): open it; the UI stays responsive while the backlinks panel shows "Indexing… n / N"; quick open works immediately.
- [ ] **Search** (`Ctrl/Cmd+Shift+S`) in a large folder returns results progressively; changing the query mid-search doesn't show stale results.
- [ ] **Backlinks** update after editing another note in an external editor to add `[[ThisNote]]`.
- [ ] **`[[` autocomplete** in the editor feels instant in a large folder.

## M8 — Windows

- [ ] **macOS: open from Terminal** `open -a Biblozen ~/notes` then `open -a Biblozen ~/notes/todo.md`: the second focuses the existing window and opens the file. (File associations are out of scope, so Finder double-click isn't expected to work.)
- [ ] **Windows: open from the command line** `Biblozen.exe C:\notes`, then `Biblozen.exe c:\NOTES\todo.md` (different case) → same window. Also covered by `scripts/multiwindow-windows.sh`.
- [ ] **Two windows, one setting**: open two folders in two windows; change the theme (`t`) in one → both switch; change the reading style → both switch.
- [ ] **Quit with unsaved changes in two windows** (Cmd+Q / closing the last window): each window asks in turn; Cancel stops the quit.
- [ ] **Session restore**: open two folders, quit, relaunch with no arguments → both windows return with their files.
- [ ] **Window size/position** is remembered per window across launches.

## M9 — Export, settings, accessibility

- [ ] **Print / PDF** (palette → "Print / Export as PDF…") on macOS and Windows: the system print dialog opens; the preview shows only the document (no sidebar/title bar); "Save as PDF" produces a readable PDF; with a dark theme active and "Print with a light theme" on, the PDF is light; long code blocks and diagrams don't split mid-element.
- [ ] **Export as HTML**: save `Rendering.md`, turn off Wi-Fi, open the file in Safari/Edge/Firefox — fonts, math, diagrams, code colors and the local image all appear exactly as in the app.
- [ ] **Copy as HTML**: paste into Mail/Outlook/Google Docs — headings, lists, tables and code keep their structure.
- [ ] **Screen reader pass** (VoiceOver on macOS, Narrator or NVDA on Windows): the file tree announces items with level and expanded state; the command palette announces the active option as you arrow; settings controls announce their labels and on/off state; dialogs announce their title.
- [ ] **Keyboard-only pass** across sidebar → document → outline → palette → settings → back, with visible focus rings throughout.
- [ ] **Reduced motion** (macOS: Accessibility → Display → Reduce motion; Windows: Settings → Accessibility → Visual effects → Animation effects off): panels, dialogs and the sidebar appear without animation; smooth scrolling is off.
- [ ] **README instructions**: follow the Gatekeeper and SmartScreen steps on a clean machine.
