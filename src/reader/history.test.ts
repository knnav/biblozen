import { canGo, emptyHistory, go, push, recordPosition, renamePath } from './history';

describe('history', () => {
  it('goes back and forward, remembering positions', () => {
    let h = push(emptyHistory, { path: '/a.md', line: null });
    h = recordPosition(h, 40);
    h = push(h, { path: '/b.md', line: null });
    h = recordPosition(h, 7);
    h = push(h, { path: '/b.md', line: 90 }); // anchor jump in the same file
    expect(h.entries).toHaveLength(3);
    const back1 = go(h, -1)!;
    expect(back1.entry).toEqual({ path: '/b.md', line: 7 });
    const back2 = go(back1.state, -1)!;
    expect(back2.entry).toEqual({ path: '/a.md', line: 40 });
    expect(canGo(back2.state, -1)).toBe(false);
    const fwd = go(back2.state, 1)!;
    expect(fwd.entry.path).toBe('/b.md');
  });

  it('drops forward entries on a new push', () => {
    let h = push(emptyHistory, { path: '/a', line: null });
    h = push(h, { path: '/b', line: null });
    h = go(h, -1)!.state;
    h = push(h, { path: '/c', line: null });
    expect(h.entries.map((e) => e.path)).toEqual(['/a', '/c']);
    expect(canGo(h, 1)).toBe(false);
  });

  it('ignores duplicate pushes and follows renames', () => {
    let h = push(emptyHistory, { path: '/a', line: null });
    h = push(h, { path: '/A', line: null });
    expect(h.entries).toHaveLength(1);
    h = renamePath(h, '/a', '/z');
    expect(h.entries[0].path).toBe('/z');
  });
});
