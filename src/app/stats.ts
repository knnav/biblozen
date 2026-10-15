/** Word count that ignores markdown syntax noise (code fences, link targets, markup). */
export function countWords(md: string): number {
  const text = md
    .replace(/^---\n[\s\S]*?\n---\n?/, '') // front matter
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~|[\]=-]+/g, ' ');
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu);
  return m ? m.length : 0;
}

/** Minutes at ~230 wpm, minimum 1 for non-empty docs. */
export function readingMinutes(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.round(words / 230));
}
