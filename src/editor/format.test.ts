import { EditorSelection, EditorState } from '@codemirror/state';
import { linkSpec, toggleWrapSpec } from './format';

function run(
  doc: string,
  from: number,
  to: number,
  f: (s: EditorState) => ReturnType<typeof linkSpec>,
) {
  const s = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  const t = s.update(f(s)).state;
  const r = t.selection.main;
  return { doc: t.doc.toString(), sel: t.sliceDoc(r.from, r.to), from: r.from };
}

describe('formatting', () => {
  it('wraps and unwraps bold', () => {
    const a = run('hello world', 6, 11, (s) => toggleWrapSpec(s, '**'));
    expect(a.doc).toBe('hello **world**');
    expect(a.sel).toBe('world');
    const s2 = EditorState.create({ doc: a.doc, selection: EditorSelection.single(8, 13) });
    expect(s2.update(toggleWrapSpec(s2, '**')).state.doc.toString()).toBe('hello world');
  });

  it('inserts empty markers with the cursor inside', () => {
    const a = run('x ', 2, 2, (s) => toggleWrapSpec(s, '`'));
    expect(a.doc).toBe('x ``');
    expect(a.from).toBe(3);
  });

  it('unwraps when markers are selected too', () => {
    expect(run('*it*', 0, 4, (s) => toggleWrapSpec(s, '*')).doc).toBe('it');
  });

  it('makes links, selecting the url placeholder', () => {
    const a = run('see docs', 4, 8, linkSpec);
    expect(a.doc).toBe('see [docs](url)');
    expect(a.sel).toBe('url');
    const b = run('https://x.y', 0, 11, linkSpec);
    expect(b.doc).toBe('[](https://x.y)');
    expect(b.from).toBe(1);
  });
});
