// Persisted app state (state.json): per-folder layout, per-file scroll memory (LRU),
// recent folders, recent commands, session. Several windows may write this file, so
// saves re-read the file and replay this window's pending changes on top of it.

import { create } from 'zustand';
import type { Platform } from '../platform';
import { errorMessage } from '../platform';
import { join } from '../platform/path';

export interface FolderState {
  lastFile: string | null;
  expanded: string[];
  treeWidth: number;
  treeCollapsed: boolean;
  splitRatio: number;
}

export interface FileState {
  line: number;
  t: number;
}

export interface SessionWindow {
  root: string | null;
  file: string | null;
}

export interface PersistedState {
  version: 1;
  folders: Record<string, FolderState>;
  files: Record<string, FileState>;
  recentFolders: string[];
  recentCommands: string[];
  session: SessionWindow[];
  /** Layout used when no folder is open. */
  noFolder: FolderState;
  notices: { dataDirFallback: boolean; welcomeOpened: boolean };
}

export const FILE_LRU_CAP = 500;
export const RECENT_FOLDERS_CAP = 12;
export const RECENT_COMMANDS_CAP = 30;

export const defaultFolderState: FolderState = {
  lastFile: null,
  expanded: [],
  treeWidth: 260,
  treeCollapsed: false,
  splitRatio: 0.5,
};

export const emptyState: PersistedState = {
  version: 1,
  folders: {},
  files: {},
  recentFolders: [],
  recentCommands: [],
  session: [],
  noFolder: defaultFolderState,
  notices: { dataDirFallback: false, welcomeOpened: false },
};

export function parseState(text: string): PersistedState {
  try {
    const raw = JSON.parse(text) as Partial<PersistedState>;
    if (!raw || typeof raw !== 'object') return emptyState;
    return {
      ...emptyState,
      ...raw,
      notices: { ...emptyState.notices, ...(raw.notices ?? {}) },
      noFolder: { ...defaultFolderState, ...(raw.noFolder ?? {}) },
      folders: raw.folders && typeof raw.folders === 'object' ? raw.folders : {},
      files: raw.files && typeof raw.files === 'object' ? raw.files : {},
      recentFolders: Array.isArray(raw.recentFolders) ? raw.recentFolders : [],
      recentCommands: Array.isArray(raw.recentCommands) ? raw.recentCommands : [],
      session: Array.isArray(raw.session) ? raw.session : [],
    };
  } catch {
    return emptyState;
  }
}

export type Patch = (s: PersistedState) => PersistedState;

// ---- Patch helpers (pure) ----

export function patchFolder(root: string | null, change: Partial<FolderState>): Patch {
  return (s) =>
    root === null
      ? { ...s, noFolder: { ...s.noFolder, ...change } }
      : {
          ...s,
          folders: {
            ...s.folders,
            [root]: { ...defaultFolderState, ...s.folders[root], ...change },
          },
        };
}

export function patchFile(path: string, line: number, now = Date.now()): Patch {
  return (s) => {
    const files = { ...s.files, [path]: { line, t: now } };
    const keys = Object.keys(files);
    if (keys.length > FILE_LRU_CAP) {
      keys
        .sort((a, b) => files[a].t - files[b].t)
        .slice(0, keys.length - FILE_LRU_CAP)
        .forEach((k) => delete files[k]);
    }
    return { ...s, files };
  };
}

export function pushRecent(
  list: string[],
  item: string,
  cap: number,
  eq = (a: string, b: string) => a === b,
): string[] {
  return [item, ...list.filter((x) => !eq(x, item))].slice(0, cap);
}

export function patchRecentFolder(root: string): Patch {
  return (s) => ({ ...s, recentFolders: pushRecent(s.recentFolders, root, RECENT_FOLDERS_CAP) });
}

export function patchRemoveRecentFolder(root: string): Patch {
  return (s) => ({ ...s, recentFolders: s.recentFolders.filter((r) => r !== root) });
}

export function patchRecentCommand(id: string): Patch {
  return (s) => ({ ...s, recentCommands: pushRecent(s.recentCommands, id, RECENT_COMMANDS_CAP) });
}

// ---- Store ----

interface AppStateStore {
  state: PersistedState;
  loaded: boolean;
  apply: (p: Patch) => void;
}

let pending: Patch[] = [];
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saver: (() => Promise<void>) | null = null;

export const useAppState = create<AppStateStore>((set) => ({
  state: emptyState,
  loaded: false,
  apply: (p) => {
    set((st) => ({ state: p(st.state) }));
    pending.push(p);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saver?.(), 400);
  },
}));

export function applyState(p: Patch): void {
  useAppState.getState().apply(p);
}

export function getAppState(): PersistedState {
  return useAppState.getState().state;
}

export async function bindAppState(
  platform: Platform,
  onError: (m: string) => void = console.error,
) {
  const { path: dataDir } = await platform.getDataDir();
  const file = join(dataDir, 'state.json');
  const read = async () => parseState(await platform.readTextFile(file).catch(() => '{}'));
  const initial = await read();
  pending = [];
  useAppState.setState({ state: initial, loaded: true });

  saver = async () => {
    if (!pending.length) return;
    const patches = pending;
    pending = [];
    try {
      const fresh = await read();
      const merged = patches.reduce((s, p) => p(s), fresh);
      await platform.writeFileAtomic(file, JSON.stringify(merged) + '\n');
    } catch (e) {
      onError(`Could not save app state: ${errorMessage(e)}`);
    }
  };
  return {
    flush: () => {
      clearTimeout(saveTimer);
      return saver?.() ?? Promise.resolve();
    },
  };
}

export function flushAppState(): Promise<void> {
  clearTimeout(saveTimer);
  return saver?.() ?? Promise.resolve();
}
