import { diffLines } from './diff';

describe('diffLines', () => {
  it('finds additions, deletions and common lines', () => {
    const ops = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne')!;
    expect(ops.map((o) => `${o.kind[0]}${o.text}`)).toEqual(['sa', 'db', 'aB', 'sc', 'sd', 'ae']);
  });
  it('handles identical and empty inputs', () => {
    expect(diffLines('x', 'x')!.every((o) => o.kind === 'same')).toBe(true);
    expect(diffLines('', 'a')!.map((o) => o.kind)).toEqual(['del', 'add']);
  });
});
