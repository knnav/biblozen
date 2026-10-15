import { useRef, type ReactNode } from 'react';
import { CommandPalette } from '../commands/Palette';
import { DialogHost } from '../ui/Dialog';
import { Divider } from './Divider';
import { useDirty } from './document';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { Toasts } from './Toasts';
import { TREE_MAX, TREE_MIN, useWorkspace } from './workspace';
import { Workarea } from './Workarea';
import './Shell.css';

/** Dragging the sidebar this far below its min width collapses it. */
const COLLAPSE_SLOP = 60;

interface Props {
  sidebar: ReactNode;
  /** False when there's nothing to show in the sidebar (no folder open). */
  sidebarAvailable: boolean;
  /** Replaces the editor/preview workarea (empty states). */
  main?: ReactNode;
  editor: ReactNode;
  preview: ReactNode;
  /** Extra overlays (theme picker, quick open, …) keyed by kind. */
  overlays?: Partial<Record<string, ReactNode>>;
  banner?: ReactNode;
  progress?: ReactNode;
  /** Right-hand panels (outline, backlinks). */
  aside?: ReactNode;
  themeName: string;
  readingStyleName: string;
}

export function Shell({
  sidebar,
  sidebarAvailable,
  main,
  editor,
  preview,
  overlays,
  banner,
  progress,
  aside,
  themeName,
  readingStyleName,
}: Props) {
  const focusMode = useWorkspace((s) => s.focusMode);
  const treeWidth = useWorkspace((s) => s.treeWidth);
  const collapsed = useWorkspace((s) => s.treeCollapsed);
  const overlay = useWorkspace((s) => s.overlay);
  const closeOverlay = useWorkspace((s) => s.closeOverlay);
  const dirty = useDirty();
  const dragStart = useRef(treeWidth);

  const sidebarHidden = collapsed || focusMode || !sidebarAvailable;

  return (
    <div className="shell" data-focus={focusMode}>
      <TitleBar dirty={dirty} />
      <div className="shell__body">
        <aside
          className="sidebar"
          data-collapsed={sidebarHidden}
          style={{ width: sidebarHidden ? 0 : treeWidth }}
          aria-label="Sidebar"
          aria-hidden={sidebarHidden}
          inert={sidebarHidden}
        >
          <div className="sidebar__inner" style={{ width: treeWidth }}>
            {sidebar}
          </div>
        </aside>
        {!sidebarHidden && (
          <Divider
            label="Resize sidebar"
            value={treeWidth}
            min={TREE_MIN}
            max={TREE_MAX}
            onDragStart={() => (dragStart.current = useWorkspace.getState().treeWidth)}
            onDrag={(dx, done) => {
              const w = dragStart.current + dx;
              const ws = useWorkspace.getState();
              if (w < TREE_MIN - COLLAPSE_SLOP) {
                if (done) {
                  ws.setTreeWidth(dragStart.current);
                  ws.setTreeCollapsed(true);
                }
                return;
              }
              ws.setTreeWidth(w, done);
            }}
            onDoubleClick={() => useWorkspace.getState().setTreeWidth(260)}
            onStep={(d, big) => {
              const ws = useWorkspace.getState();
              ws.setTreeWidth(ws.treeWidth + d * (big ? 40 : 10));
            }}
          />
        )}
        <main className="shell__content">
          {progress}
          {banner}
          {main ?? <Workarea editor={editor} preview={preview} />}
        </main>
        {!main && aside}
      </div>
      <StatusBar themeName={themeName} readingStyleName={readingStyleName} />
      {overlay === 'palette' && <CommandPalette onClose={closeOverlay} />}
      {overlay && overlay !== 'palette' && overlays?.[overlay]}
      <DialogHost />
      <Toasts />
    </div>
  );
}
