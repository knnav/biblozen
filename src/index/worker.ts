/// <reference lib="webworker" />
// Index worker: parses documents and answers backlink/heading queries off the UI thread.

import { IndexCore } from './core';
import type { FromWorker, ToWorker } from './protocol';

const core = new IndexCore();
const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'files':
      core.setFiles(m.root, m.paths);
      post({ type: 'changed' });
      break;
    case 'upsert':
      for (const it of m.items) core.upsert(it.path, it.text);
      post({ type: 'changed' });
      break;
    case 'remove':
      core.remove(m.paths);
      post({ type: 'changed' });
      break;
    case 'query':
      post({
        type: 'reply',
        id: m.id,
        result: m.kind === 'backlinks' ? core.backlinksTo(m.path) : core.headings(m.path),
      });
      break;
  }
};
