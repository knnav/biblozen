import { initialMode, modeReducer, paneLayout, type ModeAction, type ModeState } from './modes';

const run = (...actions: ModeAction[]): ModeState => actions.reduce(modeReducer, initialMode);

describe('mode state machine', () => {
  it('starts in read mode', () => {
    expect(paneLayout(initialMode)).toBe('read');
  });

  it('reaches all three layouts', () => {
    expect(paneLayout(run({ type: 'toggleEdit' }))).toBe('split');
    expect(paneLayout(run({ type: 'toggleEdit' }, { type: 'toggleSplit' }))).toBe('editor');
    expect(
      paneLayout(run({ type: 'toggleEdit' }, { type: 'toggleSplit' }, { type: 'toggleEdit' })),
    ).toBe('read');
  });

  it('remembers the edit layout across read mode', () => {
    const s = run(
      { type: 'toggleEdit' },
      { type: 'toggleSplit' },
      { type: 'toggleEdit' },
      { type: 'toggleEdit' },
    );
    expect(paneLayout(s)).toBe('editor');
  });

  it('focus mode is orthogonal and exits on demand', () => {
    const s = run({ type: 'toggleFocus' }, { type: 'toggleEdit' });
    expect(s.focusMode).toBe(true);
    expect(s.mode).toBe('edit');
    expect(modeReducer(s, { type: 'exitFocus' }).focusMode).toBe(false);
  });
});
