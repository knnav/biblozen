import type { MarkdownIt } from 'markdown-it';

const TASK = /^\[([ xX])\][ \t]/;

/** GFM task lists: `- [ ] item` → checkbox with the item's source line. */
export function taskListsPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (
        inline.type !== 'inline' ||
        tokens[i - 1].type !== 'paragraph_open' ||
        tokens[i - 2].type !== 'list_item_open'
      )
        continue;
      const first = inline.children?.[0];
      if (!first || first.type !== 'text') continue;
      const m = TASK.exec(first.content);
      if (!m) continue;
      const checked = m[1] !== ' ';
      first.content = first.content.slice(m[0].length);
      const li = tokens[i - 2];
      li.attrJoin('class', 'task-list-item');
      const line = li.attrGet('data-line') ?? String(li.map?.[0] ?? '');
      const box = new state.Token('bz_html', '', 0);
      box.content = `<input type="checkbox" class="task-list-item-checkbox" data-task-line="${line}"${checked ? ' checked' : ''} aria-label="Task">`;
      inline.children!.unshift(box);
      // Mark the parent list.
      for (let j = i - 3; j >= 0; j--) {
        const t = tokens[j];
        if (
          (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') &&
          t.level === li.level - 1
        ) {
          if (!String(t.attrGet('class') ?? '').includes('contains-task-list'))
            t.attrJoin('class', 'contains-task-list');
          break;
        }
      }
    }
  });
  md.renderer.rules.bz_html ??= (tokens, idx) => tokens[idx].content;
}
