// The open document's buffer state. Rendering, editing and saving build on this.

import { create } from 'zustand';

export type DocStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface DocumentState {
  path: string | null;
  status: DocStatus;
  error: string | null;
  /** Current buffer text (editor contents). */
  text: string;
  /** Text as last loaded from / saved to disk (normalized to \n). */
  savedText: string;
  cursor: { line: number; col: number } | null;
  saving: boolean;
  lastSavedAt: number | null;
  /** Set when the file changed on disk while the buffer had unsaved edits. `diskText` null = deleted. */
  conflict: { diskText: string | null } | null;
  /** Navigation target; `seq` bumps on every (re)navigation so views react once. */
  nav: { seq: number; line?: number; anchor?: string };
}

export const useDocument = create<DocumentState>(() => ({
  path: null,
  status: 'empty',
  error: null,
  text: '',
  savedText: '',
  cursor: null,
  saving: false,
  lastSavedAt: null,
  conflict: null,
  nav: { seq: 0 },
}));

/** savedText marker for a file that was deleted on disk while we kept our copy. */
export const DELETED_ON_DISK = '\u0000(deleted on disk)';

export function isDirty(s: Pick<DocumentState, 'text' | 'savedText' | 'path'>): boolean {
  return s.path !== null && s.text !== s.savedText;
}

export function useDirty(): boolean {
  return useDocument(isDirty);
}
