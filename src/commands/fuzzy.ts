// Small fuzzy matcher: subsequence match with bonuses for word starts,
// consecutive runs and early matches. Returns matched indices for highlighting.

export interface FuzzyResult {
  score: number;
  indices: number[];
}

const WORD_BREAK = /[\s/\\\-_.:#()[\]]/;

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = target.toLowerCase();

  // Fast path: contiguous substring scores highest.
  const sub = t.indexOf(q);
  if (sub !== -1) {
    const atWord = sub === 0 || WORD_BREAK.test(t[sub - 1]);
    const indices = Array.from({ length: q.length }, (_, i) => sub + i);
    return { score: 1000 + (atWord ? 200 : 0) - sub - t.length * 0.1, indices };
  }

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    let found = -1;
    // Prefer a word-start occurrence ahead of a mid-word one.
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch && (j === 0 || WORD_BREAK.test(t[j - 1]) || isCamelStart(target, j))) {
        found = j;
        break;
      }
    }
    if (found === -1 || (prev >= 0 && t.indexOf(ch, ti) === prev + 1)) {
      const next = t.indexOf(ch, ti);
      if (next !== -1 && (found === -1 || next === prev + 1)) found = next;
    }
    if (found === -1) return null;
    const isStart = found === 0 || WORD_BREAK.test(t[found - 1]) || isCamelStart(target, found);
    score += 10;
    if (isStart) score += 25;
    if (found === prev + 1) score += 20;
    score -= Math.min(found - ti, 10);
    indices.push(found);
    prev = found;
    ti = found + 1;
  }
  score -= t.length * 0.1;
  return { score, indices };
}

function isCamelStart(s: string, i: number): boolean {
  return i > 0 && /[a-z]/.test(s[i - 1]) && /[A-Z]/.test(s[i]);
}

export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  key: (item: T) => string,
  limit = 200,
): { item: T; match: FuzzyResult }[] {
  const out: { item: T; match: FuzzyResult; order: number }[] = [];
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, key(item));
    if (match) out.push({ item, match, order });
  });
  if (query.trim()) out.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return out.slice(0, limit);
}
