import { makeFileRef, resolveWikiTarget } from './resolve';

const root = '/vault';
const files = [
  '/vault/Note.md',
  '/vault/projects/note.md',
  '/vault/projects/alpha/Plan.md',
  '/vault/archive/2023/plan.md',
  '/vault/assets/diagram.png',
  '/vault/v1.2 release.md',
  '/vault/deep/a/b/Readme.md',
].map((p) => makeFileRef(root, p));

describe('resolveWikiTarget', () => {
  it('matches by filename with or without .md, case-insensitive', () => {
    expect(resolveWikiTarget('note', files)).toBe('/vault/Note.md');
    expect(resolveWikiTarget('NOTE.md', files)).toBe('/vault/Note.md');
    expect(resolveWikiTarget('readme', files)).toBe('/vault/deep/a/b/Readme.md');
  });

  it('shortest path wins on ambiguity', () => {
    // Both have 3 segments; the shorter path string wins.
    expect(resolveWikiTarget('plan', files)).toBe('/vault/archive/2023/plan.md');
    expect(resolveWikiTarget('readme', [...files, makeFileRef(root, '/vault/x/README.md')])).toBe(
      '/vault/x/README.md',
    );
  });

  it('path-qualified links match by suffix', () => {
    expect(resolveWikiTarget('projects/note', files)).toBe('/vault/projects/note.md');
    expect(resolveWikiTarget('2023/plan', files)).toBe('/vault/archive/2023/plan.md');
    expect(resolveWikiTarget('b/readme', files)).toBe('/vault/deep/a/b/Readme.md');
    expect(resolveWikiTarget('jects/note', files)).toBeNull();
  });

  it('resolves non-markdown files by exact name', () => {
    expect(resolveWikiTarget('diagram.png', files)).toBe('/vault/assets/diagram.png');
    expect(resolveWikiTarget('diagram', files)).toBeNull();
  });

  it('handles dots in note names', () => {
    expect(resolveWikiTarget('v1.2 release', files)).toBe('/vault/v1.2 release.md');
  });

  it('returns null for unknown targets', () => {
    expect(resolveWikiTarget('missing', files)).toBeNull();
    expect(resolveWikiTarget('', files)).toBeNull();
  });
});
