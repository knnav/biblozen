import type { MarkdownIt } from 'markdown-it';
import type { StateBlock } from 'markdown-it';
import type { StateInline } from 'markdown-it';

/**
 * `$inline$` and `$$block$$` math. Renders placeholders holding the TeX as text
 * (not an attribute — DOMPurify drops attributes containing "-->"); KaTeX is lazy-loaded
 * and fills them in after render (see postprocess.ts).
 */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', (state: StateInline, silent: boolean) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
    if (src.charCodeAt(start + 1) === 0x24) return false; // $$ handled as block
    const next = src.charCodeAt(start + 1);
    if (next === 0x20 || next === 0x09 || Number.isNaN(next)) return false;
    let end = start + 1;
    while (true) {
      end = src.indexOf('$', end);
      if (end === -1) return false;
      if (src.charCodeAt(end - 1) === 0x5c /* \ */) {
        end++;
        continue;
      }
      break;
    }
    const before = src.charCodeAt(end - 1);
    if (before === 0x20 || before === 0x09) return false;
    const after = src.charCodeAt(end + 1);
    if (after >= 0x30 && after <= 0x39) return false; // "$5 and $6" isn't math
    if (end === start + 1) return false;
    if (!silent) {
      const t = state.push('math_inline', 'span', 0);
      t.content = src.slice(start + 1, end);
      t.markup = '$';
    }
    state.pos = end + 1;
    return true;
  });

  md.block.ruler.after(
    'blockquote',
    'math_block',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      let pos = state.bMarks[startLine] + state.tShift[startLine];
      let max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      if (state.src.slice(pos, pos + 2) !== '$$') return false;
      pos += 2;
      let firstLine = state.src.slice(pos, max);
      let lastLine = '';
      let next = startLine;
      let found = false;
      if (firstLine.trim().endsWith('$$')) {
        firstLine = firstLine.trim().slice(0, -2);
        found = true;
      }
      if (silent) return true;
      while (!found) {
        next++;
        if (next >= endLine) break;
        pos = state.bMarks[next] + state.tShift[next];
        max = state.eMarks[next];
        if (pos < max && state.tShift[next] < state.blkIndent) break;
        const line = state.src.slice(pos, max);
        if (line.trim().endsWith('$$')) {
          lastLine = line.slice(0, line.lastIndexOf('$$'));
          found = true;
        }
      }
      if (!found) return false;
      state.line = next + 1;
      const t = state.push('math_block', 'div', 0);
      t.block = true;
      t.content =
        (firstLine.trim() ? firstLine + '\n' : '') +
        state.getLines(startLine + 1, next, state.tShift[startLine], true) +
        (lastLine.trim() ? lastLine : '');
      t.map = [startLine, state.line];
      t.markup = '$$';
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  const esc = md.utils.escapeHtml;
  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="math math-inline">${esc(tokens[idx].content)}</span>`;
  md.renderer.rules.math_block = (tokens, idx, _o, _e, self) =>
    `<div class="math math-block"${self.renderAttrs(tokens[idx])}>${esc(tokens[idx].content.trim())}</div>\n`;
}
