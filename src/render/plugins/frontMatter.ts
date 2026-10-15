import type { MarkdownIt } from 'markdown-it';
import frontMatter from 'markdown-it-front-matter';
import { parse } from 'yaml';

export interface FrontMatterEnv {
  frontMatter?: { raw: string; data: unknown; error: string | null };
}

function renderValue(v: unknown, esc: (s: string) => string): string {
  if (v === null || v === undefined) return '<span class="fm-null">—</span>';
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object' || x === null))
      return v.map((x) => `<span class="fm-tag">${esc(String(x))}</span>`).join(' ');
    return `<pre class="fm-json">${esc(JSON.stringify(v, null, 2))}</pre>`;
  }
  if (v instanceof Date) return esc(v.toISOString().slice(0, 10));
  if (typeof v === 'object') return `<pre class="fm-json">${esc(JSON.stringify(v, null, 2))}</pre>`;
  return esc(String(v));
}

/** YAML front matter → collapsible metadata card. */
export function frontMatterPlugin(md: MarkdownIt): void {
  md.use(frontMatter, () => {});
  const esc = md.utils.escapeHtml;
  md.renderer.rules.front_matter = (tokens, idx, _o, rawEnv) => {
    const env = (rawEnv ?? {}) as FrontMatterEnv;
    const raw = (tokens[idx] as unknown as { meta: string }).meta ?? '';
    let data: unknown = null;
    let error: string | null = null;
    try {
      data = parse(raw);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    env.frontMatter = { raw, data, error };
    let body: string;
    if (error || typeof data !== 'object' || data === null || Array.isArray(data)) {
      body = `<pre class="fm-raw">${esc(raw)}</pre>`;
    } else {
      body =
        '<dl class="fm-list">' +
        Object.entries(data as Record<string, unknown>)
          .map(
            ([k, v]) =>
              `<div class="fm-row"><dt>${esc(k)}</dt><dd>${renderValue(v, esc)}</dd></div>`,
          )
          .join('') +
        '</dl>';
    }
    const title =
      data && typeof data === 'object' && 'title' in data
        ? String((data as { title: unknown }).title)
        : null;
    return `<details class="front-matter" data-line="0"><summary><span class="fm-label">Metadata</span>${title ? `<span class="fm-title">${esc(title)}</span>` : ''}</summary>${body}</details>\n`;
  };
}
