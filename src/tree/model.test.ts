import type { TreeNode } from '../platform/types';
import {
  filterRows,
  filterTree,
  flattenVisible,
  naturalCompare,
  sortNodes,
  uniqueName,
  validateName,
  withMarkdownExt,
} from './model';

const f = (path: string): TreeNode => ({ name: path.split('/').pop()!, path, kind: 'file' });
const d = (path: string, children: TreeNode[]): TreeNode => ({
  name: path.split('/').pop()!,
  path,
  kind: 'dir',
  children,
});

const tree = d('/r', [
  f('/r/file10.md'),
  f('/r/file2.md'),
  d('/r/assets', [f('/r/assets/pic.png')]),
  d('/r/notes', [f('/r/notes/b.md'), f('/r/notes/A.md')]),
  d('/r/empty', []),
  f('/r/photo.jpg'),
]);

describe('tree model', () => {
  it('sorts folders first, naturally', () => {
    expect(naturalCompare('file2', 'file10')).toBeLessThan(0);
    const s = sortNodes(tree.children!);
    expect(s.map((n) => n.name)).toEqual([
      'assets',
      'empty',
      'notes',
      'file2.md',
      'file10.md',
      'photo.jpg',
    ]);
    expect(s[2].children!.map((n) => n.name)).toEqual(['A.md', 'b.md']);
  });

  it('markdown-only hides other files and folders without markdown, keeps empty folders', () => {
    const t = filterTree(tree, true);
    expect(t.children!.map((n) => n.name).sort()).toEqual([
      'empty',
      'file10.md',
      'file2.md',
      'notes',
    ]);
    expect(filterTree(tree, false)).toBe(tree);
  });

  it('flattens only expanded folders', () => {
    const rows = flattenVisible(
      sortNodes(tree.children!).length ? { ...tree, children: sortNodes(tree.children!) } : tree,
      new Set(['/r/notes']),
    );
    expect(rows.map((r) => `${r.depth}:${r.node.name}`)).toEqual([
      '0:assets',
      '0:empty',
      '0:notes',
      '1:A.md',
      '1:b.md',
      '0:file2.md',
      '0:file10.md',
      '0:photo.jpg',
    ]);
  });

  it('type-to-filter shows matches with ancestors', () => {
    const rows = filterRows(tree, 'pic');
    expect(rows.map((r) => r.node.name)).toEqual(['assets', 'pic.png']);
    expect(filterRows(tree, 'zzz')).toEqual([]);
  });

  it('generates unique names and validates them', () => {
    expect(uniqueName(['Untitled.md', 'untitled 2.md'], 'Untitled', '.md')).toBe('Untitled 3.md');
    expect(validateName('a/b')).not.toBeNull();
    expect(validateName('CON')).not.toBeNull();
    expect(validateName('ok name.md')).toBeNull();
    expect(validateName('trailing.')).not.toBeNull();
    expect(withMarkdownExt('note')).toBe('note.md');
    expect(withMarkdownExt('pic.png')).toBe('pic.png');
  });
});
