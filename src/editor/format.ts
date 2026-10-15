// Markdown formatting commands for CodeMirror.

import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';

/** Wraps/unwraps each selection with `marker` (e.g. `**`, `*`, `` ` ``). */
export function toggleWrapSpec(state: EditorState, marker: string): TransactionSpec {
  const m = marker.length;
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(range.from - m, range.from);
    const after = state.sliceDoc(range.to, range.to + m);
    const inner = state.sliceDoc(range.from, range.to);
    // Already wrapped just outside the selection → unwrap.
    if (before === marker && after === marker) {
      const changes: ChangeSpec[] = [
        { from: range.from - m, to: range.from, insert: '' },
        { from: range.to, to: range.to + m, insert: '' },
      ];
      return { changes, range: EditorSelection.range(range.from - m, range.to - m) };
    }
    // Selection includes the markers → unwrap.
    if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
      return {
        changes: { from: range.from, to: range.to, insert: inner.slice(m, -m) },
        range: EditorSelection.range(range.from, range.to - 2 * m),
      };
    }
    return {
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      ],
      range: EditorSelection.range(range.from + m, range.to + m),
    };
  });
  return { ...tr, userEvent: 'input.format', scrollIntoView: true };
}

/** `[selection](url)` with "url" selected; reuses a URL-looking selection as the target. */
export function linkSpec(state: EditorState): TransactionSpec {
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (/^(https?:\/\/|mailto:)\S+$/.test(text)) {
      const insert = `[](${text})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const insert = `[${text}](url)`;
    const urlFrom = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlFrom, urlFrom + 3),
    };
  });
  return { ...tr, userEvent: 'input.format', scrollIntoView: true };
}

export const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?(?:\s|$)/;

function inList(state: EditorState): boolean {
  return state.selection.ranges.every((r) => LIST_LINE.test(state.doc.lineAt(r.head).text));
}

export const commands = {
  bold: (v: EditorView) => (v.dispatch(toggleWrapSpec(v.state, '**')), true),
  italic: (v: EditorView) => (v.dispatch(toggleWrapSpec(v.state, '*')), true),
  code: (v: EditorView) => (v.dispatch(toggleWrapSpec(v.state, '`')), true),
  link: (v: EditorView) => (v.dispatch(linkSpec(v.state)), true),
  /** Tab: indent list items, otherwise insert a tab. */
  tab: (v: EditorView) => (inList(v.state) ? indentMore(v) : insertTab(v)),
  shiftTab: (v: EditorView) => indentLess(v),
};
