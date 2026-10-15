import {
  basename,
  dirname,
  extname,
  isInside,
  join,
  normalize,
  relative,
  samePath,
  stem,
} from './path';

describe('path helpers', () => {
  it('handles posix paths', () => {
    expect(basename('/a/b/c.md')).toBe('c.md');
    expect(dirname('/a/b/c.md')).toBe('/a/b');
    expect(dirname('/a')).toBe('/');
    expect(extname('/a/b/c.test.md')).toBe('.md');
    expect(stem('/a/b/c.test.md')).toBe('c.test');
    expect(extname('/a/.hidden')).toBe('');
    expect(join('/a/b', '../c', 'd.md')).toBe('/a/c/d.md');
    expect(join('/', 'x')).toBe('/x');
  });

  it('handles windows paths', () => {
    expect(basename('C:\\Notes\\a.md')).toBe('a.md');
    expect(dirname('C:\\Notes\\a.md')).toBe('C:\\Notes');
    expect(dirname('C:\\a.md')).toBe('C:\\');
    expect(join('C:\\Notes', 'sub/x.md')).toBe('C:\\Notes\\sub\\x.md');
    expect(normalize('C:\\Notes\\..\\..\\x')).toBe('C:\\x');
  });

  it('compares and nests case-insensitively', () => {
    expect(samePath('C:\\Notes\\', 'c:/notes')).toBe(true);
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a/b')).toBe(false);
    expect(isInside('/a/b', '/a/b', true)).toBe(true);
    expect(isInside('/A/B', '/a/b/c')).toBe(true);
    expect(isInside('/A/B', '/a/b/c', false, false)).toBe(false);
  });

  it('computes relative paths', () => {
    expect(relative('/a/b', '/a/b/c/d.md')).toBe('c/d.md');
    expect(relative('/a/b', '/a/x.md')).toBe('../x.md');
    expect(relative('C:\\a', 'C:\\a\\img\\p.png')).toBe('img/p.png');
  });
});
