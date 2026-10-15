// One CodeMirror view per window, kept alive across mode and layout switches so
// undo history, selection and scroll survive toggling read/edit/split.

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from '@codemirror/search';
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  type KeyBinding,
} from '@codemirror/view';
import { useDocument } from '../app/document';
import { getSettings, useSettings } from '../settings/store';
import { findTheme } from '../themes/engine';
import { useTheme } from '../themes/store';
import { commands } from './format';
import { handleImageFiles } from './images';
import { wikiCompletions } from './wikiComplete';
import { editorChrome, highlightStyle, loadTokenColors, syntaxColorsFrom } from './theme';

// Global shortcuts the editor must not swallow (history, backlinks).
const RESERVED = new Set(['Mod-[', 'Mod-]', 'Mod-Shift-l']);
const allow = (bindings: readonly KeyBinding[]) =>
  bindings.filter((b) => !b.key || !RESERVED.has(b.key));

const vimC = new Compartment();
const wrapC = new Compartment();
const highlightC = new Compartment();

let view: EditorView | null = null;
let viewPath: string | null = null;
let savedScroll = 0;
const external = Transaction.userEvent.of('external');

async function vimExtension(on: boolean): Promise<Extension> {
  if (!on) return [];
  const { vim, Vim } = await import('@replit/codemirror-vim');
  Vim.defineEx('write', 'w', () => void import('../app/save').then((m) => m.saveDocument()));
  return vim();
}

function extensions(): Extension[] {
  const s = getSettings().editor;
  return [
    vimC.of([]),
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true, icons: false, override: [wikiCompletions] }),
    highlightActiveLine(),
    highlightSelectionMatches(),
    rectangularSelection(),
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    search({ top: true }),
    keymap.of([
      { key: 'Mod-b', run: commands.bold },
      { key: 'Mod-i', run: commands.italic },
      { key: 'Mod-k', run: commands.link },
      { key: 'Mod-`', run: commands.code },
      { key: 'Tab', run: commands.tab, shift: commands.shiftTab },
      { key: 'Mod-h', run: openReplace },
      { key: 'Mod-Alt-f', run: openReplace },
      ...closeBracketsKeymap,
      ...allow(defaultKeymap),
      ...allow(searchKeymap),
      ...historyKeymap,
      ...completionKeymap,
    ]),
    wrapC.of(s.softWrap ? EditorView.lineWrapping : []),
    editorChrome,
    highlightC.of(syntaxHighlighting(highlightStyle({}))),
    placeholder('Start writing…'),
    EditorView.contentAttributes.of({
      'aria-label': 'Markdown editor',
      spellcheck: 'true',
      autocorrect: 'off',
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((tr) => tr.isUserEvent('external'))) {
        useDocument.setState({ text: u.state.doc.toString() });
      }
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        useDocument.setState({ cursor: { line: line.number, col: head - line.from + 1 } });
      }
    }),
    EditorView.domEventHandlers({
      paste: (e, v) => handleImageFiles(v, e.clipboardData?.files, e),
      drop: (e, v) =>
        handleImageFiles(
          v,
          e.dataTransfer?.files,
          e,
          v.posAtCoords({ x: e.clientX, y: e.clientY }),
        ),
    }),
  ];
}

function openReplace(v: EditorView): boolean {
  openSearchPanel(v);
  requestAnimationFrame(() =>
    v.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')?.focus(),
  );
  return true;
}

function newState(text: string): EditorState {
  return EditorState.create({ doc: text, extensions: extensions() });
}

export function getView(): EditorView | null {
  return view;
}

function ensureView(): EditorView {
  if (view) return view;
  const doc = useDocument.getState();
  view = new EditorView({ state: newState(doc.text) });
  viewPath = doc.path;
  void applyVim(getSettings().editor.vim);
  void applySyntaxColors();
  return view;
}

/** Mounts the persistent editor into a container. */
export function attach(container: HTMLElement): EditorView {
  const v = ensureView();
  syncFromStore();
  container.appendChild(v.dom);
  v.scrollDOM.scrollTop = savedScroll;
  v.requestMeasure();
  return v;
}

export function detach(): void {
  if (!view) return;
  savedScroll = view.scrollDOM.scrollTop;
  view.dom.remove();
}

/** Keeps the editor in step with the document store (open file, reload, task toggles). */
export function syncFromStore(): void {
  if (!view) return;
  const doc = useDocument.getState();
  if (doc.path !== viewPath) {
    viewPath = doc.path;
    savedScroll = 0;
    view.setState(newState(doc.text));
    void applyVim(getSettings().editor.vim);
    void applySyntaxColors();
    return;
  }
  const cur = view.state.doc.toString();
  if (cur !== doc.text) {
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: doc.text },
      annotations: [external, Transaction.addToHistory.of(true)],
    });
  }
}

async function applyVim(on: boolean) {
  const ext = await vimExtension(on);
  view?.dispatch({ effects: vimC.reconfigure(ext) });
}

let colorsSeq = 0;
async function applySyntaxColors() {
  const seq = ++colorsSeq;
  const def = findTheme(useTheme.getState().id);
  if (!def || !view) return;
  const rules = await loadTokenColors(def).catch(() => []);
  if (seq !== colorsSeq || !view) return;
  view.dispatch({
    effects: highlightC.reconfigure(syntaxHighlighting(highlightStyle(syntaxColorsFrom(rules)))),
  });
}

/** First visible source line (0-based) and the fraction scrolled through it. */
export function editorTopLine(): { line: number; frac: number } | null {
  if (!view || !view.dom.isConnected) return null;
  const top = view.scrollDOM.scrollTop;
  const block = view.lineBlockAtHeight(top);
  const line = view.state.doc.lineAt(block.from).number - 1;
  const frac = block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
  return { line, frac };
}

/** Scrolls so that (fractional, 0-based) `line` is at the top. */
export function scrollEditorToLine(line: number): void {
  if (!view) return;
  const doc = view.state.doc;
  const n = Math.min(doc.lines, Math.max(1, Math.floor(line) + 1));
  const block = view.lineBlockAt(doc.line(n).from);
  view.scrollDOM.scrollTop = block.top + (line - Math.floor(line)) * block.height;
}

export function focusEditor(): void {
  view?.focus();
}

/** Starts listening to the store and settings. Returns a disposer. */
export function bindEditor(): () => void {
  const unsubDoc = useDocument.subscribe((s, p) => {
    if (s.path !== p.path || s.text !== p.text) syncFromStore();
  });
  const unsubSettings = useSettings.subscribe((s, p) => {
    if (!view) return;
    const a = s.settings.editor;
    const b = p.settings.editor;
    if (a.vim !== b.vim) void applyVim(a.vim);
    if (a.softWrap !== b.softWrap)
      view.dispatch({ effects: wrapC.reconfigure(a.softWrap ? EditorView.lineWrapping : []) });
  });
  const unsubTheme = useTheme.subscribe((s, p) => {
    if (s.id !== p.id) void applySyntaxColors();
  });
  return () => {
    unsubDoc();
    unsubSettings();
    unsubTheme();
  };
}

/** Test/teardown hook. */
export function destroyEditor(): void {
  view?.destroy();
  view = null;
  viewPath = null;
}
