import type { MarkdownIt } from 'markdown-it';
import type { StateInline } from 'markdown-it';

export interface WikiTarget {
  /** Note part before `#` (may include folders), trimmed. Empty = current doc. */
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
}

export function parseWikilink(inner: string, embed = false): WikiTarget {
  const pipe = inner.indexOf('|');
  const left = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
  const hash = left.indexOf('#');
  const target = (hash === -1 ? left : left.slice(0, hash)).trim();
  const heading = hash === -1 ? null : left.slice(hash + 1).trim() || null;
  return { target, heading, alias, embed };
}

export interface WikilinkEnv {
  wikilinks?: (WikiTarget & { line: number })[];
}

/** `[[note]]`, `[[note#h]]`, `[[note|alias]]`, `![[image.png]]`. Resolution happens later. */
export function wikilinksPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'wikilink', (state: StateInline, silent: boolean) => {
    const src = state.src;
    let pos = state.pos;
    let embed = false;
    if (src.charCodeAt(pos) === 0x21 /* ! */) {
      embed = true;
      pos++;
    }
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', pos + 2);
    if (end === -1) return false;
    const inner = src.slice(pos + 2, end);
    if (!inner.trim() || inner.includes('[') || inner.includes('\n')) return false;
    if (!silent) {
      const t = state.push('wikilink', 'a', 0);
      const target = parseWikilink(inner, embed);
      t.meta = target as unknown as Record<string, unknown>;
      t.content = inner;
      const env = state.env as WikilinkEnv;
      (env.wikilinks ??= []).push({ ...target, line: -1 });
    }
    state.pos = end + 2;
    return true;
  });

  const esc = md.utils.escapeHtml;
  md.renderer.rules.wikilink = (tokens, idx) => {
    const w = tokens[idx].meta as unknown as WikiTarget;
    const ref = w.target + (w.heading ? `#${w.heading}` : '');
    if (w.embed) {
      return `<img class="wikilink-embed" data-wikilink="${esc(ref)}" data-embed="true" alt="${esc(w.alias ?? w.target)}">`;
    }
    const label =
      w.alias ?? (w.target ? w.target + (w.heading ? ` › ${w.heading}` : '') : (w.heading ?? ''));
    return `<a class="wikilink" href="#" data-wikilink="${esc(ref)}">${esc(label)}</a>`;
  };
}
