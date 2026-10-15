import {
  clearCommands,
  createKeyDispatcher,
  registerCommand,
  setCommandContextProvider,
  type CommandContext,
} from './registry';

const base: CommandContext = { mode: 'read', textFocus: false, editorFocus: false, overlay: false };

function press(d: (e: KeyboardEvent) => void, init: KeyboardEventInit) {
  const e = new KeyboardEvent('keydown', { cancelable: true, ...init });
  d(e);
  return e;
}

describe('key dispatcher', () => {
  let ctx = base;
  beforeEach(() => {
    clearCommands();
    ctx = base;
    setCommandContextProvider(() => ctx);
  });

  it('runs chords and sequences', async () => {
    const hits: string[] = [];
    registerCommand({
      id: 'theme',
      title: 'Theme',
      keys: ['Mod+K Mod+T'],
      run: () => void hits.push('theme'),
    });
    registerCommand({ id: 'top', title: 'Top', keys: ['g g'], run: () => void hits.push('top') });
    const d = createKeyDispatcher('windows');
    press(d, { key: 'k', code: 'KeyK', ctrlKey: true });
    press(d, { key: 't', code: 'KeyT', ctrlKey: true });
    press(d, { key: 'g', code: 'KeyG' });
    press(d, { key: 'g', code: 'KeyG' });
    await Promise.resolve();
    expect(hits).toEqual(['theme', 'top']);
  });

  it('ignores plain keys while typing but not modified ones', async () => {
    const hits: string[] = [];
    registerCommand({ id: 'edit', title: 'Edit', keys: ['e'], run: () => void hits.push('e') });
    registerCommand({
      id: 'save',
      title: 'Save',
      keys: ['Mod+S'],
      run: () => void hits.push('save'),
    });
    ctx = { ...base, textFocus: true };
    const d = createKeyDispatcher('macos');
    const e1 = press(d, { key: 'e', code: 'KeyE' });
    press(d, { key: 's', code: 'KeyS', metaKey: true });
    await Promise.resolve();
    expect(hits).toEqual(['save']);
    expect(e1.defaultPrevented).toBe(false);
  });

  it('respects binding conditions', async () => {
    const hits: string[] = [];
    registerCommand({
      id: 'tree',
      title: 'Toggle tree',
      keys: [{ keys: 'Mod+B', when: (c) => c.mode === 'read' }, { keys: 'Mod+Shift+B' }],
      run: () => void hits.push('tree'),
    });
    ctx = { ...base, mode: 'edit' };
    const d = createKeyDispatcher('linux');
    press(d, { key: 'b', code: 'KeyB', ctrlKey: true });
    press(d, { key: 'B', code: 'KeyB', ctrlKey: true, shiftKey: true });
    await Promise.resolve();
    expect(hits).toEqual(['tree']);
  });
});
