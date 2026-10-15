import type { MarkdownIt } from 'markdown-it';
import type { Token } from 'markdown-it';
import { Slugger } from '../slug';

export interface HeadingInfo {
  level: number;
  text: string;
  slug: string;
  line: number;
}

/** Inline text of a heading, ignoring markup. */
export function inlineText(t: Token): string {
  return (t.children ?? [])
    .map((c) =>
      c.type === 'text' || c.type === 'code_inline' ? c.content : c.type === 'softbreak' ? ' ' : '',
    )
    .join('');
}

/** GitHub-style ids on headings plus a hover link icon; records headings in env. */
export function headingAnchorsPlugin(md: MarkdownIt): void {
  md.core.ruler.push('heading_anchors', (state) => {
    const env = state.env as { headings?: HeadingInfo[]; lineOffset?: number };
    const slugger = new Slugger();
    const headings: HeadingInfo[] = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      const text = inlineText(inline);
      const slug = slugger.slug(text);
      t.attrSet('id', slug);
      headings.push({
        level: Number(t.tag.slice(1)),
        text,
        slug,
        line: (t.map?.[0] ?? 0) + (env.lineOffset ?? 0),
      });
      // Anchor link appended inside the heading.
      // Our own trusted markup uses `bz_html` so it isn't treated as raw user HTML.
      const open = new state.Token('bz_html', '', 0);
      open.content = `<a class="heading-anchor" href="#${slug}" aria-label="Link to this section" tabindex="-1"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.78 4.22a.75.75 0 0 1 0 1.06L6.06 7h0a2.25 2.25 0 0 0 3.18 3.18l1.5-1.5a.75.75 0 1 1 1.06 1.06l-1.5 1.5A3.75 3.75 0 0 1 5 5.94l1.72-1.72a.75.75 0 0 1 1.06 0Zm.44 7.56a.75.75 0 0 1 0-1.06L9.94 9a2.25 2.25 0 0 0-3.18-3.18l-1.5 1.5a.75.75 0 0 1-1.06-1.06l1.5-1.5A3.75 3.75 0 0 1 11 10.06l-1.72 1.72a.75.75 0 0 1-1.06 0Z"/></svg></a>`;
      inline.children = [...(inline.children ?? []), open];
    }
    env.headings = headings;
  });
  md.renderer.rules.bz_html ??= (tokens, idx) => tokens[idx].content;
}
