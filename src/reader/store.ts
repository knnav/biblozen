import { create } from 'zustand';
import type { HeadingInfo } from '../render/plugins/headingAnchors';

export interface ReaderState {
  /** Headings of the rendered document (outline). */
  headings: HeadingInfo[];
  /** Slug of the heading the reader is currently in (scroll-spy). */
  activeSlug: string | null;
  /** 0…1 scroll progress of the preview. */
  progress: number;
  find: { open: boolean; query: string; index: number; count: number; focusSeq: number };
}

export const useReader = create<ReaderState>(() => ({
  headings: [],
  activeSlug: null,
  progress: 0,
  find: { open: false, query: '', index: 0, count: 0, focusSeq: 0 },
}));

export function setFind(patch: Partial<ReaderState['find']>): void {
  useReader.setState((s) => ({ find: { ...s.find, ...patch } }));
}

export function openFind(): void {
  const sel = window.getSelection()?.toString().trim();
  useReader.setState((s) => ({
    find: {
      ...s.find,
      open: true,
      query: sel && sel.length < 80 && !sel.includes('\n') ? sel : s.find.query,
      focusSeq: s.find.focusSeq + 1,
    },
  }));
}

export function closeFind(): void {
  setFind({ open: false, query: '', count: 0, index: 0 });
}

export function stepFind(dir: 1 | -1): void {
  useReader.setState((s) => {
    if (!s.find.count) return s;
    const index = (s.find.index + dir + s.find.count) % s.find.count;
    return { find: { ...s.find, index } };
  });
}
