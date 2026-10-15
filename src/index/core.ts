// The index proper: per-file headings/links and the inverted backlinks map.
// Pure (no DOM, no IPC) so it runs in the worker and in unit tests.

import { dirname, isMarkdown, join, normalize, samePath } from '../platform/path';
import { extract, type Extracted, type IndexedHeading } from './extract';
import { createResolver, makeFileRef, type FileRef } from './resolve';

export interface Backlink {
  source: string;
  line: number;
  context: string;
}

export class IndexCore {
  root: string | null = null;
  private files = new Map<string, Extracted>();
  private refs: FileRef[] = [];
  private resolve: (t: string) => string | null = () => null;
  private backlinks: Map<string, Backlink[]> | null = null;
  private lowerPaths = new Map<string, string>();

  setFiles(root: string, paths: string[]): void {
    this.root = root;
    this.refs = paths.map((p) => makeFileRef(root, p));
    this.resolve = createResolver(this.refs);
    this.lowerPaths = new Map(paths.map((p) => [p.toLowerCase().replace(/\\/g, '/'), p]));
    for (const p of [...this.files.keys()])
      if (!this.lowerPaths.has(p.toLowerCase().replace(/\\/g, '/'))) this.files.delete(p);
    this.backlinks = null;
  }

  upsert(path: string, text: string): void {
    this.files.set(path, extract(text));
    this.backlinks = null;
  }

  remove(paths: string[]): void {
    for (const p of paths) this.files.delete(p);
    this.backlinks = null;
  }

  get size(): number {
    return this.files.size;
  }

  headings(path: string): IndexedHeading[] {
    for (const [p, e] of this.files) if (samePath(p, path)) return e.headings;
    return [];
  }

  /** Resolves an outgoing link from `source` to a file path (or null). */
  resolveLink(source: string, kind: 'wiki' | 'md', target: string): string | null {
    if (kind === 'wiki') return target.trim() ? this.resolve(target) : source;
    const abs =
      /^[a-z]:[\\/]/i.test(target) || target.startsWith('/')
        ? this.root
          ? join(this.root, target)
          : target
        : join(dirname(source), target);
    const hit = this.lowerPaths.get(normalize(abs).toLowerCase().replace(/\\/g, '/'));
    return hit ?? null;
  }

  private buildBacklinks(): Map<string, Backlink[]> {
    const map = new Map<string, Backlink[]>();
    for (const [source, e] of this.files) {
      for (const l of e.links) {
        if (l.embed && !isMarkdown(l.target) && l.kind === 'wiki' && /\.[a-z0-9]+$/i.test(l.target))
          continue;
        const target = this.resolveLink(source, l.kind, l.target);
        if (!target || samePath(target, source)) continue;
        const key = target.toLowerCase().replace(/\\/g, '/');
        const list = map.get(key) ?? [];
        // One entry per source line.
        if (!list.some((b) => b.source === source && b.line === l.line))
          list.push({ source, line: l.line, context: l.context });
        map.set(key, list);
      }
    }
    for (const list of map.values())
      list.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.line - b.line));
    return map;
  }

  backlinksTo(path: string): Backlink[] {
    this.backlinks ??= this.buildBacklinks();
    return this.backlinks.get(path.toLowerCase().replace(/\\/g, '/')) ?? [];
  }
}
