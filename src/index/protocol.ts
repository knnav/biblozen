import type { Backlink } from './core';
import type { IndexedHeading } from './extract';

export type ToWorker =
  | { type: 'files'; root: string; paths: string[] }
  | { type: 'upsert'; items: { path: string; text: string }[] }
  | { type: 'remove'; paths: string[] }
  | { type: 'query'; id: number; kind: 'backlinks' | 'headings'; path: string };

export type FromWorker =
  { type: 'changed' } | { type: 'reply'; id: number; result: Backlink[] | IndexedHeading[] };
