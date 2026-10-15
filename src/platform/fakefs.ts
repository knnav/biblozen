// In-memory filesystem backing the browser/test platform.
// Paths are POSIX-style and absolute.

import { basename, dirname, isInside, normalize } from './path';
import type { WatchEvent } from './types';

type Entry =
  { kind: 'file'; data: string | Uint8Array; mtime: number } | { kind: 'dir'; mtime: number };

type Listener = { path: string; recursive: boolean; cb: (events: WatchEvent[]) => void };

export class FakeFs {
  private entries = new Map<string, Entry>();
  private listeners = new Set<Listener>();
  private clock = 1;
  /** Paths moved to the fake trash, newest last. */
  readonly trashed: string[] = [];

  constructor() {
    this.entries.set('/', { kind: 'dir', mtime: 0 });
  }

  private key(p: string): string {
    return normalize(p);
  }

  has(p: string): boolean {
    return this.entries.has(this.key(p));
  }

  isDir(p: string): boolean {
    return this.entries.get(this.key(p))?.kind === 'dir';
  }

  mkdirp(p: string, emit = true): void {
    const k = this.key(p);
    if (this.entries.has(k)) return;
    const parent = dirname(k);
    if (parent !== k) this.mkdirp(parent, emit);
    this.entries.set(k, { kind: 'dir', mtime: this.clock++ });
    if (emit) this.emit({ kind: 'create', paths: [k] });
  }

  write(p: string, data: string | Uint8Array, emit = true): void {
    const k = this.key(p);
    const existed = this.entries.has(k);
    this.mkdirp(dirname(k), emit);
    this.entries.set(k, { kind: 'file', data, mtime: this.clock++ });
    if (emit) this.emit({ kind: existed ? 'modify' : 'create', paths: [k] });
  }

  read(p: string): string {
    const e = this.entries.get(this.key(p));
    if (!e) throw { kind: 'notFound', message: `Not found: ${p}` };
    if (e.kind !== 'file') throw { kind: 'io', message: `Is a directory: ${p}` };
    return typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data);
  }

  readBytes(p: string): Uint8Array {
    const e = this.entries.get(this.key(p));
    if (!e || e.kind !== 'file') throw { kind: 'notFound', message: `Not found: ${p}` };
    return typeof e.data === 'string' ? new TextEncoder().encode(e.data) : e.data;
  }

  /** Direct children of a directory. */
  list(p: string): { path: string; name: string; kind: 'file' | 'dir' }[] {
    const k = this.key(p);
    const out: { path: string; name: string; kind: 'file' | 'dir' }[] = [];
    for (const [path, e] of this.entries) {
      if (path !== k && dirname(path) === k) out.push({ path, name: basename(path), kind: e.kind });
    }
    return out;
  }

  remove(p: string, emit = true): void {
    const k = this.key(p);
    if (!this.entries.has(k)) throw { kind: 'notFound', message: `Not found: ${p}` };
    for (const path of [...this.entries.keys()]) {
      if (path === k || isInside(k, path, false, false)) this.entries.delete(path);
    }
    if (emit) this.emit({ kind: 'remove', paths: [k] });
  }

  rename(from: string, to: string, emit = true): void {
    const a = this.key(from);
    const b = this.key(to);
    if (!this.entries.has(a)) throw { kind: 'notFound', message: `Not found: ${from}` };
    if (this.entries.has(b) && a.toLowerCase() !== b.toLowerCase())
      throw { kind: 'alreadyExists', message: `Already exists: ${to}` };
    this.mkdirp(dirname(b), emit);
    const moved: [string, Entry][] = [];
    for (const [path, e] of this.entries) {
      if (path === a || isInside(a, path, false, false)) moved.push([path, e]);
    }
    for (const [path] of moved) this.entries.delete(path);
    for (const [path, e] of moved) this.entries.set(b + path.slice(a.length), e);
    if (emit) this.emit({ kind: 'rename', paths: [a, b] });
  }

  allPaths(): string[] {
    return [...this.entries.keys()];
  }

  watch(path: string, recursive: boolean, cb: (events: WatchEvent[]) => void): () => void {
    const l: Listener = { path: this.key(path), recursive, cb };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(ev: WatchEvent): void {
    for (const l of this.listeners) {
      const hit = ev.paths.some(
        (p) =>
          p === l.path || (l.recursive ? isInside(l.path, p, false, false) : dirname(p) === l.path),
      );
      // Async like a real watcher.
      if (hit) setTimeout(() => l.cb([ev]), 0);
    }
  }
}
