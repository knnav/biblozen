// Extracts headings and outgoing links from markdown source for the index.
// Line-based and fast; skips fenced code, inline code and front matter.

import { Slugger } from '../render/slug';
import { parseWikilink } from '../render/plugins/wikilinks';

export interface IndexedHeading {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface OutLink {
  kind: 'wiki' | 'md';
  /** Wikilink target (note name/path) or the raw relative href path for md links. */
  target: string;
  heading: string | null;
  embed: boolean;
  line: number;
  /** The source line, trimmed, for backlink context. */
  context: string;
}

export interface Extracted {
  headings: IndexedHeading[];
  links: OutLink[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const WIKI = /(!?)\[\[([^[\]\n]+)\]\]/g;
const MDLINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*["')])?\s*\)/g;

/** Plain text of a heading line (drops simple inline markup). */
function headingText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim();
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function extract(text: string): Extracted {
  const lines = text.split(/\r?\n/);
  const headings: IndexedHeading[] = [];
  const links: OutLink[] = [];
  const slugger = new Slugger();
  let fence: string | null = null;
  let i = 0;
  // Front matter.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) i = end + 1;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (/^( {4}|\t)/.test(line) && (i === 0 || lines[i - 1].trim() === '')) continue; // indented code
    const h = ATX.exec(line);
    if (h) {
      const t = headingText(h[2] ?? '');
      headings.push({ level: h[1].length, text: t, slug: slugger.slug(t), line: i });
    } else if (
      i > 0 &&
      /^\s{0,3}(=+|-+)\s*$/.test(line) &&
      lines[i - 1].trim() &&
      !/^\s{0,3}[-*+]\s/.test(lines[i - 1])
    ) {
      // Setext heading (the text is on the previous line).
      const t = headingText(lines[i - 1]);
      headings.push({
        level: line.trim()[0] === '=' ? 1 : 2,
        text: t,
        slug: slugger.slug(t),
        line: i - 1,
      });
    }
    // Ignore links inside inline code spans.
    const scan = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
    const context = line.trim().slice(0, 200);
    for (const m of scan.matchAll(WIKI)) {
      const w = parseWikilink(m[2], m[1] === '!');
      links.push({
        kind: 'wiki',
        target: w.target,
        heading: w.heading,
        embed: w.embed,
        line: i,
        context,
      });
    }
    for (const m of scan.matchAll(MDLINK)) {
      const href = m[3];
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
      const hash = href.indexOf('#');
      const path = safeDecode(hash === -1 ? href : href.slice(0, hash));
      const heading = hash === -1 ? null : safeDecode(href.slice(hash + 1)) || null;
      if (!path) continue;
      links.push({ kind: 'md', target: path, heading, embed: m[1] === '!', line: i, context });
    }
  }
  return { headings, links };
}
