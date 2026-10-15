// Per-window workspace state: which folder/file is open, mode, layout sizes, overlays.

import { create } from 'zustand';
import {
  applyState,
  defaultFolderState,
  getAppState,
  patchFolder,
  type FolderState,
} from '../settings/appState';
import { initialMode, modeReducer, type ModeAction, type ModeState } from './modes';

export type OverlayKind =
  'palette' | 'quickOpen' | 'theme' | 'readingStyle' | 'search' | 'settings' | 'recentFolders';

export interface WorkspaceState extends ModeState {
  root: string | null;
  file: string | null;
  treeWidth: number;
  treeCollapsed: boolean;
  splitRatio: number;
  overlay: OverlayKind | null;
  /** Free-form argument for the open overlay (e.g. palette prefix). */
  overlayArg: string;
  panels: { outline: boolean; backlinks: boolean };
  /** Status-bar hover hint (e.g. link target). */
  hoverHint: string | null;

  dispatchMode: (a: ModeAction) => void;
  setTreeWidth: (w: number, persist?: boolean) => void;
  setTreeCollapsed: (c: boolean) => void;
  setSplitRatio: (r: number, persist?: boolean) => void;
  openOverlay: (o: OverlayKind, arg?: string) => void;
  closeOverlay: () => void;
  togglePanel: (p: 'outline' | 'backlinks') => void;
  setHoverHint: (h: string | null) => void;
  /** Loads persisted layout for the current root. */
  restoreLayout: () => void;
}

export const TREE_MIN = 180;
export const TREE_MAX = 520;
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function folderState(root: string | null): FolderState {
  const s = getAppState();
  return root === null ? s.noFolder : { ...defaultFolderState, ...s.folders[root] };
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ...initialMode,
  root: null,
  file: null,
  treeWidth: defaultFolderState.treeWidth,
  treeCollapsed: false,
  splitRatio: 0.5,
  overlay: null,
  overlayArg: '',
  panels: { outline: false, backlinks: false },
  hoverHint: null,

  dispatchMode: (a) =>
    set((s) => {
      const next = modeReducer(s, a);
      return next === s ? s : next;
    }),
  setTreeWidth: (w, persist = true) => {
    const width = Math.round(clamp(w, TREE_MIN, TREE_MAX));
    set({ treeWidth: width });
    if (persist) applyState(patchFolder(get().root, { treeWidth: width }));
  },
  setTreeCollapsed: (c) => {
    set({ treeCollapsed: c });
    applyState(patchFolder(get().root, { treeCollapsed: c }));
  },
  setSplitRatio: (r, persist = true) => {
    const ratio = clamp(r, SPLIT_MIN, SPLIT_MAX);
    set({ splitRatio: ratio });
    if (persist) applyState(patchFolder(get().root, { splitRatio: ratio }));
  },
  openOverlay: (o, arg = '') => set({ overlay: o, overlayArg: arg }),
  closeOverlay: () => set({ overlay: null, overlayArg: '' }),
  togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
  setHoverHint: (h) => set({ hoverHint: h }),
  restoreLayout: () => {
    const f = folderState(get().root);
    set({ treeWidth: f.treeWidth, treeCollapsed: f.treeCollapsed, splitRatio: f.splitRatio });
  },
}));
