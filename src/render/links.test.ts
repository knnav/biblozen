import { classifyLink, resolveLocalSrc } from './links';

describe('classifyLink', () => {
  const doc = '/notes/guide/intro.md';
  it('handles anchors and externals', () => {
    expect(classifyLink('#Some%20Heading', doc, '/notes')).toEqual({
      kind: 'anchor',
      id: 'Some Heading',
    });
    expect(classifyLink('https://x.y/z', doc, '/notes')).toEqual({
      kind: 'external',
      url: 'https://x.y/z',
    });
    expect(classifyLink('mailto:a@b.c', doc, '/notes').kind).toBe('external');
    expect(classifyLink('javascript:alert(1)', doc, '/notes').kind).toBe('invalid');
    expect(classifyLink('file:///etc/passwd', doc, '/notes').kind).toBe('invalid');
  });
  it('resolves relative and rooted paths with anchors', () => {
    expect(classifyLink('../other.md#part-2', doc, '/notes')).toEqual({
      kind: 'file',
      path: '/notes/other.md',
      anchor: 'part-2',
      markdown: true,
    });
    expect(classifyLink('setup%20guide.md', doc, '/notes')).toMatchObject({
      path: '/notes/guide/setup guide.md',
    });
    expect(classifyLink('/docs/a.md', doc, '/notes')).toMatchObject({ path: '/notes/docs/a.md' });
    expect(classifyLink('report.pdf', doc, '/notes')).toMatchObject({ markdown: false });
  });
  it('resolves windows paths', () => {
    expect(classifyLink('sub/b.md', 'C:\\Notes\\a.md', 'C:\\Notes')).toMatchObject({
      path: 'C:\\Notes\\sub\\b.md',
    });
  });
  it('resolves image sources', () => {
    expect(resolveLocalSrc('img/a%20b.png', doc, '/notes')).toBe('/notes/guide/img/a b.png');
    expect(resolveLocalSrc('https://x/y.png', doc, '/notes')).toBeNull();
  });
});
