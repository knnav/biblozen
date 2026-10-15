// Preview scroll helpers shared by keyboard nav, scroll memory, history and outline.

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function previewScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pane="preview"] [data-scroll]');
}

export function previewArticle(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pane="preview"] .markdown-body');
}

export function scrollBehavior(smooth: boolean): ScrollBehavior {
  return smooth && !reducedMotion() ? 'smooth' : 'auto';
}

function lineEls(article: HTMLElement): HTMLElement[] {
  return [...article.querySelectorAll<HTMLElement>('[data-line]')];
}

/** Source line of the first block whose bottom is below the top edge (binary search). */
export function topVisibleLine(scroller: HTMLElement, article: HTMLElement): number | null {
  const els = lineEls(article);
  if (!els.length) return null;
  const top = scroller.getBoundingClientRect().top + 8;
  let lo = 0;
  let hi = els.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (els[mid].getBoundingClientRect().top <= top) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // A block that's almost scrolled past isn't what the reader is looking at.
  if (els[ans].getBoundingClientRect().bottom < top + 24 && ans + 1 < els.length) ans++;
  return Number(els[ans].dataset.line);
}

/** Scrolls so the block for `line` is at the top. */
export function scrollToLine(
  scroller: HTMLElement,
  article: HTMLElement,
  line: number,
  smooth = false,
): void {
  let best: HTMLElement | null = null;
  for (const el of lineEls(article)) {
    if (Number(el.dataset.line) <= line) best = el;
    else break;
  }
  if (!best) {
    scroller.scrollTo({ top: 0 });
    return;
  }
  const top =
    best.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop -
    16;
  scroller.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior(smooth) });
}

export function scrollProgress(scroller: HTMLElement): number {
  const max = scroller.scrollHeight - scroller.clientHeight;
  // Short documents that fit on screen show no progress bar at all.
  return max <= 0 ? 0 : Math.min(1, Math.max(0, scroller.scrollTop / max));
}

/** Scrolls the preview so the element is at the top (minus a little breathing room). */
export function scrollToElement(scroller: HTMLElement, el: Element, smooth = true): void {
  const top =
    el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
  scroller.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior(smooth) });
}

export function findAnchor(article: HTMLElement, id: string): HTMLElement | null {
  const slug = id.toLowerCase().trim().replace(/\s+/g, '-');
  return (
    article.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ??
    article.querySelector<HTMLElement>(`[id="${CSS.escape(slug)}"]`) ??
    article.querySelector<HTMLElement>(`[id="user-content-${CSS.escape(id)}"]`)
  );
}

/** Element for a 0-based source line: the last block starting at or before it. */
export function elementForLine(article: HTMLElement, line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of article.querySelectorAll<HTMLElement>('[data-line]')) {
    if (Number(el.dataset.line) <= line) best = el;
    else break;
  }
  return best;
}
