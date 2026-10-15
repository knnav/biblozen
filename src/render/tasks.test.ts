import { toggleTaskAt } from './tasks';

describe('toggleTaskAt', () => {
  const doc =
    '# T\n\n- [ ] one\n- [x] two\n  1. [X] nested\n* [ ]  spaced\n> - [ ] quoted\nplain [ ] text';
  it('toggles unchecked → checked and back', () => {
    const a = toggleTaskAt(doc, 2)!;
    expect(a.split('\n')[2]).toBe('- [x] one');
    expect(toggleTaskAt(a, 2)!.split('\n')[2]).toBe('- [ ] one');
  });
  it('handles ordered, nested, uppercase, quoted', () => {
    expect(toggleTaskAt(doc, 3)!.split('\n')[3]).toBe('- [ ] two');
    expect(toggleTaskAt(doc, 4)!.split('\n')[4]).toBe('  1. [ ] nested');
    expect(toggleTaskAt(doc, 5)!.split('\n')[5]).toBe('* [x]  spaced');
    expect(toggleTaskAt(doc, 6)!.split('\n')[6]).toBe('> - [x] quoted');
  });
  it('leaves everything else untouched', () => {
    expect(toggleTaskAt(doc, 7)).toBeNull();
    expect(toggleTaskAt(doc, 99)).toBeNull();
    const out = toggleTaskAt(doc, 2)!.split('\n');
    const orig = doc.split('\n');
    out.forEach((l, i) => i !== 2 && expect(l).toBe(orig[i]));
  });
});
