# Biblozen

A portable, reader-first Markdown app for macOS and Windows. Open a folder of notes or docs and it lands in **read mode**, set in comfortable type; editing is one keystroke away.

- **Reading:** GitHub-flavoured Markdown, alerts, footnotes, math (KaTeX), diagrams (Mermaid), syntax highlighting (Shiki), front matter, wikilinks, local images.
- **Keyboard first:** `j`/`k`, `d`/`u`, `Space`, `g g`/`G`, outline (`o`), find (`/`), history (`[` `]`), and every action in the command palette (`Ctrl/Cmd+Shift+P`).
- **Themes:** 65 built-in color themes (VS Code catalog, 10 hand-tuned), following the OS light/dark setting. Drop any VS Code theme into the `themes` folder. Five reading styles: GitHub, Book, Academic, Compact and Mono.
- **Editing:** CodeMirror 6 with split preview, scroll sync, list helpers, find/replace, optional Vim mode, paste-to-save images, and wikilink autocompletion.
- **Folders:** live file tree, quick open (`Ctrl/Cmd+P`), full-text search (`Ctrl/Cmd+Shift+S`), backlinks, and one window per folder.
- **Portable:** no installer, no registry, no file associations, no telemetry. Everything Biblozen remembers lives in one data folder.

## Download and first launch

There are no prebuilt downloads; build it yourself (see [Building from source](#building-from-source)):

- macOS: `npm run tauri build -- --target universal-apple-darwin --bundles app` produces a universal `Biblozen.app` (Apple silicon and Intel) under `src-tauri/target/universal-apple-darwin/release/bundle/macos/`.
- Windows: `npm run tauri build -- --no-bundle` produces a portable `src-tauri/target/release/biblozen.exe` (rename it `Biblozen.exe` if you like).

These builds are **not code-signed**, so each OS asks you to confirm the first time.

### macOS (Gatekeeper)

1. Unzip and move `Biblozen.app` wherever you like (e.g. `/Applications`).
2. **Right-click** (or Control-click) the app → **Open** → **Open** in the dialog. You only need to do this once.

If macOS says the app "is damaged and can't be opened" (the quarantine flag on downloaded unsigned apps), clear it in Terminal and open it again:

```sh
xattr -dr com.apple.quarantine /Applications/Biblozen.app
```

On recent macOS versions you may instead need **System Settings → Privacy & Security → Open Anyway** after the first attempt.

### Windows (SmartScreen)

1. Put `Biblozen.exe` in a folder you can write to, e.g. `Documents\Biblozen\`.
2. Run it. If SmartScreen shows "Windows protected your PC", click **More info → Run anyway**.

Biblozen uses the Microsoft Edge WebView2 runtime, which ships with Windows 10 (21H2+) and Windows 11. On older systems, install the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

## Where your data lives

Biblozen never writes hidden files into your folders. Its own state is in one place:

| OS      | Data folder                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Windows | `data\` next to `Biblozen.exe` (portable). If that folder isn't writable, `%APPDATA%\Biblozen\` and a one-time notice. |
| macOS   | `~/Library/Application Support/Biblozen/`                                                                              |

Inside: `settings.json` (also editable by hand; changes apply instantly), `state.json` (layout, recent folders, scroll positions), `session.json` (open windows), `themes/` (your themes) and `Welcome/` (the tour). **Settings → Advanced** opens it.

## Opening things

- **Open Folder** `Ctrl/Cmd+Alt+O`, **Open File** `Ctrl/Cmd+O`, or drop a folder or file on the window.
- From a terminal: `Biblozen.exe C:\notes` / `open -a Biblozen ~/notes`. If Biblozen is already running, the path is handed to it: a folder that's already open is focused; a file opens in the window whose folder contains it (the most specific one wins); anything else gets a new window.
- With no arguments, Biblozen restores the windows from last time.

## Keyboard shortcuts

`Mod` is `Cmd` on macOS and `Ctrl` on Windows. Every command is also in the palette, which shows its shortcut.

| Action                        | Shortcut                                        |
| ----------------------------- | ----------------------------------------------- |
| Command palette               | `Mod+Shift+P`                                   |
| Quick open (`#` for headings) | `Mod+P`                                         |
| Search in folder              | `Mod+Shift+S`                                   |
| Toggle read / edit            | `Mod+E` (or `e` while reading)                  |
| Split / editor only           | `Mod+\`                                         |
| Toggle sidebar                | `Mod+B` (read) / `Mod+Shift+B`                  |
| Reveal file in sidebar        | `Mod+Shift+E`                                   |
| Outline / Backlinks           | `Mod+Shift+O` / `Mod+Shift+L` (or `o` / `b`)    |
| Focus mode                    | `Mod+Shift+F` (`Esc` exits)                     |
| Find in document              | `Mod+F` (or `/`), then `n` / `N`                |
| Save                          | `Mod+S`                                         |
| New file / New window         | `Mod+N` / `Mod+Shift+N`                         |
| Back / forward                | `Mod+[` / `Mod+]` (or `[` / `]`, mouse buttons) |
| Zoom in / out / reset         | `Mod+=` / `Mod+-` / `Mod+0`                     |
| Theme picker                  | `Mod+K Mod+T` (or `t`)                          |
| Settings                      | `Mod+,`                                         |

Reading keys: `j`/`k` line, `d`/`u` half page, `Space`/`Shift+Space` page, `g g`/`G` top/bottom.

## Themes

Press `t` to browse themes; arrow keys preview each one across the whole window, `Enter` keeps it, `Esc` restores the previous one. To add your own, copy a VS Code theme `.json` (or a Biblozen theme with a `tokens` object — see `SPEC.md` §11.2) into `<data folder>/themes/`. It appears immediately.

## Export

- **Export as HTML…** writes one self-contained file: theme, reading style, fonts, math and diagrams embedded (images too, unless turned off in Settings). It looks the same offline.
- **Print / Export as PDF…** opens the system print dialog with a print layout (optionally forcing a light theme and starting each top-level heading on a new page).
- **Copy as HTML** puts the rendered document on the clipboard.

## Building from source

Requirements: Node 22+, Rust (stable), and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
npm ci
npm run tauri dev          # run the app with hot reload
npm run tauri build        # release build (macOS: .app; Windows/Linux: binary)
npm run dev                # the UI alone in a browser, on an in-memory demo filesystem
```

Checks:

```sh
npm run lint && npm run typecheck && npm test   # ESLint, TypeScript, Vitest
npm run e2e                                     # Playwright (browser mode + production build)
npm run check:contrast                          # every built-in theme meets the legibility rules
(cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
scripts/smoke.sh                                # self-test of the real app (IPC, scopes, rendering, windows)
scripts/multiwindow.sh                          # CLI args, single instance, routing, session restore
```

`npm run themes:build` regenerates the theme catalog from Shiki's themes; hand-tuning lives in `src/themes/overrides.json`.

Third-party licenses: [`docs/THIRD_PARTY.md`](docs/THIRD_PARTY.md).
