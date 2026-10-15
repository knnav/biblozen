// Editor ⇄ preview scroll mapping (SPEC §7.2): source lines ↔ preview y positions,
// interpolating between `data-line` anchors.

export interface Anchor {
  line: number;
  y: number;
}

/** Sorts, drops anchors that would make the mapping non-monotonic, keeps the first per line. */
export function normalizeAnchors(raw: Anchor[]): Anchor[] {
  const sorted = [...raw].sort((a, b) => a.line - b.line || a.y - b.y);
  const out: Anchor[] = [];
  for (const a of sorted) {
    const last = out[out.length - 1];
    if (last && (a.line === last.line || a.y < last.y)) continue;
    out.push(a);
  }
  return out;
}

function bracket<T>(xs: T[], key: (x: T) => number, v: number): [T, T | null] | null {
  if (!xs.length) return null;
  let lo = 0;
  let hi = xs.length - 1;
  if (v < key(xs[0])) return [xs[0], null];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (key(xs[mid]) <= v) lo = mid;
    else hi = mid - 1;
  }
  return [xs[lo], xs[lo + 1] ?? null];
}

/** Preview y for a (fractional) source line. `endY`/`endLine` describe the document end. */
export function lineToY(anchors: Anchor[], line: number, end: Anchor): number {
  const b = bracket(anchors, (a) => a.line, line);
  if (!b) return 0;
  const [a, next] = b;
  if (line < a.line) return a.y * (line / Math.max(1, a.line));
  const n = next ?? end;
  if (n.line <= a.line) return a.y;
  const t = Math.min(1, (line - a.line) / (n.line - a.line));
  return a.y + t * (n.y - a.y);
}

/** Fractional source line for a preview y. */
export function yToLine(anchors: Anchor[], y: number, end: Anchor): number {
  const b = bracket(anchors, (a) => a.y, y);
  if (!b) return 0;
  const [a, next] = b;
  if (y < a.y) return a.line * (y / Math.max(1, a.y));
  const n = next ?? end;
  if (n.y <= a.y) return a.line;
  const t = Math.min(1, (y - a.y) / (n.y - a.y));
  return a.line + t * (n.line - a.line);
}
