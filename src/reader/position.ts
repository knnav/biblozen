// Records reading positions into history (no dependency on the open/navigation actions).

import { useDocument } from '../app/document';
import { push, recordPosition, useHistory } from './history';
import { previewArticle, previewScroller, topVisibleLine } from './scroll';

export function currentTopLine(): number | null {
  const s = previewScroller();
  const a = previewArticle();
  return s && a && useDocument.getState().status === 'ready' ? topVisibleLine(s, a) : null;
}

/** Called before leaving the current location. */
export function rememberHere(): void {
  useHistory.setState((h) => recordPosition(h, currentTopLine()));
}

export function pushLocation(path: string, line: number | null): void {
  useHistory.setState((h) => push(h, { path, line }));
}
