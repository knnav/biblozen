// Bidirectional editor ⇄ preview scroll sync (SPEC §7.2) via data-line anchors.

import type { EditorView } from '@codemirror/view';
import { getSettings } from '../settings/store';
import { previewArticle, previewScroller } from '../reader/scroll';
import { editorTopLine, getView, scrollEditorToLine } from './controller';
import { lineToY, normalizeAnchors, yToLine, type Anchor } from './scrollMap';

let lockUntil = 0;
let lockedBy: 'editor' | 'preview' | null = null;

function anchors(scroller: HTMLElement, article: HTMLElement): { list: Anchor[]; end: Anchor } {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const raw: Anchor[] = [];
  for (const el of article.querySelectorAll<HTMLElement>('[data-line]')) {
    raw.push({ line: Number(el.dataset.line), y: el.getBoundingClientRect().top - base });
  }
  const view = getView();
  const lines = view ? view.state.doc.lines : (raw[raw.length - 1]?.line ?? 0) + 1;
  return { list: normalizeAnchors(raw), end: { line: lines, y: scroller.scrollHeight } };
}

function enabled(): boolean {
  return (
    getSettings().editor.scrollSync && !!document.querySelector('.workarea[data-layout="split"]')
  );
}

function lock(by: 'editor' | 'preview') {
  lockedBy = by;
  lockUntil = performance.now() + 120;
}

function locked(by: 'editor' | 'preview') {
  return lockedBy !== by && performance.now() < lockUntil;
}

export function syncPreviewToEditor(): void {
  const s = previewScroller();
  const a = previewArticle();
  const top = editorTopLine();
  if (!s || !a || !top) return;
  const { list, end } = anchors(s, a);
  lock('editor');
  s.scrollTop = Math.max(0, lineToY(list, top.line + top.frac, end) - 16);
}

export function syncEditorToPreview(): void {
  const s = previewScroller();
  const a = previewArticle();
  if (!s || !a || !getView()) return;
  const { list, end } = anchors(s, a);
  lock('preview');
  scrollEditorToLine(yToLine(list, s.scrollTop + 16, end));
}

/** Wires scroll listeners while both panes are mounted. Returns a disposer. */
export function bindScrollSync(view: EditorView, scroller: HTMLElement): () => void {
  let raf = 0;
  const onEditor = () => {
    if (!enabled() || locked('editor')) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncPreviewToEditor);
  };
  const onPreview = () => {
    if (!enabled() || locked('preview')) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncEditorToPreview);
  };
  view.scrollDOM.addEventListener('scroll', onEditor, { passive: true });
  scroller.addEventListener('scroll', onPreview, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    view.scrollDOM.removeEventListener('scroll', onEditor);
    scroller.removeEventListener('scroll', onPreview);
  };
}
