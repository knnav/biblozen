import { exportTitle, replaceSrc, toBase64 } from './html';

describe('html export helpers', () => {
  it('replaces font sources even when they contain data URLs', () => {
    const css =
      '@font-face { font-family: "K"; src: url("data:font/woff2;base64,AAA;B") format("woff2"), url("/k.woff") format("woff"); font-weight: 400; }';
    const out = replaceSrc(css, 'url(data:font/woff2;base64,ZZZ) format("woff2")');
    expect(out).toBe(
      '@font-face { font-family: "K"; src: url(data:font/woff2;base64,ZZZ) format("woff2"); font-weight: 400; }',
    );
    expect(replaceSrc('@font-face { src: url(a.woff2) }', 'X')).toBe('@font-face { src: X}');
  });
  it('base64-encodes large buffers', () => {
    const b = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(atob(toBase64(b)).length).toBe(100_000);
  });
  it('picks a title from front matter, the first heading, or the file name', () => {
    expect(exportTitle('---\ntitle: "Hello"\n---\n# X', '/a/b.md')).toBe('Hello');
    expect(exportTitle('intro\n# The *Title*\n', '/a/b.md')).toBe('The Title');
    expect(exportTitle('no headings', '/a/notes.md')).toBe('notes');
  });
});
