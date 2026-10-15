// Workspace-level actions: opening folders and files, watching the root.

import { getPlatform } from '../platform';
import { errorMessage, type WatchEvent } from '../platform/types';
import { basename, dirname, isInside, isMarkdown, samePath } from '../platform/path';
import { applyState, getAppState, patchFolder, patchRecentFolder } from '../settings/appState';
import { getSettings } from '../settings/store';
import { onIndexFsEvents, syncIndex } from '../index/client';
import { useIndex } from '../index/store';
import { pushLocation, rememberHere } from '../reader/position';
import { allFiles, findNode, sortNodes } from '../tree/model';
import { resetTree, useTree } from '../tree/store';
import { useDocument } from './document';
import { detectFormat, toBuffer, type TextFormat } from './textfile';
import { toast, toastError } from './toasts';
import { useWorkspace } from './workspace';

let unwatchRoot: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
/** Format of the open file, used when saving. */
let openFormat: TextFormat = { eol: '\n', trailingNewline: true, bom: false };

export function currentFormat(): TextFormat {
  return openFormat;
}

/** Hooks other modules use to react to file events (index, conflict banner, …). */
type FsListener = (events: WatchEvent[]) => void;
const fsListeners = new Set<FsListener>();
export function onFsEvents(l: FsListener): () => void {
  fsListeners.add(l);
  return () => fsListeners.delete(l);
}

/** Paths we just wrote, so their watcher echoes can be ignored. */
const ownWrites = new Map<string, { text: string; at: number }>();
export function noteOwnWrite(path: string, text: string): void {
  ownWrites.set(path, { text, at: Date.now() });
}
export function isOwnWrite(path: string, diskText: string): boolean {
  const w = ownWrites.get(path);
  return !!w && w.text === diskText && Date.now() - w.at < 10_000;
}

export async function refreshTree(): Promise<void> {
  const root = useWorkspace.getState().root;
  if (!root) return;
  const platform = getPlatform();
  useTree.setState({ loading: useTree.getState().listing === null });
  try {
    const l = await platform.listTree(root, getSettings().files.ignored);
    if (useWorkspace.getState().root !== root) return;
    const listing = { ...l.root, children: sortNodes(l.root.children ?? []) };
    useTree.setState({ listing, truncated: l.truncated, loading: false, error: null });
    const files = allFiles(listing);
    useIndex.getState().setFiles(root, files);
    void syncIndex(root, files);
  } catch (e) {
    useTree.setState({ loading: false, error: errorMessage(e) });
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshTree(), 120);
}

async function onRootEvents(events: WatchEvent[]) {
  const structural = events.some((e) => e.kind !== 'modify');
  if (structural) scheduleRefresh();
  onIndexFsEvents(events);
  for (const l of fsListeners) l(events);

  const doc = useDocument.getState();
  if (!doc.path) return;
  const touched = events.some((e) => e.paths.some((p) => samePath(p, doc.path!)));
  if (!touched) return;
  const platform = getPlatform();
  let disk: string;
  try {
    disk = await platform.readTextFile(doc.path);
  } catch {
    // Gone (deleted or renamed away). Keep unsaved text; otherwise close.
    if (!(await platform.exists(doc.path))) handleOpenFileRemoved(doc.path);
    return;
  }
  if (isOwnWrite(doc.path, disk)) return;
  const text = toBuffer(disk);
  if (text === doc.savedText) return;
  if (doc.text === doc.savedText) {
    openFormat = detectFormat(disk);
    useDocument.setState({ text, savedText: text, conflict: null });
  } else {
    useDocument.setState({ conflict: { diskText: text } });
  }
}

function handleOpenFileRemoved(path: string) {
  const doc = useDocument.getState();
  if (doc.path !== path) return;
  if (doc.text !== doc.savedText) {
    useDocument.setState({ conflict: { diskText: null } });
    return;
  }
  closeDocument();
  toast(`“${basename(path)}” was moved or deleted`, 'info');
}

export function closeDocument(): void {
  useDocument.setState({
    path: null,
    status: 'empty',
    error: null,
    text: '',
    savedText: '',
    cursor: null,
    conflict: null,
  });
  useWorkspace.setState({ file: null });
}

export async function openFolder(
  path: string,
  opts: { file?: string | null; restoreLastFile?: boolean } = {},
) {
  const platform = getPlatform();
  let root: string;
  try {
    root = await platform.setWindowRoot(path);
  } catch (e) {
    toastError(e, 'Could not open folder');
    return;
  }
  unwatchRoot?.();
  unwatchRoot = null;
  closeDocument();
  resetTree();
  const folder = getAppState().folders[root];
  useTree.setState({ expanded: new Set(folder?.expanded ?? []) });
  useWorkspace.setState({ root, file: null });
  useWorkspace.getState().restoreLayout();
  applyState(patchRecentFolder(root));
  await refreshTree();
  try {
    unwatchRoot = await platform.watch(root, (ev) => void onRootEvents(ev), {
      recursive: true,
      delayMs: 100,
    });
  } catch (e) {
    toast(`Live updates unavailable: ${errorMessage(e)}`, 'warning');
  }
  const target = opts.file ?? (opts.restoreLastFile !== false ? folder?.lastFile : null);
  if (target && isInside(root, target)) {
    await openFile(target, { reveal: true, quietIfMissing: !opts.file });
  }
}

export async function closeFolder(): Promise<void> {
  for (const g of beforeSwitch) if (!(await g())) return;
  unwatchRoot?.();
  unwatchRoot = null;
  closeDocument();
  resetTree();
  useIndex.getState().setFiles(null, []);
  void syncIndex(null, []);
  useWorkspace.setState({ root: null, file: null });
  useWorkspace.getState().restoreLayout();
}

export interface OpenFileOptions {
  mode?: 'read' | 'edit';
  line?: number;
  anchor?: string;
  reveal?: boolean;
  /** Don't toast if the file no longer exists (e.g. restoring last session). */
  quietIfMissing?: boolean;
  /** 'push' (default) records a history entry; 'none' is used by back/forward. */
  history?: 'push' | 'none';
}

/** Hooks run before switching documents (e.g. unsaved-changes prompt). Return false to cancel. */
type Guard = () => Promise<boolean>;
const beforeSwitch: Guard[] = [];
export function addBeforeSwitchGuard(g: Guard): () => void {
  beforeSwitch.push(g);
  return () => beforeSwitch.splice(beforeSwitch.indexOf(g), 1);
}

export async function openFile(path: string, opts: OpenFileOptions = {}): Promise<boolean> {
  const ws = useWorkspace.getState();
  const doc = useDocument.getState();
  const recordHistory = opts.history !== 'none';
  if (doc.path && samePath(doc.path, path)) {
    if (opts.mode === 'edit') ws.dispatchMode({ type: 'enterEdit' });
    useDocument.setState({ nav: { seq: doc.nav.seq + 1, line: opts.line, anchor: opts.anchor } });
    return true;
  }
  for (const g of beforeSwitch) if (!(await g())) return false;
  if (recordHistory) rememberHere();

  const platform = getPlatform();
  useDocument.setState({ path, status: 'loading', error: null, conflict: null });
  useWorkspace.setState({ file: path });
  // Spec: opening anything lands in read mode, unless explicitly asked otherwise.
  ws.dispatchMode({ type: opts.mode === 'edit' ? 'enterEdit' : 'enterRead' });
  try {
    const raw = await platform.readTextFile(path);
    if (useDocument.getState().path !== path) return false;
    openFormat = detectFormat(raw);
    const text = toBuffer(raw);
    useDocument.setState((s) => ({
      status: 'ready',
      text,
      savedText: text,
      cursor: null,
      error: null,
      nav: { seq: s.nav.seq + 1, line: opts.line, anchor: opts.anchor },
    }));
    const root = useWorkspace.getState().root;
    if (root) applyState(patchFolder(root, { lastFile: path }));
    if (recordHistory) pushLocation(path, opts.line ?? null);
    if (opts.reveal !== false) revealInTree(path, false);
    return true;
  } catch (e) {
    if (opts.quietIfMissing && !(await platform.exists(path).catch(() => false))) {
      closeDocument();
      return false;
    }
    useDocument.setState({ status: 'error', error: errorMessage(e) });
    return false;
  }
}

/** Expands ancestors, selects and scrolls to the path in the tree. */
export function revealInTree(path: string, focus = true): void {
  const root = useWorkspace.getState().root;
  if (!root || !isInside(root, path)) return;
  const tree = useTree.getState();
  const expanded = new Set(tree.expanded);
  let dir = dirname(path);
  while (isInside(root, dir)) {
    expanded.add(dir);
    dir = dirname(dir);
  }
  useTree.setState({ expanded, selected: path, filter: '' });
  persistExpanded();
  if (useWorkspace.getState().treeCollapsed && focus)
    useWorkspace.getState().setTreeCollapsed(false);
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(path)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    if (focus) document.querySelector<HTMLElement>('.tree')?.focus();
  });
}

export function persistExpanded(): void {
  const root = useWorkspace.getState().root;
  if (!root) return;
  applyState(patchFolder(root, { expanded: [...useTree.getState().expanded] }));
}

/**
 * Opens a path from a dialog, drop, recent list or link outside the folder. The shell
 * routes it (SPEC §4.4): another window may take it, a new window may open, or —
 * for a window without a folder — it opens here.
 */
export async function openPath(path: string): Promise<void> {
  const platform = getPlatform();
  try {
    const r = await platform.openPath(path);
    if (r.kind === 'this-window' && r.root) {
      if (useWorkspace.getState().root && samePath(useWorkspace.getState().root!, r.root)) {
        if (r.file) await openFile(r.file);
      } else {
        await openFolder(r.root, { file: r.file });
      }
    }
  } catch (e) {
    toastError(e, `Couldn’t open “${basename(path)}”`);
  }
}

export function selectedOrActiveDir(): string | null {
  const root = useWorkspace.getState().root;
  if (!root) return null;
  const { selected, listing } = useTree.getState();
  const ref = selected ?? useWorkspace.getState().file;
  if (!ref) return root;
  const node = listing ? findNode(listing, ref) : null;
  return node?.kind === 'dir' ? ref : dirname(ref);
}

export function isMarkdownPath(p: string): boolean {
  return isMarkdown(p);
}

/** Moves keyboard focus to the reading/editing surface. */
export function focusContent(): void {
  requestAnimationFrame(() => {
    const target =
      document.querySelector<HTMLElement>('[data-pane="editor"] .cm-content') ??
      document.querySelector<HTMLElement>('[data-pane="editor"] textarea') ??
      document.querySelector<HTMLElement>('[data-pane="preview"] [data-scroll]') ??
      document.querySelector<HTMLElement>('[data-pane="preview"]');
    target?.focus({ preventScroll: true });
  });
}
