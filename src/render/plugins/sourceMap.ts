import type { MarkdownIt } from 'markdown-it';

/** Adds data-line="<0-based source line>" to every block element that has a source map. */
export function sourceMapPlugin(md: MarkdownIt): void {
  md.core.ruler.push('source_map', (state) => {
    const offset = (state.env as { lineOffset?: number }).lineOffset ?? 0;
    for (const t of state.tokens) {
      if (t.map && t.block && (t.nesting === 1 || t.nesting === 0) && t.type !== 'inline') {
        t.attrSet('data-line', String(t.map[0] + offset));
      }
    }
  });
}
