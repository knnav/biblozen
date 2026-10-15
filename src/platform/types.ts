export type OS = 'macos' | 'windows' | 'linux';

export interface DataDirInfo {
  path: string;
  /** Data lives next to the executable (Windows portable mode). */
  portable: boolean;
  /** Portable mode was wanted but the exe dir wasn't writable. */
  fellBack: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: TreeNode[];
}

export interface TreeListing {
  root: TreeNode;
  truncated: boolean;
  count: number;
}

export interface SearchOpts {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  markdownOnly: boolean;
  maxResults?: number;
}

export interface LineMatch {
  line: number;
  text: string;
  /** UTF-16 offsets within `text`. */
  ranges: [number, number][];
}

export interface FileMatches {
  path: string;
  matches: LineMatch[];
}

export interface SearchSummary {
  files: number;
  matches: number;
  truncated: boolean;
  cancelled: boolean;
}

export interface WindowInit {
  root: string | null;
  file: string | null;
}

export interface RouteResult {
  /** 'focused': another (or this) window took it; 'this-window': open it here; 'new-window'. */
  kind: 'focused' | 'this-window' | 'new-window';
  label: string | null;
  root: string | null;
  file: string | null;
}

export type DragDropEvent =
  | { type: 'enter' | 'over'; paths: string[]; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' };

export type WatchEventKind = 'create' | 'modify' | 'remove' | 'rename' | 'other';

export interface WatchEvent {
  kind: WatchEventKind;
  paths: string[];
}

export type Unwatch = () => void;

/** Error shape returned by every Rust command (see src-tauri/src/error.rs). */
export interface AppError {
  kind: string;
  message: string;
}

export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'kind' in e && 'message' in e;
}

export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Everything the frontend needs from the host. Implemented by Tauri in the app and
 * by an in-memory fake in tests and plain-browser mode.
 */
export interface Platform {
  readonly kind: 'tauri' | 'browser';
  readonly os: OS;

  getDataDir(): Promise<DataDirInfo>;

  readTextFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  /** URL the webview can load a local file from (asset protocol / blob in the fake). */
  assetUrl(path: string): string;
  writeFileAtomic(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  watch(
    path: string,
    onEvents: (events: WatchEvent[]) => void,
    opts: { recursive: boolean; delayMs: number },
  ): Promise<Unwatch>;

  openExternal(url: string): Promise<void>;

  /** Folder/file this window should open on startup (CLI, routing, session restore). */
  windowInit(): Promise<WindowInit>;
  /** Routes a path to the right window (SPEC §4.4). */
  openPath(path: string): Promise<RouteResult>;
  newWindow(): Promise<void>;
  /** Tells the shell what this window shows, for session restore. */
  reportSession(root: string | null, file: string | null): Promise<void>;
  /** Another window/launch asked this window to open a file. */
  onOpenFile(cb: (path: string) => void): Promise<Unwatch>;
  /** Binds a folder to this window (grants access). Returns the canonical path. */
  setWindowRoot(root: string): Promise<string>;
  listTree(root: string, ignored: string[]): Promise<TreeListing>;
  /** Creates a new file; fails with `alreadyExists` if present. */
  createFile(path: string, contents: string): Promise<void>;
  createDir(path: string): Promise<void>;
  /** Never overwrites an existing target. */
  rename(from: string, to: string): Promise<void>;
  duplicate(path: string): Promise<string>;
  /** Moves to the OS trash — never a hard delete. */
  trash(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
  isDir(path: string): Promise<boolean>;
  /** Direct children of a directory. */
  listDir(path: string): Promise<{ name: string; isDir: boolean }[]>;

  /** Searches the folder; `onFile` streams results. A newer search cancels older ones. */
  search(
    root: string,
    query: string,
    opts: SearchOpts,
    ignored: string[],
    onFile: (f: FileMatches) => void,
  ): Promise<SearchSummary>;
  /** Saves image bytes to `<doc dir>/<folder>/<doc-stem>-<timestamp>.<ext>`; returns the path relative to the doc dir. */
  savePastedImage(
    docPath: string,
    bytes: Uint8Array,
    ext: string,
    folder: string,
    timestamp: string,
  ): Promise<string>;
  /** Copies an image file (e.g. dropped from the OS) the same way. */
  importImage(docPath: string, srcPath: string, folder: string, timestamp: string): Promise<string>;

  pickFolder(): Promise<string | null>;
  pickFile(): Promise<string | null>;
  copyText(text: string): Promise<void>;
  /** Rich clipboard: HTML with a plain-text fallback. */
  copyHtml(html: string, plain: string): Promise<void>;
  /** System print dialog for this window. */
  printPage(): Promise<void>;
  /** Save dialog + write; resolves to the chosen path, or null if cancelled. */
  saveExport(
    defaultName: string,
    contents: string,
    filterName: string,
    extension: string,
  ): Promise<string | null>;
  onDragDrop(cb: (e: DragDropEvent) => void): Promise<Unwatch>;

  window: WindowControls;
}

export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
  setTitle(title: string): Promise<void>;
  /** `handler` resolves true to let the window close. */
  onCloseRequested(handler: () => Promise<boolean>): Promise<Unwatch>;
}
