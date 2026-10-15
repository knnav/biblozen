// Mode state machine (SPEC §3.2). Pure so it can be unit tested.

export type ViewMode = 'read' | 'edit';
export type EditLayout = 'split' | 'editor';
export type PaneLayout = 'read' | 'split' | 'editor';

export interface ModeState {
  mode: ViewMode;
  editLayout: EditLayout;
  focusMode: boolean;
}

export type ModeAction =
  | { type: 'toggleEdit' }
  | { type: 'enterEdit' }
  | { type: 'enterRead' }
  | { type: 'toggleSplit' }
  | { type: 'toggleFocus' }
  | { type: 'exitFocus' };

export const initialMode: ModeState = { mode: 'read', editLayout: 'split', focusMode: false };

export function modeReducer(s: ModeState, a: ModeAction): ModeState {
  switch (a.type) {
    case 'toggleEdit':
      return { ...s, mode: s.mode === 'read' ? 'edit' : 'read' };
    case 'enterEdit':
      return s.mode === 'edit' ? s : { ...s, mode: 'edit' };
    case 'enterRead':
      return s.mode === 'read' ? s : { ...s, mode: 'read' };
    case 'toggleSplit':
      // Only meaningful in edit mode; from read mode it enters edit with the other layout.
      return s.mode === 'edit'
        ? { ...s, editLayout: s.editLayout === 'split' ? 'editor' : 'split' }
        : { ...s, mode: 'edit', editLayout: s.editLayout === 'split' ? 'editor' : 'split' };
    case 'toggleFocus':
      return { ...s, focusMode: !s.focusMode };
    case 'exitFocus':
      return s.focusMode ? { ...s, focusMode: false } : s;
  }
}

export function paneLayout(s: ModeState): PaneLayout {
  return s.mode === 'read' ? 'read' : s.editLayout;
}
