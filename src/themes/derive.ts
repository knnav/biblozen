// VS Code theme → Biblozen tokens, and filling in missing tokens (SPEC §11.3).
// Used by the build script (built-ins) and at runtime (user themes).

import {
  contrast,
  deltaE,
  ensureContrast,
  flatten,
  hex,
  isColor,
  luminanceIsDark,
  mix,
  readableOn,
} from './color';
import { TOKEN_KEYS, type ThemeDef, type TokenColor, type TokenKey, type Tokens } from './types';

export interface VsCodeTheme {
  name?: string;
  displayName?: string;
  type?: string;
  colors?: Record<string, string>;
  tokenColors?: TokenColor[];
  semanticTokenColors?: unknown;
}

/** Contrast rules every theme must meet. Checked by scripts/check-contrast.ts too. */
export const LEGIBILITY: {
  fg: TokenKey;
  bg: TokenKey;
  min: number;
  label: string;
  adjust?: 'bg';
}[] = [
  { fg: 'fg.base', bg: 'bg.base', min: 4.5, label: 'body text' },
  { fg: 'fg.heading', bg: 'bg.base', min: 4.5, label: 'headings' },
  { fg: 'fg.muted', bg: 'bg.base', min: 4.5, label: 'muted text (quotes)' },
  { fg: 'fg.link', bg: 'bg.base', min: 4.5, label: 'links' },
  { fg: 'fg.linkUnresolved', bg: 'bg.base', min: 4.5, label: 'unresolved links' },
  { fg: 'fg.inlinecode', bg: 'bg.inlinecode', min: 4.5, label: 'inline code' },
  { fg: 'fg.base', bg: 'bg.codeblock', min: 4.5, label: 'code blocks', adjust: 'bg' },
  { fg: 'fg.base', bg: 'bg.elevated', min: 4.5, label: 'palette text', adjust: 'bg' },
  { fg: 'fg.muted', bg: 'bg.sidebar', min: 4.5, label: 'sidebar text' },
  { fg: 'fg.base', bg: 'bg.active', min: 4.5, label: 'active row', adjust: 'bg' },
  { fg: 'accent.fg', bg: 'accent', min: 4.5, label: 'accent buttons' },
  // fg.subtle is used for small UI text (labels, status bar), so it needs AA too.
  { fg: 'fg.subtle', bg: 'bg.base', min: 4.5, label: 'subtle text' },
  { fg: 'fg.subtle', bg: 'bg.statusbar', min: 4.5, label: 'status bar' },
  { fg: 'fg.subtle', bg: 'bg.titlebar', min: 4.5, label: 'title bar' },
  { fg: 'fg.subtle', bg: 'bg.sidebar', min: 4.5, label: 'sidebar labels' },
  { fg: 'fg.subtle', bg: 'bg.elevated', min: 4.5, label: 'palette details' },
  { fg: 'fg.subtle', bg: 'bg.codeblock', min: 4.5, label: 'code labels' },
  { fg: 'fg.muted', bg: 'bg.elevated', min: 4.5, label: 'muted text in popovers' },
  { fg: 'fg.subtle', bg: 'bg.active', min: 4.5, label: 'details on the selected row' },
  { fg: 'fg.muted', bg: 'bg.active', min: 4.5, label: 'muted text on the selected row' },
  { fg: 'fg.muted', bg: 'bg.hover', min: 4.5, label: 'muted text on hover' },
  { fg: 'editor.gutterFg', bg: 'bg.base', min: 4.5, label: 'line numbers' },
  { fg: 'callout.note', bg: 'bg.base', min: 3, label: 'note callout' },
  { fg: 'callout.tip', bg: 'bg.base', min: 3, label: 'tip callout' },
  { fg: 'callout.important', bg: 'bg.base', min: 3, label: 'important callout' },
  { fg: 'callout.warning', bg: 'bg.base', min: 3, label: 'warning callout' },
  { fg: 'callout.caution', bg: 'bg.base', min: 3, label: 'caution callout' },
  // Alert titles are small bold text on the callout surface, which carries an 8% tint
  // of the alert color (preview.css); 5:1 on the untinted surface keeps them above 4.5:1.
  { fg: 'callout.note', bg: 'bg.callout', min: 5, label: 'note title' },
  { fg: 'callout.tip', bg: 'bg.callout', min: 5, label: 'tip title' },
  { fg: 'callout.important', bg: 'bg.callout', min: 5, label: 'important title' },
  { fg: 'callout.warning', bg: 'bg.callout', min: 5, label: 'warning title' },
  { fg: 'callout.caution', bg: 'bg.callout', min: 5, label: 'caution title' },
  { fg: 'fg.base', bg: 'bg.selection', min: 3, label: 'selected text', adjust: 'bg' },
  { fg: 'focusRing', bg: 'bg.base', min: 3, label: 'focus ring' },
];

export function scopeColor(rules: TokenColor[] | undefined, wanted: string[]): string | undefined {
  if (!rules) return undefined;
  for (const w of wanted) {
    for (const r of rules) {
      const scopes = Array.isArray(r.scope)
        ? r.scope
        : (r.scope ?? '').split(',').map((s) => s.trim());
      if (
        scopes.some((s) => s === w || s.startsWith(w + ' ') || s.startsWith(w + '.')) &&
        r.settings?.foreground
      ) {
        return r.settings.foreground;
      }
    }
  }
  return undefined;
}

/** Default (no-rules) foreground from tokenColors, as VS Code does. */
function globalForeground(rules: TokenColor[] | undefined): string | undefined {
  return rules?.find((r) => !r.scope && r.settings?.foreground)?.settings.foreground;
}

const PALETTE = {
  dark: { blue: '#58a6ff', green: '#3fb950', purple: '#bc8cff', yellow: '#d29922', red: '#f85149' },
  light: {
    blue: '#0969da',
    green: '#1a7f37',
    purple: '#8250df',
    yellow: '#9a6700',
    red: '#cf222e',
  },
};

/**
 * Fills every token. `partial` wins where present; everything else is derived
 * from base colors. Finally enforces LEGIBILITY by nudging foregrounds.
 */
export function completeTokens(partial: Partial<Tokens>, type: 'light' | 'dark'): Tokens {
  const dark = type === 'dark';
  const p: Partial<Record<TokenKey, string>> = {};
  for (const [k, v] of Object.entries(partial)) if (isColor(v)) p[k as TokenKey] = v;
  const base = hex(p['bg.base'] ?? (dark ? '#1e1e1e' : '#ffffff'));
  const flat = (c: string | undefined) => (c ? flatten(c, base) : undefined);
  const fg = flat(p['fg.base']) ?? (dark ? '#d4d4d4' : '#24292f');
  const elevate = (t: number) => mix(base, dark ? '#ffffff' : '#000000', t);
  const toward = (t: number) => mix(base, fg, t);

  const t: Partial<Tokens> = {};
  t['bg.base'] = base;
  t['fg.base'] = fg;
  t['bg.sidebar'] =
    flat(p['bg.sidebar']) ?? (dark ? mix(base, '#000000', 0.12) : mix(base, '#000000', 0.025));
  t['bg.elevated'] = flat(p['bg.elevated']) ?? (dark ? elevate(0.06) : base);
  t['bg.titlebar'] = flat(p['bg.titlebar']) ?? t['bg.sidebar'];
  t['bg.statusbar'] = flat(p['bg.statusbar']) ?? t['bg.sidebar'];
  t['bg.hover'] = flat(p['bg.hover']) ?? toward(dark ? 0.08 : 0.06);
  t['bg.active'] = flat(p['bg.active']) ?? toward(dark ? 0.14 : 0.1);
  t['bg.selection'] = flat(p['bg.selection']) ?? toward(dark ? 0.22 : 0.18);
  t['bg.codeblock'] =
    flat(p['bg.codeblock']) ?? (dark ? mix(base, '#000000', 0.18) : mix(base, '#000000', 0.035));
  t['bg.inlinecode'] = flat(p['bg.inlinecode']) ?? toward(dark ? 0.1 : 0.07);
  t['bg.callout'] = flat(p['bg.callout']) ?? toward(dark ? 0.05 : 0.035);
  t['fg.muted'] = flat(p['fg.muted']) ?? toward(0.72);
  t['fg.subtle'] = flat(p['fg.subtle']) ?? toward(0.5);
  // Headings: a touch stronger than body text rather than a syntax color.
  t['fg.heading'] = flat(p['fg.heading']) ?? mix(fg, dark ? '#ffffff' : '#000000', 0.3);
  const pal = dark ? PALETTE.dark : PALETTE.light;
  t['accent'] = flat(p['accent']) ?? flat(p['fg.link']) ?? pal.blue;
  t['fg.link'] = flat(p['fg.link']) ?? t['accent'];
  t['fg.linkUnresolved'] = flat(p['fg.linkUnresolved']) ?? flat(p['callout.caution']) ?? pal.red;
  t['fg.inlinecode'] = flat(p['fg.inlinecode']) ?? fg;
  t['accent.fg'] = flat(p['accent.fg']) ?? readableOn(t['accent']);
  t['border'] = flat(p['border']) ?? toward(dark ? 0.13 : 0.12);
  t['border.strong'] = flat(p['border.strong']) ?? toward(dark ? 0.22 : 0.22);
  t['focusRing'] = flat(p['focusRing']) ?? t['accent'];
  t['scrollbar'] = flat(p['scrollbar']) ?? toward(dark ? 0.2 : 0.2);
  t['callout.note'] = flat(p['callout.note']) ?? pal.blue;
  t['callout.tip'] = flat(p['callout.tip']) ?? pal.green;
  t['callout.important'] = flat(p['callout.important']) ?? pal.purple;
  t['callout.warning'] = flat(p['callout.warning']) ?? pal.yellow;
  t['callout.caution'] = flat(p['callout.caution']) ?? pal.red;
  t['editor.cursor'] = flat(p['editor.cursor']) ?? t['accent'];
  t['editor.lineHighlight'] = flat(p['editor.lineHighlight']) ?? toward(dark ? 0.04 : 0.03);
  t['editor.gutterFg'] = flat(p['editor.gutterFg']) ?? t['fg.subtle'];

  const tokens = t as Tokens;
  for (const k of TOKEN_KEYS) tokens[k] = hex(tokens[k]);
  // Two passes: fixing one pair can (rarely) move a color shared with another.
  // Targets carry a small margin so hex rounding can't drop below the minimum.
  for (let pass = 0; pass < 2; pass++) {
    for (const rule of LEGIBILITY) {
      const before = tokens[rule.fg];
      if (contrast(before, tokens[rule.bg]) >= rule.min) continue;
      if (rule.adjust === 'bg') {
        // Secondary surfaces give way; body text stays as the theme intended.
        tokens[rule.bg] = hex(ensureContrast(tokens[rule.bg], before, rule.min + 0.05));
      } else {
        tokens[rule.fg] =
          rule.fg === 'accent.fg'
            ? readableOn(tokens.accent)
            : hex(ensureContrast(before, tokens[rule.bg], rule.min + 0.05));
      }
    }
    // Accent text on accent backgrounds may still fail for mid-tone accents.
    if (contrast(tokens['accent.fg'], tokens.accent) < 4.5) {
      tokens.accent = hex(ensureContrast(tokens.accent, tokens['accent.fg'], 4.55));
    }
  }
  return tokens;
}

/** Converts a VS Code color theme to a Biblozen theme. */
export function fromVsCode(json: VsCodeTheme, id: string, fallbackName?: string): ThemeDef {
  const c = json.colors ?? {};
  const rules = json.tokenColors;
  const typeGuess =
    json.type === 'light' || json.type === 'hc-light'
      ? 'light'
      : json.type === 'dark' || json.type === 'hc-black'
        ? 'dark'
        : undefined;
  const base = c['editor.background'] ?? (typeGuess === 'light' ? '#ffffff' : '#1e1e1e');
  const type = typeGuess ?? (luminanceIsDark(flatten(base, '#808080')) ? 'dark' : 'light');
  const fg = c['editor.foreground'] ?? c['foreground'] ?? globalForeground(rules);
  const b = flatten(base, type === 'dark' ? '#000000' : '#ffffff');

  // Coloured title/status bars (e.g. VS Code's blue status bar) clash with a calm
  // reading app; only keep them when they're close to the editor background.
  const calm = (k: string, max = 12) => {
    const v = c[k];
    return v && isColor(v) && deltaE(flatten(v, b), b) < max ? v : undefined;
  };

  const partial: Partial<Tokens> = {
    'bg.base': b,
    'fg.base': fg,
    'bg.sidebar': calm('sideBar.background') ?? calm('activityBar.background'),
    'bg.elevated':
      c['quickInput.background'] ?? c['editorWidget.background'] ?? c['dropdown.background'],
    'bg.titlebar': calm('titleBar.activeBackground') ?? calm('sideBar.background'),
    'bg.statusbar': calm('statusBar.background') ?? calm('sideBar.background'),
    'bg.selection': c['editor.selectionBackground'],
    'bg.hover': c['list.hoverBackground'],
    'bg.active':
      calm('list.inactiveSelectionBackground', 25) ?? calm('list.activeSelectionBackground', 25),
    'bg.codeblock': c['textCodeBlock.background'],
    'fg.muted': c['descriptionForeground'],
    'fg.subtle': c['editorLineNumber.foreground'],
    'fg.link':
      c['textLink.foreground'] ?? scopeColor(rules, ['markup.underline.link', 'string.other.link']),
    'fg.linkUnresolved': c['editorError.foreground'] ?? c['errorForeground'],
    'fg.inlinecode': scopeColor(rules, ['markup.inline.raw', 'markup.raw', 'string']),
    accent:
      c['focusBorder'] ??
      c['button.background'] ??
      c['activityBarBadge.background'] ??
      c['textLink.foreground'],
    'accent.fg': c['button.foreground'],
    border: c['panel.border'] ?? c['sideBar.border'] ?? c['editorGroup.border'],
    focusRing: c['focusBorder'],
    scrollbar: c['scrollbarSlider.background'],
    'callout.note': c['terminal.ansiBlue'],
    'callout.tip': c['terminal.ansiGreen'],
    'callout.important': c['terminal.ansiMagenta'],
    'callout.warning': c['terminal.ansiYellow'],
    'callout.caution': c['terminal.ansiRed'],
    'editor.cursor': c['editorCursor.foreground'],
    'editor.lineHighlight': c['editor.lineHighlightBackground'],
    'editor.gutterFg': c['editorLineNumber.foreground'],
  };
  // Alpha colors composite over the base before anything else.
  for (const k of Object.keys(partial) as TokenKey[]) {
    const v = partial[k];
    if (!v || !isColor(v)) delete partial[k];
    else partial[k] = flatten(v, b);
  }
  // A few themes set focusBorder to near-transparent; that makes a poor accent.
  if (partial.accent && contrast(partial.accent, b) < 1.6) delete partial.accent;
  return {
    id,
    name: json.displayName ?? json.name ?? fallbackName ?? id,
    type,
    tokens: completeTokens(partial, type),
    syntax: { tokenColors: rules ?? [], colors: c },
  };
}

/** Strips // and /* *\/ comments and trailing commas (VS Code themes are JSONC). */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** Accepts a native theme or a VS Code theme (user themes folder). */
export function parseUserTheme(text: string, id: string): ThemeDef {
  const json = parseJsonc(text) as Record<string, unknown>;
  if (json && typeof json === 'object' && 'tokens' in json && typeof json.tokens === 'object') {
    const type = json.type === 'light' ? 'light' : 'dark';
    const syntax = json.syntax;
    return {
      id,
      name: typeof json.name === 'string' ? json.name : id,
      type,
      tokens: completeTokens(json.tokens as Partial<Tokens>, type),
      syntax:
        typeof syntax === 'string'
          ? syntax
          : syntax && typeof syntax === 'object' && 'tokenColors' in syntax
            ? (syntax as ThemeDef['syntax'])
            : type === 'dark'
              ? 'github-dark'
              : 'github-light',
      source: 'user',
    };
  }
  if (json && typeof json === 'object' && ('colors' in json || 'tokenColors' in json)) {
    return { ...fromVsCode(json as VsCodeTheme, id), source: 'user' };
  }
  throw new Error('Not a theme: expected "tokens" (Biblozen) or "colors"/"tokenColors" (VS Code)');
}
