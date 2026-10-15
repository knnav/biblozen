// Saving, dirty-state guards, autosave and conflict handling (SPEC §7.3, §4.3).

import type { Command, CommandContext } from '../commands/registry';
import { getPlatform } from '../platform';
import { basename } from '../platform/path';
import { getSettings, useSettings } from '../settings/store';
import { ask } from '../ui/dialog';
import { addBeforeSwitchGuard, currentFormat } from './actions';
import { DELETED_ON_DISK, isDirty, useDocument } from './document';
import { saveDocument } from './save';
import { detectFormat, toBuffer } from './textfile';
import { toastError } from './toasts';

/** Save / Discard / Cancel. Resolves true when it's OK to continue. */
export async function confirmLeave(action = 'continue'): Promise<boolean> {
  const doc = useDocument.getState();
  if (!isDirty(doc)) return true;
  const name = doc.path ? basename(doc.path) : 'this file';
  const choice = await ask({
    title: `Save changes to “${name}”?`,
    message: `Your changes will be lost if you ${action} without saving.`,
    defaultId: 'save',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'discard', label: 'Don’t Save', kind: 'danger' },
      { id: 'save', label: 'Save', kind: 'primary' },
    ],
  });
  if (choice === 'save') return saveDocument();
  if (choice === 'discard') {
    useDocument.setState((s) => ({ text: s.savedText, conflict: null }));
    return true;
  }
  return false;
}

/** Reloads the buffer from disk, discarding unsaved edits. */
export async function reloadFromDisk(): Promise<void> {
  const path = useDocument.getState().path;
  if (!path) return;
  try {
    const raw = await getPlatform().readTextFile(path);
    const text = toBuffer(raw);
    Object.assign(currentFormat(), detectFormat(raw));
    useDocument.setState({ text, savedText: text, conflict: null });
  } catch (e) {
    toastError(e, 'Couldn’t reload');
  }
}

/** Keeps the editor's version; the next save overwrites the disk copy. */
export function keepMine(): void {
  const c = useDocument.getState().conflict;
  if (!c) return;
  // The disk now holds `diskText` (or nothing); our buffer differs, so it stays dirty
  // and the next save writes it back.
  useDocument.setState({ conflict: null, savedText: c.diskText ?? DELETED_ON_DISK });
}

const hasDoc = (c: CommandContext) => c.mode !== 'none';

export function editingCommands(): Command[] {
  return [
    {
      id: 'file.save',
      title: 'Save',
      category: 'File',
      keys: ['Mod+S'],
      when: hasDoc,
      run: async () => {
        await saveDocument();
      },
    },
    {
      id: 'file.revert',
      title: 'Revert File (Reload from Disk)',
      category: 'File',
      when: () => isDirty(useDocument.getState()),
      run: async () => {
        const ok = await ask({
          title: 'Discard unsaved changes and reload from disk?',
          buttons: [
            { id: 'cancel', label: 'Cancel' },
            { id: 'ok', label: 'Revert', kind: 'danger' },
          ],
          defaultId: 'ok',
        });
        if (ok === 'ok') await reloadFromDisk();
      },
    },
    {
      id: 'editor.toggleVim',
      title: 'Toggle Vim Mode',
      category: 'Editor',
      run: () => useSettings.getState().set('editor.vim', !getSettings().editor.vim),
    },
    {
      id: 'editor.toggleWrap',
      title: 'Toggle Soft Wrap',
      category: 'Editor',
      run: () => useSettings.getState().set('editor.softWrap', !getSettings().editor.softWrap),
    },
    {
      id: 'editor.toggleScrollSync',
      title: 'Toggle Scroll Sync',
      category: 'Editor',
      run: () => useSettings.getState().set('editor.scrollSync', !getSettings().editor.scrollSync),
    },
    {
      id: 'editor.togglePreviewSide',
      title: 'Put Preview on the Other Side',
      category: 'Editor',
      run: () =>
        useSettings.getState().set('editor.previewOnLeft', !getSettings().editor.previewOnLeft),
    },
  ];
}

/** Guards, autosave and window-close handling. Returns a disposer. */
export function bindEditing(): () => void {
  const disposers: (() => void)[] = [];
  disposers.push(addBeforeSwitchGuard(() => confirmLeave('switch files')));

  // Autosave: after N seconds idle, or when the window loses focus.
  let idle: ReturnType<typeof setTimeout> | undefined;
  disposers.push(
    useDocument.subscribe((s, p) => {
      if (s.text === p.text || !isDirty(s) || s.conflict) return;
      const a = getSettings().editor;
      clearTimeout(idle);
      if (a.autosave === 'idle')
        idle = setTimeout(() => void saveDocument(), a.autosaveDelaySec * 1000);
    }),
  );
  const onBlur = () => {
    const d = useDocument.getState();
    if (getSettings().editor.autosave === 'focus' && isDirty(d) && !d.conflict) void saveDocument();
  };
  window.addEventListener('blur', onBlur);
  disposers.push(() => window.removeEventListener('blur', onBlur));

  // Never lose data on close: prompt when dirty.
  let unlisten: (() => void) | undefined;
  void getPlatform()
    .window.onCloseRequested(async () => {
      if (!isDirty(useDocument.getState())) return true;
      return confirmLeave('close the window');
    })
    .then((u) => (unlisten = u));
  disposers.push(() => unlisten?.());

  return () => {
    clearTimeout(idle);
    disposers.forEach((d) => d());
  };
}
