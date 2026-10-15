// Line diff for the "changed on disk" view (LCS; trims common prefix/suffix first).

export type DiffOp = { kind: 'same' | 'del' | 'add'; text: string };

export const DIFF_MAX_CELLS = 4_000_000;

export function diffLines(a: string, b: string): DiffOp[] | null {
  const A = a.split('\n');
  const B = b.split('\n');
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const a2 = A.slice(start, endA);
  const b2 = B.slice(start, endB);
  if (a2.length * b2.length > DIFF_MAX_CELLS) return null;
  // LCS table (rows of a2, cols of b2), filled from the end.
  const n = a2.length;
  const m = b2.length;
  const t: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = a2[i] === b2[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const ops: DiffOp[] = A.slice(0, start).map((text) => ({ kind: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a2[i] === b2[j]) {
      ops.push({ kind: 'same', text: a2[i] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) ops.push({ kind: 'del', text: a2[i++] });
    else ops.push({ kind: 'add', text: b2[j++] });
  }
  while (i < n) ops.push({ kind: 'del', text: a2[i++] });
  while (j < m) ops.push({ kind: 'add', text: b2[j++] });
  for (const text of A.slice(endA)) ops.push({ kind: 'same', text });
  return ops;
}
