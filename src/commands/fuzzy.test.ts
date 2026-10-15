import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches subsequences and rejects non-matches', () => {
    expect(fuzzyMatch('tgt', 'Toggle Tree')).not.toBeNull();
    expect(fuzzyMatch('xyz', 'Toggle Tree')).toBeNull();
  });

  it('prefers contiguous and word-start matches', () => {
    const r = fuzzyFilter(['Show Layout', 'Toggle Outline', 'About'], 'out', (s) => s);
    expect(r[0].item).toBe('Toggle Outline');
    const files = fuzzyFilter(
      ['docs/guide/readme.md', 'readme.md', 'src/reader/rmd.ts'],
      'readme',
      (s) => s,
    );
    expect(files[0].item).toBe('readme.md');
  });

  it('returns indices for highlighting', () => {
    expect(fuzzyMatch('tt', 'Toggle Tree')!.indices).toEqual([0, 7]);
  });

  it('keeps original order for an empty query', () => {
    expect(fuzzyFilter(['b', 'a'], '', (s) => s).map((r) => r.item)).toEqual(['b', 'a']);
  });
});
