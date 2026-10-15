// File index state on the main thread: the file list wikilinks resolve against, plus
// the background build status of the content index (headings, links, backlinks).

import { create } from 'zustand';
import { createResolver, makeFileRef, type FileRef } from './resolve';

export interface IndexState {
  root: string | null;
  refs: FileRef[];
  /** Background build state for panels that need parsed content (backlinks). */
  status: 'idle' | 'building' | 'ready';
  progress: { done: number; total: number };
  /** Bumps whenever indexed content changes. */
  version: number;
  setFiles: (root: string | null, paths: string[]) => void;
}

let resolver: (target: string) => string | null = () => null;

export const useIndex = create<IndexState>((set) => ({
  root: null,
  refs: [],
  status: 'idle',
  progress: { done: 0, total: 0 },
  version: 0,
  setFiles: (root, paths) => {
    const refs = root ? paths.map((p) => makeFileRef(root, p)) : [];
    resolver = createResolver(refs);
    set({ root, refs });
  },
}));

export function resolveWikilinkRef(
  ref: string,
  currentDoc: string | null,
): { path: string | null; heading: string | null } {
  const hash = ref.indexOf('#');
  const target = hash === -1 ? ref : ref.slice(0, hash);
  const heading = hash === -1 ? null : ref.slice(hash + 1) || null;
  if (!target.trim()) return { path: currentDoc, heading };
  return { path: resolver(target), heading };
}
