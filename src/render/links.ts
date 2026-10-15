// Classifies and resolves hrefs found in rendered documents.

import { dirname, isMarkdown, join } from '../platform/path';

export type LinkTarget =
  | { kind: 'anchor'; id: string }
  | { kind: 'external'; url: string }
  | { kind: 'file'; path: string; anchor: string | null; markdown: boolean }
  | { kind: 'invalid' };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * @param href raw href from the document
 * @param docPath absolute path of the current document
 * @param root folder root (used for `/`-rooted links, like GitHub repos)
 */
export function classifyLink(href: string, docPath: string, root: string | null): LinkTarget {
  const h = href.trim();
  if (!h) return { kind: 'invalid' };
  if (h.startsWith('#')) return { kind: 'anchor', id: safeDecode(h.slice(1)) };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(h);
  if (scheme) {
    const s = scheme[1].toLowerCase();
    if (s === 'http' || s === 'https' || s === 'mailto' || s === 'tel')
      return { kind: 'external', url: h };
    // Windows drive letters look like schemes ("C:").
    if (!/^[a-z]$/i.test(s)) return { kind: 'invalid' };
  }
  const hash = h.indexOf('#');
  const rawPath = (hash === -1 ? h : h.slice(0, hash)).split('?')[0];
  const anchor = hash === -1 ? null : safeDecode(h.slice(hash + 1)) || null;
  const p = safeDecode(rawPath);
  let path: string;
  if (/^[a-z]:[\\/]/i.test(p) || (p.startsWith('/') && !root)) path = p;
  else if (p.startsWith('/') && root) path = join(root, p);
  else path = join(dirname(docPath), p);
  return { kind: 'file', path, anchor, markdown: isMarkdown(path) };
}

/** Resolves an image `src` to an absolute local path, or returns null for remote/data URLs. */
export function resolveLocalSrc(src: string, docPath: string, root: string | null): string | null {
  if (/^(?:https?:|data:|blob:|asset:)/i.test(src)) return null;
  const t = classifyLink(src, docPath, root);
  return t.kind === 'file' ? t.path : null;
}
