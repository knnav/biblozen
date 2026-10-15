import type { Command, CommandContext } from '../commands/registry';
import { editorTopLine } from '../editor/controller';
import { setPendingTopLine } from '../editor/position';
import { currentTopLine } from '../reader/position';
import { paneLayout, type ModeAction } from './modes';
import { useWorkspace } from './workspace';

const ws = () => useWorkspace.getState();

/** Switches mode, handing the top visible source line to the next view (SPEC §3.2). */
export function switchMode(action: ModeAction): void {
  const layout = paneLayout(ws());
  const e = layout === 'read' ? null : editorTopLine();
  setPendingTopLine(e ? e.line + e.frac : currentTopLine());
  ws().dispatchMode(action);
}
export const inRead = (c: CommandContext) => c.mode === 'read';
export const inEdit = (c: CommandContext) => c.mode === 'edit';
const readNoText = (c: CommandContext) => c.mode === 'read' && !c.textFocus;

export function appCommands(): Command[] {
  return [
    {
      id: 'palette.open',
      title: 'Show Command Palette',
      category: 'View',
      keys: ['Mod+Shift+P'],
      run: () => (ws().overlay === 'palette' ? ws().closeOverlay() : ws().openOverlay('palette')),
    },
    {
      id: 'mode.toggleEdit',
      title: 'Toggle Read / Edit Mode',
      category: 'View',
      keys: ['Mod+E', { keys: 'e', when: readNoText }],
      when: (c) => c.mode !== 'none',
      run: () => switchMode({ type: 'toggleEdit' }),
    },
    {
      id: 'mode.read',
      title: 'Switch to Read Mode',
      category: 'View',
      when: inEdit,
      run: () => switchMode({ type: 'enterRead' }),
    },
    {
      id: 'mode.edit',
      title: 'Switch to Edit Mode',
      category: 'View',
      when: inRead,
      run: () => switchMode({ type: 'enterEdit' }),
    },
    {
      id: 'mode.toggleSplit',
      title: 'Toggle Split / Editor Only',
      category: 'View',
      keys: ['Mod+\\'],
      when: (c) => c.mode !== 'none',
      run: () => switchMode({ type: 'toggleSplit' }),
    },
    {
      id: 'tree.toggle',
      title: 'Toggle Sidebar',
      category: 'View',
      keys: [{ keys: 'Mod+B', when: (c) => c.mode !== 'edit' }, 'Mod+Shift+B'],
      run: () => {
        const s = ws();
        if (s.focusMode) s.dispatchMode({ type: 'exitFocus' });
        s.setTreeCollapsed(!s.treeCollapsed);
      },
    },
    {
      id: 'view.focusMode',
      title: 'Toggle Focus Mode',
      category: 'View',
      keys: ['Mod+Shift+F'],
      run: () => ws().dispatchMode({ type: 'toggleFocus' }),
    },
    {
      id: 'view.exitFocusMode',
      title: 'Exit Focus Mode',
      category: 'View',
      keys: ['Escape'],
      when: () => ws().focusMode && ws().overlay === null,
      run: () => ws().dispatchMode({ type: 'exitFocus' }),
    },
    {
      id: 'settings.open',
      title: 'Open Settings',
      category: 'Preferences',
      keys: ['Mod+,'],
      run: () => ws().openOverlay('settings'),
    },
    {
      id: 'view.resetSplit',
      title: 'Reset Split to 50/50',
      category: 'View',
      when: (c) => c.mode === 'edit' && ws().editLayout === 'split',
      run: () => ws().setSplitRatio(0.5),
    },
  ];
}
