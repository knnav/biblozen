import { contrast } from './color';
import { LEGIBILITY, completeTokens, fromVsCode, parseJsonc, parseUserTheme } from './derive';
import { TOKEN_KEYS, cssVarName } from './types';

describe('theme derivation', () => {
  it('fills every token from just a background and foreground', () => {
    const t = completeTokens({ 'bg.base': '#1e1e2e', 'fg.base': '#cdd6f4' }, 'dark');
    for (const k of TOKEN_KEYS) expect(t[k]).toMatch(/^#[0-9a-f]{6}$/);
    expect(t['bg.sidebar']).not.toBe(t['bg.base']);
  });

  it('enforces every legibility rule, even for a terrible input', () => {
    const t = completeTokens(
      {
        'bg.base': '#2a2a2a',
        'fg.base': '#3a3a3a',
        'fg.link': '#303050',
        accent: '#2c2c2c',
        'callout.tip': '#2f3a2f',
      },
      'dark',
    );
    for (const r of LEGIBILITY) expect(contrast(t[r.fg], t[r.bg])).toBeGreaterThanOrEqual(r.min);
    const light = completeTokens(
      { 'bg.base': '#fdf6e3', 'fg.base': '#eee8d5', 'fg.muted': '#e0dccc' },
      'light',
    );
    for (const r of LEGIBILITY)
      expect(contrast(light[r.fg], light[r.bg])).toBeGreaterThanOrEqual(r.min);
  });

  it('flattens alpha colors over the base', () => {
    const t = completeTokens({ 'bg.base': '#000000', 'bg.hover': '#ffffff33' }, 'dark');
    expect(t['bg.hover']).toBe('#333333');
  });

  it('maps a VS Code theme', () => {
    const th = fromVsCode(
      {
        name: 'Test Dark',
        type: 'dark',
        colors: {
          'editor.background': '#101010',
          'editor.foreground': '#e0e0e0',
          'textLink.foreground': '#4aa3ff',
          'statusBar.background': '#007acc',
          focusBorder: '#ff8800',
        },
        tokenColors: [{ scope: 'markup.heading', settings: { foreground: '#ffcc66' } }],
      },
      'test-dark',
    );
    expect(th.type).toBe('dark');
    expect(th.tokens['bg.base']).toBe('#101010');
    expect(th.tokens['fg.link']).toBe('#4aa3ff');
    // Headings stay text-colored (stronger than body), not the syntax heading color.
    expect(th.tokens['fg.heading']).not.toBe('#ffcc66');
    expect(th.tokens.accent).toBe('#ff8800');
    // Loud blue status bar is replaced by a calm derived one.
    expect(th.tokens['bg.statusbar']).not.toBe('#007acc');
  });

  it('parses JSONC and recognizes both theme formats', () => {
    expect(parseJsonc('{ // c\n "a": "x//y", /* b */ "b": [1,2,], }')).toEqual({
      a: 'x//y',
      b: [1, 2],
    });
    const native = parseUserTheme('{"name":"N","type":"light","tokens":{"bg.base":"#fff"}}', 'n');
    expect(native.type).toBe('light');
    expect(native.source).toBe('user');
    const vs = parseUserTheme('{"colors":{"editor.background":"#fafafa"},"type":"light"}', 'v');
    expect(vs.tokens['bg.base']).toBe('#fafafa');
    expect(() => parseUserTheme('{"foo":1}', 'x')).toThrow(/Not a theme/);
  });

  it('names CSS variables', () => {
    expect(cssVarName('fg.linkUnresolved')).toBe('--fg-link-unresolved');
    expect(cssVarName('editor.lineHighlight')).toBe('--editor-line-highlight');
    expect(cssVarName('accent')).toBe('--accent');
  });
});
