// Theme token schema (SPEC §11.2).

export const TOKEN_KEYS = [
  'bg.base',
  'bg.sidebar',
  'bg.elevated',
  'bg.titlebar',
  'bg.statusbar',
  'bg.selection',
  'bg.hover',
  'bg.active',
  'bg.codeblock',
  'bg.inlinecode',
  'bg.callout',
  'fg.base',
  'fg.muted',
  'fg.subtle',
  'fg.heading',
  'fg.link',
  'fg.linkUnresolved',
  'fg.inlinecode',
  'accent',
  'accent.fg',
  'border',
  'border.strong',
  'focusRing',
  'scrollbar',
  'callout.note',
  'callout.tip',
  'callout.important',
  'callout.warning',
  'callout.caution',
  'editor.cursor',
  'editor.lineHighlight',
  'editor.gutterFg',
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type Tokens = Record<TokenKey, string>;

export interface TokenColor {
  scope?: string | string[];
  settings: { foreground?: string; background?: string; fontStyle?: string };
}

export interface ThemeDef {
  id: string;
  name: string;
  type: 'light' | 'dark';
  tokens: Tokens;
  /** Shiki theme id, or inline TextMate rules for user themes. */
  syntax: string | { tokenColors: TokenColor[]; colors?: Record<string, string> };
  /** Where it came from (for the picker). */
  source?: 'builtin' | 'user';
}

/** `bg.linkUnresolved` → `--bg-link-unresolved`. */
export function cssVarName(key: string): string {
  return '--' + key.replace(/\./g, '-').replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
