// History-aware navigation helpers.

import { useDocument } from '../app/document';
import { openFile } from '../app/actions';
import { samePath } from '../platform/path';
import { go, useHistory } from './history';
import { pushLocation, rememberHere } from './position';
import {
  findAnchor,
  previewArticle,
  previewScroller,
  scrollToElement,
  scrollToLine,
} from './scroll';

/** Jumps to an element in the current document, recording history. */
export function jumpToElement(el: HTMLElement, smooth = true): void {
  const scroller = previewScroller();
  const path = useDocument.getState().path;
  if (!scroller || !path) return;
  rememberHere();
  scrollToElement(scroller, el, smooth);
  const line = el.closest<HTMLElement>('[data-line]')?.dataset.line;
  pushLocation(path, line ? Number(line) : null);
}

export function jumpToAnchor(id: string): boolean {
  const a = previewArticle();
  const el = a ? findAnchor(a, id) : null;
  if (el) jumpToElement(el);
  return !!el;
}

export async function historyGo(dir: -1 | 1): Promise<void> {
  rememberHere();
  const r = go(useHistory.getState(), dir);
  if (!r) return;
  useHistory.setState(r.state);
  const doc = useDocument.getState().path;
  if (doc && samePath(doc, r.entry.path)) {
    const s = previewScroller();
    const a = previewArticle();
    if (s && a && r.entry.line !== null) scrollToLine(s, a, r.entry.line, true);
    return;
  }
  const ok = await openFile(r.entry.path, { line: r.entry.line ?? undefined, history: 'none' });
  if (!ok) useHistory.setState((h) => ({ ...h, index: h.index - dir }));
}
