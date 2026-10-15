import { extract } from './extract';

describe('index extraction', () => {
  const src = [
    '---',
    'title: "# not a heading"',
    'see: [[NotALink]]',
    '---',
    '# Title',
    'Intro with [[Other Note#Part|alias]] and [md](sub/b.md#x) and [web](https://x.y).',
    '',
    '```',
    '# not heading [[nope]]',
    '```',
    '`[[inline code]]` but [[Real]]',
    '',
    'Setext',
    '======',
    '',
    '## Intro',
    '## Intro',
    '![[pic.png]] ![img](assets/a%20b.png)',
  ].join('\n');
  const r = extract(src);

  it('extracts headings with renderer-compatible slugs and lines', () => {
    expect(r.headings.map((h) => [h.level, h.text, h.slug, h.line])).toEqual([
      [1, 'Title', 'title', 4],
      [1, 'Setext', 'setext', 12],
      [2, 'Intro', 'intro', 15],
      [2, 'Intro', 'intro-1', 16],
    ]);
  });

  it('extracts wikilinks and relative markdown links, skipping code and front matter', () => {
    expect(
      r.links.map(
        (l) =>
          `${l.kind}:${l.embed ? '!' : ''}${l.target}${l.heading ? '#' + l.heading : ''}@${l.line}`,
      ),
    ).toEqual([
      'wiki:Other Note#Part@5',
      'md:sub/b.md#x@5',
      'wiki:Real@10',
      'wiki:!pic.png@17',
      'md:!assets/a b.png@17',
    ]);
    expect(r.links[0].context).toContain('Intro with');
  });

  it('handles CRLF', () => {
    expect(extract('# A\r\n[[B]]\r\n').links[0].line).toBe(1);
  });
});
