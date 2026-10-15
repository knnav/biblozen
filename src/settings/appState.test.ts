import { createFakePlatform } from '../platform/fake';
import { FakeFs } from '../platform/fakefs';
import {
  FILE_LRU_CAP,
  applyState,
  bindAppState,
  emptyState,
  flushAppState,
  getAppState,
  parseState,
  patchFile,
  patchFolder,
  patchRecentFolder,
} from './appState';

describe('app state patches', () => {
  it('caps the per-file LRU, dropping the oldest', () => {
    let s = emptyState;
    for (let i = 0; i < FILE_LRU_CAP + 5; i++) s = patchFile(`/f${i}.md`, i, i)(s);
    expect(Object.keys(s.files)).toHaveLength(FILE_LRU_CAP);
    expect(s.files['/f0.md']).toBeUndefined();
    expect(s.files[`/f${FILE_LRU_CAP + 4}.md`].line).toBe(FILE_LRU_CAP + 4);
  });

  it('dedupes recent folders, newest first', () => {
    let s = patchRecentFolder('/a')(emptyState);
    s = patchRecentFolder('/b')(s);
    s = patchRecentFolder('/a')(s);
    expect(s.recentFolders).toEqual(['/a', '/b']);
  });

  it('tolerates garbage', () => {
    expect(parseState('nope')).toEqual(emptyState);
    expect(parseState('{"folders":3}').folders).toEqual({});
  });
});

describe('app state persistence', () => {
  it('merges this window’s changes over another window’s writes', async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    await bindAppState(p);
    applyState(patchFolder('/notes', { treeWidth: 300 }));
    // Another window wrote in the meantime.
    fs.write(
      '/data/state.json',
      JSON.stringify({ ...emptyState, folders: { '/other': { treeWidth: 200 } } }),
    );
    await flushAppState();
    const saved = JSON.parse(fs.read('/data/state.json'));
    expect(saved.folders['/notes'].treeWidth).toBe(300);
    expect(saved.folders['/other'].treeWidth).toBe(200);
    expect(getAppState().folders['/notes'].treeWidth).toBe(300);
  });
});
