// CodeMirror theming: chrome from CSS variables (theme switches need no reconfigure),
// syntax colors from the color theme's TextMate scopes (SPEC §11.3), falling back to tokens.

import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { scopeColor } from '../themes/derive';
import type { ThemeDef, TokenColor } from '../themes/types';

export const editorChrome = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg-base)',
    backgroundColor: 'var(--bg-base)',
    fontSize: 'calc(var(--editor-size, 14px) * var(--editor-zoom, 1))',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font, var(--font-mono))',
    lineHeight: 'var(--editor-leading, 1.6)',
    overflowX: 'auto',
  },
  '.cm-content': {
    padding: 'var(--space-6) 0 40vh',
    caretColor: 'var(--editor-cursor)',
    maxWidth: 'calc(var(--reading-width, 70ch) + 8ch)',
  },
  '.cm-line': { padding: '0 var(--space-6) 0 var(--space-2)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--editor-cursor)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'var(--bg-selection)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-line-highlight)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-base)',
    color: 'var(--editor-gutter-fg)',
    border: 'none',
    paddingLeft: 'var(--space-2)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg-muted)' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '3ch', fontSize: '0.85em', paddingTop: '0.1em' },
  '.cm-foldGutter .cm-gutterElement': { color: 'var(--fg-subtle)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
    outline: 'none',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--callout-warning) 35%, transparent)',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--callout-warning)',
    color: 'var(--bg-base)',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' },
  '.cm-placeholder': { color: 'var(--fg-subtle)', fontStyle: 'italic' },
  '.cm-panels': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--fg-base)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--text-base)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-search': { padding: 'var(--space-2) var(--space-3)', gap: 'var(--space-1)' },
  '.cm-search label': { color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' },
  '.cm-textfield': {
    backgroundColor: 'var(--bg-base)',
    color: 'var(--fg-base)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 6px',
    fontSize: 'var(--text-base)',
  },
  '.cm-textfield:focus': { borderColor: 'var(--focus-ring)', outline: 'none' },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--fg-base)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 8px',
    fontSize: 'var(--text-sm)',
  },
  '.cm-button:hover': { backgroundColor: 'var(--bg-hover)' },
  '.cm-panel button[name=close]': { color: 'var(--fg-subtle)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--fg-base)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-elevated)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--bg-active)',
    color: 'var(--fg-base)',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--accent)',
    fontWeight: '600',
  },
  '.cm-completionDetail': { color: 'var(--fg-subtle)', fontStyle: 'normal', marginLeft: '0.75em' },
  '.cm-fat-cursor': {
    background: 'var(--editor-cursor) !important',
    color: 'var(--bg-base) !important',
  },
  '&:not(.cm-focused) .cm-fat-cursor': {
    background: 'none !important',
    outline: '1px solid var(--editor-cursor)',
  },
  '.cm-vim-panel': { fontFamily: 'var(--font-mono)', padding: '2px 8px' },
});

export interface SyntaxColors {
  heading?: string;
  bold?: string;
  italic?: string;
  link?: string;
  url?: string;
  code?: string;
  quote?: string;
  markup?: string;
  keyword?: string;
  string?: string;
  number?: string;
  comment?: string;
  func?: string;
  type?: string;
  property?: string;
  operator?: string;
  constant?: string;
  tag?: string;
  attribute?: string;
  variable?: string;
}

/** Pulls the colors we need out of TextMate rules. */
export function syntaxColorsFrom(rules: TokenColor[]): SyntaxColors {
  const c = (...scopes: string[]) => scopeColor(rules, scopes);
  return {
    heading: c('markup.heading', 'entity.name.section'),
    bold: c('markup.bold'),
    italic: c('markup.italic'),
    link: c('markup.underline.link', 'string.other.link', 'markup.link'),
    url: c('markup.underline.link'),
    code: c('markup.inline.raw', 'markup.raw', 'markup.fenced_code'),
    quote: c('markup.quote'),
    markup: c('punctuation.definition', 'markup.list', 'beginning.punctuation.definition.list'),
    keyword: c('keyword', 'storage'),
    string: c('string'),
    number: c('constant.numeric'),
    comment: c('comment'),
    func: c('entity.name.function', 'support.function'),
    type: c('entity.name.type', 'support.type', 'storage.type'),
    property: c('variable.other.property', 'support.type.property-name', 'meta.property-name'),
    operator: c('keyword.operator'),
    constant: c('constant.language', 'constant'),
    tag: c('entity.name.tag'),
    attribute: c('entity.other.attribute-name'),
    variable: c('variable'),
  };
}

/** Loads TextMate rules for a theme (bundled Shiki theme or inline user rules). */
export async function loadTokenColors(theme: ThemeDef): Promise<TokenColor[]> {
  if (typeof theme.syntax !== 'string') return theme.syntax.tokenColors;
  const { bundledThemes } = await import('shiki/themes');
  const loader = bundledThemes[theme.syntax as keyof typeof bundledThemes];
  if (!loader) return [];
  const mod = await loader();
  return ((mod.default as { tokenColors?: TokenColor[] }).tokenColors ?? []) as TokenColor[];
}

export function highlightStyle(s: SyntaxColors): HighlightStyle {
  const v = (c: string | undefined, fallback: string) => c ?? `var(${fallback})`;
  return HighlightStyle.define([
    { tag: t.heading, color: v(s.heading, '--fg-heading'), fontWeight: '700' },
    { tag: [t.heading1, t.heading2], color: v(s.heading, '--fg-heading'), fontWeight: '700' },
    { tag: t.strong, color: s.bold, fontWeight: '700' },
    { tag: t.emphasis, color: s.italic, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--fg-muted)' },
    { tag: t.link, color: v(s.link, '--fg-link') },
    { tag: t.url, color: v(s.url ?? s.link, '--fg-link'), textDecoration: 'underline' },
    { tag: t.monospace, color: v(s.code, '--fg-inlinecode') },
    { tag: t.quote, color: v(s.quote, '--fg-muted'), fontStyle: 'italic' },
    { tag: [t.processingInstruction, t.contentSeparator], color: v(s.markup, '--fg-subtle') },
    { tag: t.meta, color: 'var(--fg-subtle)' },
    {
      tag: [t.comment, t.lineComment, t.blockComment],
      color: v(s.comment, '--fg-subtle'),
      fontStyle: 'italic',
    },
    {
      tag: [t.keyword, t.modifier, t.controlKeyword, t.definitionKeyword],
      color: v(s.keyword, '--accent'),
    },
    { tag: [t.string, t.special(t.string), t.regexp], color: v(s.string, '--callout-tip') },
    { tag: [t.number, t.integer, t.float], color: v(s.number, '--callout-warning') },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName)],
      color: v(s.func, '--fg-link'),
    },
    { tag: [t.typeName, t.className, t.namespace], color: v(s.type, '--callout-important') },
    { tag: [t.propertyName, t.attributeName], color: s.property ?? s.attribute },
    { tag: t.operator, color: s.operator },
    {
      tag: [t.bool, t.null, t.atom, t.constant(t.variableName)],
      color: v(s.constant, '--callout-warning'),
    },
    { tag: t.tagName, color: v(s.tag, '--callout-caution') },
    { tag: t.variableName, color: s.variable },
    { tag: t.invalid, color: 'var(--callout-caution)' },
  ]);
}
