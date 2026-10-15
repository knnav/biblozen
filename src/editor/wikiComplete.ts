// `[[` autocompletion (SPEC §7.5): notes from the index (fuzzy), then headings after `#`.

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { queryHeadings } from '../index/client';
import { resolveWikilinkRef, useIndex } from '../index/store';
import { isImage, isMarkdown } from '../platform/path';
import { useDocument } from '../app/document';

/** Inserts the text and closes the link, reusing a `]]` that closeBrackets already added. */
function applyLink(text: string) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const after = view.state.sliceDoc(to, to + 2);
    const insert = after === ']]' ? text : `${text}]]`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + text.length + 2 },
      userEvent: 'input.complete',
    });
  };
}

export async function wikiCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
  const m = ctx.matchBefore(/(!?)\[\[([^[\]\n|]*)$/);
  if (!m) return null;
  const embed = m.text.startsWith('!');
  const inner = m.text.slice(embed ? 3 : 2);
  const innerFrom = m.from + (embed ? 3 : 2);
  const hash = inner.indexOf('#');

  if (hash === -1) {
    const refs = useIndex.getState().refs;
    // Names, disambiguated with their folder when two notes share one.
    const counts = new Map<string, number>();
    const nameOf = (rel: string) =>
      rel.slice(rel.lastIndexOf('/') + 1).replace(/\.(md|markdown|mdown|mkd|mdx)$/i, '');
    for (const r of refs) counts.set(nameOf(r.rel), (counts.get(nameOf(r.rel)) ?? 0) + 1);
    const options: Completion[] = [];
    for (const r of refs) {
      const md = isMarkdown(r.path);
      if (!md && !(embed && isImage(r.path))) continue;
      const display = r.path.slice(r.path.length - r.rel.length);
      const name = nameOf(display);
      const unique = (counts.get(name.toLowerCase()) ?? counts.get(name) ?? 1) <= 1;
      const label = md
        ? unique
          ? name
          : display.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, '')
        : display.slice(display.lastIndexOf('/') + 1);
      const dir = display.includes('/') ? display.slice(0, display.lastIndexOf('/')) : '';
      options.push({
        label,
        detail: dir,
        type: md ? 'text' : 'variable',
        apply: applyLink(label),
        boost: md ? 1 : 0,
      });
    }
    return { from: innerFrom, options, validFor: /^[^[\]\n|#]*$/ };
  }

  const target = inner.slice(0, hash);
  const resolved = resolveWikilinkRef(target, useDocument.getState().path).path;
  if (!resolved) return null;
  const headings = await queryHeadings(resolved);
  return {
    from: innerFrom + hash + 1,
    options: headings.map((h) => ({
      label: h.text,
      detail: `H${h.level}`,
      type: 'keyword',
      apply: applyLink(h.text),
    })),
    validFor: /^[^[\]\n|]*$/,
  };
}
