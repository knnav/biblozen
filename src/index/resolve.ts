// Wikilink resolution (SPEC §8.2).

import { isMarkdown, relative } from '../platform/path';

export interface FileRef {
  path: string;
  /** Lower-cased path relative to the root with `/` separators. */
  rel: string;
  /** rel without a markdown extension (only for markdown files). */
  relNoExt: string | null;
}

export function makeFileRef(root: string, path: string): FileRef {
  const rel = relative(root, path).toLowerCase();
  return { path, rel, relNoExt: isMarkdown(path) ? rel.replace(/\.[^./]+$/, '') : null };
}

function segments(rel: string): number {
  return rel.split('/').length;
}

function endsWithSegment(rel: string, target: string): boolean {
  return rel === target || rel.endsWith('/' + target);
}

/**
 * Finds the file a wikilink target points to.
 * - case-insensitive, with or without `.md`
 * - `folder/note` matches by path suffix
 * - ambiguity → shortest path wins (fewest segments, then shortest, then alphabetical)
 */
export function resolveWikiTarget(target: string, files: readonly FileRef[]): string | null {
  const t = target
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .toLowerCase();
  if (!t) return null;
  const hasExt = /\.[a-z0-9]+$/i.test(t);
  const matches: FileRef[] = [];
  for (const f of files) {
    if (endsWithSegment(f.rel, t)) matches.push(f);
    else if (!hasExt && f.relNoExt !== null && endsWithSegment(f.relNoExt, t)) matches.push(f);
    else if (
      hasExt &&
      f.relNoExt !== null &&
      isMarkdown(t) === false &&
      endsWithSegment(f.relNoExt, t)
    ) {
      // "note.v2" style names without .md
      matches.push(f);
    }
  }
  if (!matches.length) return null;
  matches.sort(
    (a, b) =>
      segments(a.rel) - segments(b.rel) || a.rel.length - b.rel.length || (a.rel < b.rel ? -1 : 1),
  );
  return matches[0].path;
}

/** Last path segment of a target, lower-cased, without a markdown extension. */
function keyOf(rel: string): string {
  const last = rel.slice(rel.lastIndexOf('/') + 1).toLowerCase();
  return last.replace(/\.(md|markdown|mdown|mkd|mdx)$/, '');
}

/**
 * Same rules as resolveWikiTarget, but indexes files by name first so resolving many
 * links against thousands of files stays fast.
 */
export function createResolver(files: readonly FileRef[]): (target: string) => string | null {
  const byKey = new Map<string, FileRef[]>();
  for (const f of files) {
    for (const k of new Set([keyOf(f.rel), f.rel.slice(f.rel.lastIndexOf('/') + 1)])) {
      const list = byKey.get(k);
      if (list) list.push(f);
      else byKey.set(k, [f]);
    }
  }
  const cache = new Map<string, string | null>();
  return (target: string) => {
    const t = target.trim().toLowerCase();
    if (cache.has(t)) return cache.get(t)!;
    const norm = t
      .replace(/\\/g, '/')
      .replace(/^(\.\/)+/, '')
      .replace(/^\/+/, '');
    const last = norm.slice(norm.lastIndexOf('/') + 1);
    const candidates = new Set([...(byKey.get(last) ?? []), ...(byKey.get(keyOf(norm)) ?? [])]);
    const r = resolveWikiTarget(target, [...candidates]);
    cache.set(t, r);
    return r;
  };
}
