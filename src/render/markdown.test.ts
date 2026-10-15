import { renderMarkdown } from './markdown';

function dom(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

describe('renderMarkdown', () => {
  it('maps every block to its source line', () => {
    const src =
      '# Title\n\nPara one\nstill one\n\n- a\n- b\n\n> quote\n\n```js\nx\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const d = dom(renderMarkdown(src).html);
    expect(d.querySelector('h1')!.dataset.line).toBe('0');
    expect(d.querySelector('p')!.dataset.line).toBe('2');
    expect([...d.querySelectorAll('li')].map((l) => l.dataset.line)).toEqual(['5', '6']);
    expect(d.querySelector('blockquote')!.dataset.line).toBe('8');
    expect((d.querySelector('.code-block') as HTMLElement).dataset.line).toBe('10');
    expect((d.querySelector('.table-wrap') as HTMLElement).dataset.line).toBe('14');
  });

  it('keeps source lines correct after front matter', () => {
    const r = renderMarkdown('---\ntitle: Hi\ntags: [a, b]\n---\n\n# After\n');
    const d = dom(r.html);
    expect(d.querySelector('h1')!.dataset.line).toBe('5');
    expect(d.querySelector('details.front-matter summary')!.textContent).toContain('Hi');
    expect(d.querySelectorAll('.fm-tag')).toHaveLength(2);
    expect(r.frontMatter!.data).toEqual({ title: 'Hi', tags: ['a', 'b'] });
  });

  it('renders GitHub-style heading anchors with unique slugs', () => {
    const r = renderMarkdown('# Intro\n## Intro\n### Hello, World!');
    expect(r.headings.map((h) => h.slug)).toEqual(['intro', 'intro-1', 'hello-world']);
    expect(dom(r.html).querySelector('h3 a.heading-anchor')!.getAttribute('href')).toBe(
      '#hello-world',
    );
  });

  it('renders GFM: tables, strikethrough, autolinks, task lists, footnotes', () => {
    const d = dom(
      renderMarkdown(
        '~~gone~~ https://example.com\n\n- [ ] todo\n- [x] done\n\nText[^1]\n\n[^1]: Note.',
      ).html,
    );
    expect(d.querySelector('s')!.textContent).toBe('gone');
    expect(d.querySelector('a[href="https://example.com"]')).not.toBeNull();
    const boxes = d.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[1].dataset.taskLine).toBe('3');
    expect(d.querySelector('ul')!.className).toContain('contains-task-list');
    expect(d.querySelector('.footnotes')).not.toBeNull();
  });

  it('renders all five GitHub alerts', () => {
    const kinds = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
    const src = kinds.map((k) => `> [!${k}]\n> Body ${k}`).join('\n\n');
    const d = dom(renderMarkdown(src).html);
    const alerts = d.querySelectorAll('.markdown-alert');
    expect(alerts).toHaveLength(5);
    expect(alerts[3].className).toContain('markdown-alert-warning');
    expect(alerts[3].querySelector('.markdown-alert-title')!.textContent).toBe('Warning');
    expect(alerts[3].textContent).toContain('Body WARNING');
    expect(d.querySelector('blockquote')).toBeNull();
  });

  it('parses math but not prices', () => {
    const d = dom(
      renderMarkdown('Inline $E=mc^2$ but $5 and $6.\n\n$$\n\\int_0^1 x\\,dx\n$$').html,
    );
    expect(d.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(d.querySelector<HTMLElement>('.math-inline')!.textContent).toBe('E=mc^2');
    expect(d.querySelector<HTMLElement>('.math-block')!.textContent).toBe('\\int_0^1 x\\,dx');
  });

  it('renders wikilinks and embeds', () => {
    const r = renderMarkdown('See [[Other Note#Part|that]] and [[plain]] ![[pic.png]]');
    const d = dom(r.html);
    const links = d.querySelectorAll<HTMLAnchorElement>('a.wikilink');
    expect([...links].map((a) => a.dataset.wikilink)).toEqual(['Other Note#Part', 'plain']);
    expect(links[0].textContent).toBe('that');
    expect(d.querySelector<HTMLImageElement>('img.wikilink-embed')!.dataset.wikilink).toBe(
      'pic.png',
    );
    expect(r.wikilinks.map((w) => w.target)).toEqual(['Other Note', 'plain', 'pic.png']);
  });

  it('renders mermaid and code placeholders', () => {
    const d = dom(
      renderMarkdown('```mermaid\ngraph TD; A-->B\n```\n\n```ts\nconst a = 1;\n```').html,
    );
    expect(d.querySelector<HTMLElement>('.mermaid-block')!.textContent).toContain('A-->B');
    expect(d.querySelector<HTMLElement>('pre.shiki-pending')!.dataset.lang).toBe('ts');
    expect(d.querySelector('.code-block__lang')!.textContent).toBe('ts');
  });

  it('defers images to data-src', () => {
    const d = dom(renderMarkdown('![alt](img/a.png "T") <img src="b.png">').html);
    const imgs = d.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBeNull();
    expect(imgs[0].dataset.src).toBe('img/a.png');
    expect(imgs[1].dataset.src).toBe('b.png');
  });
});

describe('raw HTML grouping', () => {
  it('keeps markdown inside raw <details> blocks', () => {
    const d = dom(
      renderMarkdown(
        '<details>\n<summary>More</summary>\n\nBody **bold**\n\n- item\n\n</details>\n\nAfter',
      ).html,
    );
    const det = d.querySelector('details')!;
    expect(det.querySelector('summary')!.textContent).toBe('More');
    expect(det.querySelector('strong')!.textContent).toBe('bold');
    expect(det.querySelector('li')).not.toBeNull();
    expect(det.contains(d.querySelector('p:last-child'))).toBe(false);
  });

  it('sanitizes raw HTML that spans blocks', () => {
    const d = dom(
      renderMarkdown('<div onclick="x()">\n\n*md*\n\n</div>\n\n<img src=x onerror=alert(1)>').html,
    );
    expect(d.querySelector('[onclick]')).toBeNull();
    expect(d.querySelector('[onerror]')).toBeNull();
    expect(d.querySelector('div em')!.textContent).toBe('md');
  });
});

describe('sanitization (malicious fixture)', () => {
  const evil = [
    '<script>window.__pwned = 1</script>',
    '<img src="x" onerror="window.__pwned = 2">',
    '<a href="javascript:alert(1)">click</a>',
    '[md link](javascript:alert(1))',
    '<iframe src="https://evil.example"></iframe>',
    '<div onclick="alert(1)" style="position:fixed">x</div>',
    '<svg><script>alert(1)</script></svg>',
    '<form action="https://evil.example"><input name=a></form>',
    '<a href="data:text/html,<script>alert(1)</script>">data</a>',
    '<object data="x.swf"></object><embed src="x.swf">',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<base href="https://evil.example/">',
  ].join('\n\n');

  it('neutralizes scripts, handlers, javascript: and data: URLs, frames', () => {
    const html = renderMarkdown(evil).html;
    const d = dom(html);
    expect(d.querySelector('script, iframe, object, embed, form, meta, base')).toBeNull();
    for (const el of d.querySelectorAll('*')) {
      for (const a of el.attributes) {
        expect(a.name.startsWith('on')).toBe(false);
        expect(a.value.toLowerCase()).not.toContain('javascript:');
      }
      expect(el.getAttribute('style')).toBeNull();
    }
    expect(d.querySelector('a[href^="data:"]')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
