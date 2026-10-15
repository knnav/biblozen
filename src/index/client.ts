// Main-thread side of the index: reads files (async IPC, batched) and feeds the
// worker, which parses and answers queries. The UI stays responsive throughout.

import { getPlatform } from '../platform';
import { isMarkdown, samePath } from '../platform/path';
import type { WatchEvent } from '../platform/types';
import { IndexCore, type Backlink } from './core';
import type { IndexedHeading } from './extract';
import type { FromWorker, ToWorker } from './protocol';
import { useIndex } from './store';

interface Backend {
  send(m: ToWorker): void;
}

let backend: Backend | null = null;
let nextId = 1;
const pending = new Map<number, (r: unknown) => void>();

function onMessage(m: FromWorker) {
  if (m.type === 'changed') useIndex.setState((s) => ({ version: s.version + 1 }));
  else if (m.type === 'reply') {
    pending.get(m.id)?.(m.result);
    pending.delete(m.id);
  }
}

function getBackend(): Backend {
  if (backend) return backend;
  if (typeof Worker !== 'undefined') {
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
      backend = { send: (m) => w.postMessage(m) };
      return backend;
    } catch {
      // Fall through to the in-thread index.
    }
  }
  // In-thread fallback (unit tests, environments without workers).
  const core = new IndexCore();
  backend = {
    send: (m) =>
      queueMicrotask(() => {
        if (m.type === 'files') core.setFiles(m.root, m.paths);
        else if (m.type === 'upsert') m.items.forEach((it) => core.upsert(it.path, it.text));
        else if (m.type === 'remove') core.remove(m.paths);
        else {
          onMessage({
            type: 'reply',
            id: m.id,
            result: m.kind === 'backlinks' ? core.backlinksTo(m.path) : core.headings(m.path),
          });
          return;
        }
        onMessage({ type: 'changed' });
      }),
  };
  return backend;
}

function query<T>(kind: 'backlinks' | 'headings', path: string): Promise<T> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve as (r: unknown) => void);
    getBackend().send({ type: 'query', id, kind, path });
  });
}

export const queryBacklinks = (path: string) => query<Backlink[]>('backlinks', path);
export const queryHeadings = (path: string) => query<IndexedHeading[]>('headings', path);

let generation = 0;
let indexedRoot: string | null = null;
let known = new Set<string>();

const BATCH = 24;

async function readAndSend(paths: string[], gen: number, progress: boolean) {
  const platform = getPlatform();
  for (let i = 0; i < paths.length; i += BATCH) {
    if (gen !== generation) return;
    const slice = paths.slice(i, i + BATCH);
    const items = (
      await Promise.all(
        slice.map(async (path) => {
          try {
            return { path, text: await platform.readTextFile(path) };
          } catch {
            return null;
          }
        }),
      )
    ).filter((x): x is { path: string; text: string } => x !== null);
    if (gen !== generation) return;
    getBackend().send({ type: 'upsert', items });
    // Yield to the event loop so input and rendering stay responsive.
    await new Promise((r) => setTimeout(r, 0));
    if (progress)
      useIndex.setState((s) => ({
        progress: {
          done: Math.min(s.progress.total, s.progress.done + slice.length),
          total: s.progress.total,
        },
      }));
  }
}

/**
 * Brings the index in line with the folder's file list. The first call for a root
 * reads everything (in the background); later calls only read new files.
 */
export async function syncIndex(root: string | null, allPaths: string[]): Promise<void> {
  const backendRef = getBackend();
  if (!root) {
    generation++;
    indexedRoot = null;
    known = new Set();
    useIndex.setState({ status: 'idle', progress: { done: 0, total: 0 } });
    return;
  }
  const md = allPaths.filter(isMarkdown);
  backendRef.send({ type: 'files', root, paths: allPaths });
  if (indexedRoot !== root) {
    const gen = ++generation;
    indexedRoot = root;
    known = new Set(md);
    useIndex.setState({ status: 'building', progress: { done: 0, total: md.length } });
    await readAndSend(md, gen, true);
    if (gen === generation) useIndex.setState({ status: 'ready' });
    return;
  }
  const added = md.filter((p) => !known.has(p));
  const removed = [...known].filter((p) => !md.includes(p));
  known = new Set(md);
  if (removed.length) backendRef.send({ type: 'remove', paths: removed });
  if (added.length) await readAndSend(added, generation, false);
}

/** Re-reads modified markdown files (from the root watcher). */
export function onIndexFsEvents(events: WatchEvent[]): void {
  if (!indexedRoot) return;
  const changed = new Set<string>();
  for (const e of events) {
    if (e.kind === 'remove') continue;
    for (const p of e.paths)
      if (isMarkdown(p) && [...known].some((k) => samePath(k, p))) changed.add(p);
  }
  if (changed.size) void readAndSend([...changed], generation, false);
}
