import { IndexCore } from './core';
import { createResolver, makeFileRef, resolveWikiTarget } from './resolve';

describe('IndexCore', () => {
  it('computes backlinks from wikilinks and relative links, and updates incrementally', () => {
    const ix = new IndexCore();
    ix.setFiles('/v', ['/v/a.md', '/v/b.md', '/v/sub/c.md', '/v/pic.png']);
    ix.upsert('/v/a.md', '# A\nSee [[b]] and [c](sub/c.md).\n![[pic.png]]');
    ix.upsert('/v/b.md', '# B\nBack to [[A]].');
    ix.upsert('/v/sub/c.md', 'Up: [a](../a.md) and [[b#B|bee]] and [[missing]]');
    expect(ix.backlinksTo('/v/b.md').map((b) => `${b.source}:${b.line}`)).toEqual([
      '/v/a.md:1',
      '/v/sub/c.md:0',
    ]);
    expect(ix.backlinksTo('/v/a.md').map((b) => b.source)).toEqual(['/v/b.md', '/v/sub/c.md']);
    expect(ix.backlinksTo('/v/sub/c.md')[0].context).toBe('See [[b]] and [c](sub/c.md).');
    // Another file adds a link → backlinks update.
    ix.upsert('/v/b.md', '# B\nBack to [[A]]. Also [[sub/c]].');
    expect(ix.backlinksTo('/v/sub/c.md').map((b) => b.source)).toEqual(['/v/a.md', '/v/b.md']);
    ix.remove(['/v/a.md']);
    expect(ix.backlinksTo('/v/b.md').map((b) => b.source)).toEqual(['/v/sub/c.md']);
    expect(ix.headings('/v/b.md')[0].slug).toBe('b');
  });

  it('fast resolver agrees with the reference resolver', () => {
    const paths = [
      '/r/Note.md',
      '/r/x/note.md',
      '/r/a/b/Plan.md',
      '/r/plan.md',
      '/r/img/p.png',
      '/r/v1.2 x.md',
    ];
    const refs = paths.map((p) => makeFileRef('/r', p));
    const fast = createResolver(refs);
    for (const t of [
      'note',
      'x/note',
      'PLAN',
      'b/plan',
      'p.png',
      'p',
      'v1.2 x',
      'missing',
      'Note.md',
    ]) {
      expect([t, fast(t)]).toEqual([t, resolveWikiTarget(t, refs)]);
    }
  });

  it('indexes 2,000 files quickly', () => {
    const ix = new IndexCore();
    const paths = Array.from({ length: 2000 }, (_, i) => `/big/area-${i % 20}/note-${i}.md`);
    ix.setFiles('/big', paths);
    const t0 = performance.now();
    paths.forEach((p, i) =>
      ix.upsert(
        p,
        `# Note ${i}\n\nText [[note-${(i * 7) % 2000}]] [[note-${(i * 13) % 2000}]] and [[area-1/note-${i % 100}]].`,
      ),
    );
    ix.backlinksTo('/big/area-1/note-1.md');
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(ix.backlinksTo(paths[7]).length).toBeGreaterThan(0);
  });
});
