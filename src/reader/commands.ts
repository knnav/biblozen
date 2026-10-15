import { useWorkspace } from '../app/workspace';
import type { Command, CommandContext } from '../commands/registry';
import { useSettings } from '../settings/store';
import { canGo, useHistory } from './history';
import { historyGo } from './nav';
import { previewScroller, scrollBehavior } from './scroll';
import { openFind, stepFind, useReader } from './store';

const readKeys = (c: CommandContext) => c.mode === 'read' && !c.textFocus;
const hasDoc = (c: CommandContext) => c.mode !== 'none';
const LINE = 48;

function scrollBy(dy: (s: HTMLElement) => number, smooth: boolean) {
  const s = previewScroller();
  if (s) s.scrollBy({ top: dy(s), behavior: scrollBehavior(smooth) });
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

function zoom(dir: 1 | -1 | 0) {
  const st = useSettings.getState();
  const editor = !!document.activeElement?.closest('[data-pane="editor"]');
  const key = editor ? 'appearance.editorZoom' : 'appearance.previewZoom';
  const cur = editor ? st.settings.appearance.editorZoom : st.settings.appearance.previewZoom;
  const next =
    dir === 0 ? 1 : Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cur + dir * 0.1)) * 10) / 10;
  st.set(key, next);
}

export function readerCommands(): Command[] {
  return [
    {
      id: 'reader.lineDown',
      title: 'Scroll Down a Line',
      category: 'Reader',
      hidden: true,
      keys: [
        { keys: 'j', when: readKeys },
        {
          keys: 'ArrowDown',
          when: (c) => readKeys(c) && !document.activeElement?.closest('[data-scroll]'),
        },
      ],
      run: () => scrollBy(() => LINE, false),
    },
    {
      id: 'reader.lineUp',
      title: 'Scroll Up a Line',
      category: 'Reader',
      hidden: true,
      keys: [
        { keys: 'k', when: readKeys },
        {
          keys: 'ArrowUp',
          when: (c) => readKeys(c) && !document.activeElement?.closest('[data-scroll]'),
        },
      ],
      run: () => scrollBy(() => -LINE, false),
    },
    {
      id: 'reader.halfDown',
      title: 'Scroll Down Half a Page',
      category: 'Reader',
      hidden: true,
      keys: [{ keys: 'd', when: readKeys }],
      run: () => scrollBy((s) => s.clientHeight / 2, true),
    },
    {
      id: 'reader.halfUp',
      title: 'Scroll Up Half a Page',
      category: 'Reader',
      hidden: true,
      keys: [{ keys: 'u', when: readKeys }],
      run: () => scrollBy((s) => -s.clientHeight / 2, true),
    },
    {
      id: 'reader.pageDown',
      title: 'Scroll Down a Page',
      category: 'Reader',
      hidden: true,
      keys: [{ keys: 'Space', when: readKeys }],
      run: () => scrollBy((s) => s.clientHeight - LINE, true),
    },
    {
      id: 'reader.pageUp',
      title: 'Scroll Up a Page',
      category: 'Reader',
      hidden: true,
      keys: [{ keys: 'Shift+Space', when: readKeys }],
      run: () => scrollBy((s) => -(s.clientHeight - LINE), true),
    },
    {
      id: 'reader.top',
      title: 'Go to Top',
      category: 'Reader',
      when: hasDoc,
      keys: [{ keys: 'g g', when: readKeys }],
      run: () => previewScroller()?.scrollTo({ top: 0, behavior: scrollBehavior(true) }),
    },
    {
      id: 'reader.bottom',
      title: 'Go to Bottom',
      category: 'Reader',
      when: hasDoc,
      keys: [{ keys: 'Shift+G', when: readKeys }],
      run: () => {
        const s = previewScroller();
        s?.scrollTo({ top: s.scrollHeight, behavior: scrollBehavior(true) });
      },
    },
    {
      id: 'find.open',
      title: 'Find in Document',
      category: 'Reader',
      when: hasDoc,
      keys: [
        { keys: 'Mod+F', when: (c) => !c.editorFocus && useWorkspace.getState().mode === 'read' },
        { keys: '/', when: readKeys },
      ],
      run: openFind,
    },
    {
      id: 'find.next',
      title: 'Next Match',
      category: 'Reader',
      hidden: true,
      when: () => useReader.getState().find.open,
      keys: [{ keys: 'n', when: readKeys }],
      run: () => stepFind(1),
    },
    {
      id: 'find.prev',
      title: 'Previous Match',
      category: 'Reader',
      hidden: true,
      when: () => useReader.getState().find.open,
      keys: [{ keys: 'Shift+N', when: readKeys }],
      run: () => stepFind(-1),
    },
    {
      id: 'outline.toggle',
      title: 'Toggle Outline',
      category: 'View',
      when: hasDoc,
      keys: ['Mod+Shift+O', { keys: 'o', when: readKeys }],
      run: () => useWorkspace.getState().togglePanel('outline'),
    },
    {
      id: 'backlinks.toggle',
      title: 'Toggle Backlinks',
      category: 'View',
      when: hasDoc,
      keys: ['Mod+Shift+L', { keys: 'b', when: readKeys }],
      run: () => useWorkspace.getState().togglePanel('backlinks'),
    },
    {
      id: 'history.back',
      title: 'Go Back',
      category: 'Navigate',
      when: () => canGo(useHistory.getState(), -1),
      keys: ['Mod+[', { keys: '[', when: readKeys }],
      run: () => historyGo(-1),
    },
    {
      id: 'history.forward',
      title: 'Go Forward',
      category: 'Navigate',
      when: () => canGo(useHistory.getState(), 1),
      keys: ['Mod+]', { keys: ']', when: readKeys }],
      run: () => historyGo(1),
    },
    {
      id: 'zoom.in',
      title: 'Zoom In',
      category: 'View',
      keys: ['Mod+=', 'Mod+Shift+='],
      run: () => zoom(1),
    },
    { id: 'zoom.out', title: 'Zoom Out', category: 'View', keys: ['Mod+-'], run: () => zoom(-1) },
    {
      id: 'zoom.reset',
      title: 'Reset Zoom',
      category: 'View',
      keys: ['Mod+0'],
      run: () => zoom(0),
    },
    {
      id: 'reader.widthIncrease',
      title: 'Increase Reading Width',
      category: 'View',
      run: () => {
        const s = useSettings.getState();
        s.set('appearance.readingWidth', Math.min(140, s.settings.appearance.readingWidth + 5));
      },
    },
    {
      id: 'reader.widthDecrease',
      title: 'Decrease Reading Width',
      category: 'View',
      run: () => {
        const s = useSettings.getState();
        s.set('appearance.readingWidth', Math.max(40, s.settings.appearance.readingWidth - 5));
      },
    },
    {
      id: 'reader.toggleProgress',
      title: 'Toggle Reading Progress Bar',
      category: 'View',
      run: () => {
        const s = useSettings.getState();
        s.set('reader.progressBar', !s.settings.reader.progressBar);
      },
    },
  ];
}

/** Mouse back/forward buttons (buttons 3 and 4). */
export function bindMouseHistory(): () => void {
  const onUp = (e: MouseEvent) => {
    if (e.button === 3) {
      e.preventDefault();
      void historyGo(-1);
    } else if (e.button === 4) {
      e.preventDefault();
      void historyGo(1);
    }
  };
  window.addEventListener('mouseup', onUp);
  return () => window.removeEventListener('mouseup', onUp);
}
