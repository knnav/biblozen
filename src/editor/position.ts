// Hands the top visible source line from one view to the other when switching
// modes (SPEC §3.2), so the reader keeps their place.

let pending: { line: number; at: number; takenBy: Set<string> } | null = null;

export function setPendingTopLine(line: number | null): void {
  pending = line === null ? null : { line, at: Date.now(), takenBy: new Set() };
}

/** Each view (editor/preview) takes the pending line at most once, shortly after a switch. */
export function takePendingTopLine(who: 'editor' | 'preview'): number | null {
  if (!pending || Date.now() - pending.at > 1500 || pending.takenBy.has(who)) return null;
  pending.takenBy.add(who);
  return pending.line;
}
