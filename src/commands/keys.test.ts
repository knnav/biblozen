import { eventToStroke, formatBindingText, parseBinding, strokesEqual } from './keys';

function ev(init: KeyboardEventInit & { code?: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('keys', () => {
  it('parses chords and sequences', () => {
    expect(parseBinding('Mod+K Mod+T')).toHaveLength(2);
    expect(parseBinding('g g').map((s) => s.key)).toEqual(['g', 'g']);
    expect(parseBinding('Mod+=')[0].key).toBe('=');
    expect(parseBinding('Mod+\\')[0].key).toBe('\\');
  });

  it('maps Cmd on mac and Ctrl elsewhere to Mod', () => {
    const p = parseBinding('Mod+Shift+P')[0];
    const mac = eventToStroke(
      ev({ key: 'P', code: 'KeyP', metaKey: true, shiftKey: true }),
      'macos',
    )!;
    const win = eventToStroke(
      ev({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }),
      'windows',
    )!;
    expect(strokesEqual(mac, p)).toBe(true);
    expect(strokesEqual(win, p)).toBe(true);
    const winMeta = eventToStroke(
      ev({ key: 'p', code: 'KeyP', metaKey: true, shiftKey: true }),
      'windows',
    )!;
    expect(strokesEqual(winMeta, p)).toBe(false);
  });

  it('uses physical letter keys when Alt changes the character', () => {
    const s = eventToStroke(ev({ key: 'ø', code: 'KeyO', metaKey: true, altKey: true }), 'macos')!;
    expect(strokesEqual(s, parseBinding('Mod+Alt+O')[0])).toBe(true);
  });

  it('distinguishes G from g', () => {
    const G = eventToStroke(ev({ key: 'G', code: 'KeyG', shiftKey: true }), 'linux')!;
    expect(strokesEqual(G, parseBinding('Shift+G')[0])).toBe(true);
    expect(strokesEqual(G, parseBinding('g')[0])).toBe(false);
  });

  it('formats per OS', () => {
    expect(formatBindingText('Mod+Shift+P', 'macos')).toBe('⇧⌘P');
    expect(formatBindingText('Mod+Shift+P', 'windows')).toBe('Ctrl+Shift+P');
    expect(formatBindingText('Mod+K Mod+T', 'windows')).toBe('Ctrl+K Ctrl+T');
  });
});
