// Find in document: wraps matches in <mark class="find-hit"> inside the rendered article.

const SKIP = 'svg, .katex-mathml, .code-block__bar, .heading-anchor, mark.find-hit, script, style';

export function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll('mark.find-hit');
  if (!marks.length) return;
  const parents = new Set<Node>();
  for (const m of marks) {
    const parent = m.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    parents.add(parent);
  }
  for (const p of parents) p.normalize();
}

/** Highlights every case-insensitive match. Returns the marks in document order. */
export function highlightMatches(root: HTMLElement, query: string, limit = 5000): HTMLElement[] {
  clearHighlights(root);
  const q = query.toLowerCase();
  if (!q) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const el = n.parentElement;
      if (!el || el.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && n.nodeValue.toLowerCase().includes(q)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  const marks: HTMLElement[] = [];
  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const lower = text.toLowerCase();
    let from = 0;
    const frag = document.createDocumentFragment();
    for (
      let i = lower.indexOf(q);
      i !== -1 && marks.length < limit;
      i = lower.indexOf(q, i + q.length)
    ) {
      if (i > from) frag.append(text.slice(from, i));
      const m = document.createElement('mark');
      m.className = 'find-hit';
      m.textContent = text.slice(i, i + q.length);
      frag.append(m);
      marks.push(m);
      from = i + q.length;
    }
    if (from === 0) continue;
    if (from < text.length) frag.append(text.slice(from));
    node.replaceWith(frag);
    if (marks.length >= limit) break;
  }
  return marks;
}

export function setCurrent(marks: HTMLElement[], index: number): HTMLElement | null {
  for (const m of marks) delete m.dataset.current;
  const m = marks[index] ?? null;
  if (m) m.dataset.current = 'true';
  return m;
}
