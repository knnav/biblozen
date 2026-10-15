// Source edits for interactive task lists (SPEC §6.4).

const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

/** Toggles `[ ]` ⇄ `[x]` on the given 0-based line. Returns null if it isn't a task. */
export function toggleTaskAt(text: string, line: number): string | null {
  const lines = text.split('\n');
  const l = lines[line];
  if (l === undefined) return null;
  const m = TASK_LINE.exec(l);
  if (!m) return null;
  lines[line] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + l.slice(m[0].length);
  return lines.join('\n');
}
