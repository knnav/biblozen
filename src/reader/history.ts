// Navigation history (SPEC §9): back/forward across files and anchor jumps.

import { create } from 'zustand';
import { samePath } from '../platform/path';

export interface HistoryEntry {
  path: string;
  /** Top visible source line when we left (or the jump target). */
  line: number | null;
}

export interface HistoryState {
  entries: HistoryEntry[];
  index: number;
}

export const HISTORY_CAP = 200;

export const emptyHistory: HistoryState = { entries: [], index: -1 };

/** Records the current position on the current entry (before navigating away). */
export function recordPosition(h: HistoryState, line: number | null): HistoryState {
  if (h.index < 0) return h;
  const entries = h.entries.slice();
  entries[h.index] = { ...entries[h.index], line };
  return { ...h, entries };
}

/** Pushes a new location, dropping any forward entries. Same-place pushes are ignored. */
export function push(h: HistoryState, e: HistoryEntry): HistoryState {
  const cur = h.entries[h.index];
  if (cur && samePath(cur.path, e.path) && cur.line === e.line) return h;
  const entries = [...h.entries.slice(0, h.index + 1), e].slice(-HISTORY_CAP);
  return { entries, index: entries.length - 1 };
}

export function canGo(h: HistoryState, dir: -1 | 1): boolean {
  const i = h.index + dir;
  return i >= 0 && i < h.entries.length;
}

export function go(
  h: HistoryState,
  dir: -1 | 1,
): { state: HistoryState; entry: HistoryEntry } | null {
  if (!canGo(h, dir)) return null;
  const index = h.index + dir;
  return { state: { ...h, index }, entry: h.entries[index] };
}

/** Rewrites paths after a rename/move. */
export function renamePath(h: HistoryState, from: string, to: string): HistoryState {
  return {
    ...h,
    entries: h.entries.map((e) => (samePath(e.path, from) ? { ...e, path: to } : e)),
  };
}

export const useHistory = create<HistoryState>(() => emptyHistory);
