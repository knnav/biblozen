// Markdown → HTML. Synchronous and fast; expensive pieces (Shiki, KaTeX, Mermaid,
// images) render as placeholders that postprocess.ts fills in lazily.

import createMarkdownIt, { type MarkdownIt } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { alertsPlugin } from './plugins/alerts';
import { frontMatterPlugin, type FrontMatterEnv } from './plugins/frontMatter';
import { headingAnchorsPlugin, type HeadingInfo } from './plugins/headingAnchors';
import { mathPlugin } from './plugins/math';
import { sourceMapPlugin } from './plugins/sourceMap';
import { taskListsPlugin } from './plugins/taskLists';
import { wikilinksPlugin, type WikilinkEnv } from './plugins/wikilinks';
import { sanitize } from './sanitize';

export interface RenderResult {
  html: string;
  headings: HeadingInfo[];
  frontMatter: FrontMatterEnv['frontMatter'] | null;
  wikilinks: NonNullable<WikilinkEnv['wikilinks']>;
}

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';

function createMarkdown(): MarkdownIt {
  const md = createMarkdownIt({ html: true, linkify: true, typographer: false, breaks: false });
  md.use(frontMatterPlugin);
  md.use(footnote);
  md.use(mathPlugin);
  md.use(wikilinksPlugin);
  md.use(alertsPlugin);
  md.use(taskListsPlugin);
  md.use(headingAnchorsPlugin);
  md.use(sourceMapPlugin);

  const esc = md.utils.escapeHtml;

  md.renderer.rules.fence = (tokens, idx, _opts, _env, self) => {
    const t = tokens[idx];
    const info = t.info.trim();
    const lang = (info.split(/\s+/)[0] || '').toLowerCase();
    const attrs = self.renderAttrs(t);
    if (lang === 'mermaid') {
      // Source lives in text content: DOMPurify drops attributes containing "-->".
      return `<div class="mermaid-block"${attrs}><pre class="mermaid-source"><code>${esc(t.content)}</code></pre></div>\n`;
    }
    if (lang === 'math' || lang === 'latex' || lang === 'katex') {
      return `<div class="math math-block"${attrs}>${esc(t.content.trim())}</div>\n`;
    }
    const code = t.content.endsWith('\n') ? t.content.slice(0, -1) : t.content;
    return (
      `<div class="code-block"${attrs}>` +
      `<div class="code-block__bar"><span class="code-block__lang">${esc(lang || 'text')}</span>` +
      `<button class="code-block__copy" type="button" data-copy aria-label="Copy code">${COPY_ICON}<span>Copy</span></button></div>` +
      `<pre class="shiki-pending" data-lang="${esc(lang)}"><code>${esc(code)}</code></pre></div>\n`
    );
  };

  md.renderer.rules.code_block = (tokens, idx, _o, _e, self) => {
    const t = tokens[idx];
    return `<div class="code-block code-block--indented"${self.renderAttrs(t)}><pre><code>${esc(t.content.replace(/\n$/, ''))}</code></pre></div>\n`;
  };

  // Images resolve later (local paths → asset URLs, remote images may be blocked).
  md.renderer.rules.image = (tokens, idx, _o, env, self) => {
    const t = tokens[idx];
    const src = String(t.attrGet('src') ?? '');
    const title = t.attrGet('title') === null ? null : String(t.attrGet('title'));
    const alt = self.renderInlineAsText(t.children ?? [], _o, env);
    return `<img data-src="${esc(src)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy">`;
  };

  // Tables scroll horizontally on narrow widths.
  md.renderer.rules.table_open = (tokens, idx, _o, _e, self) =>
    `<div class="table-wrap"${tokens[idx].attrGet('data-line') !== null ? ` data-line="${String(tokens[idx].attrGet('data-line'))}"` : ''}><table${self.renderAttrs(tokens[idx])}>\n`;
  md.renderer.rules.table_close = () => '</table></div>\n';

  return md;
}

let instance: MarkdownIt | null = null;

export function getMarkdown(): MarkdownIt {
  return (instance ??= createMarkdown());
}

type Tok = ReturnType<MarkdownIt['parse']>[number];

/** Documents with more top-level blocks than this render in content-visibility chunks. */
const CHUNK_THRESHOLD = 400;
const CHUNK_BLOCKS = 60;

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** Net open-tag count of a raw HTML snippet (rough, for grouping only). */
export function tagBalance(html: string): number {
  let n = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (VOID.has(name) || m[3] === '/') continue;
    n += m[1] ? -1 : 1;
  }
  return n;
}

function rawHtmlIn(tokens: Tok[]): string | null {
  let raw: string | null = null;
  for (const t of tokens) {
    if (t.type === 'html_block') raw = (raw ?? '') + t.content;
    else if (t.type === 'inline' && t.children) {
      for (const c of t.children) if (c.type === 'html_inline') raw = (raw ?? '') + c.content;
    }
  }
  return raw;
}

/** Splits the token stream into top-level blocks. */
function topLevelRanges(tokens: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  for (const t of tokens) {
    cur.push(t);
    if (t.level === 0 && t.nesting <= 0) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Renders markdown to safe HTML. markdown-it escapes everything except raw HTML
 * tokens, so DOMPurify runs only on the top-level blocks that contain raw HTML
 * (merged across blocks when tags are left open, e.g. `<details>` around markdown).
 * Sanitizing the whole document instead costs ~0.5 s per MB.
 */
export function renderMarkdown(text: string): RenderResult {
  const md = getMarkdown();
  const env: FrontMatterEnv & WikilinkEnv & { headings?: HeadingInfo[] } = {};
  const mdEnv = env as NonNullable<Parameters<MarkdownIt['render']>[1]>;
  const tokens = md.parse(text, mdEnv);
  const ranges = topLevelRanges(tokens);
  const chunked = ranges.length > CHUNK_THRESHOLD;
  let html = '';
  let chunk = '';
  let chunkBlocks = 0;
  const flush = () => {
    if (!chunk) return;
    html += `<div class="md-chunk" style="contain-intrinsic-size: auto ${chunkBlocks * 48}px">${chunk}</div>`;
    chunk = '';
    chunkBlocks = 0;
  };
  for (let i = 0; i < ranges.length; i++) {
    let range = ranges[i];
    if (chunked) {
      const first = range[0];
      const atHeading = first.type === 'heading_open' && Number(first.tag.slice(1)) <= 3;
      if ((chunkBlocks >= CHUNK_BLOCKS && atHeading) || chunkBlocks >= CHUNK_BLOCKS * 4) flush();
    }
    const raw = rawHtmlIn(range);
    let out: string;
    if (raw === null) {
      out = md.renderer.render(range, md.options, mdEnv);
    } else {
      let balance = tagBalance(raw);
      while (balance > 0 && i + 1 < ranges.length) {
        i++;
        range = range.concat(ranges[i]);
        balance += tagBalance(rawHtmlIn(ranges[i]) ?? '');
      }
      out = sanitize(md.renderer.render(range, md.options, mdEnv));
    }
    if (chunked) {
      chunk += out;
      chunkBlocks++;
    } else html += out;
  }
  flush();
  return {
    html,
    headings: env.headings ?? [],
    frontMatter: env.frontMatter ?? null,
    wikilinks: env.wikilinks ?? [],
  };
}
