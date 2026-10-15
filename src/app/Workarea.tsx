import { useRef, type ReactNode } from 'react';
import { useSettings } from '../settings/store';
import { SplitSync } from '../editor/SplitSync';
import { Divider } from './Divider';
import { paneLayout } from './modes';
import { SPLIT_MAX, SPLIT_MIN, useWorkspace } from './workspace';
import './Workarea.css';

export function Workarea({ editor, preview }: { editor: ReactNode; preview: ReactNode }) {
  const layout = useWorkspace(paneLayout);
  const ratio = useWorkspace((s) => s.splitRatio);
  const previewLeft = useSettings((s) => s.settings.editor.previewOnLeft);
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef(ratio);

  const editorPane = (
    <section
      key="editor"
      className="pane pane--editor"
      aria-label="Editor"
      data-pane="editor"
      tabIndex={-1}
    >
      {editor}
    </section>
  );
  const previewPane = (
    <section
      key="preview"
      className="pane pane--preview"
      aria-label="Preview"
      data-pane="preview"
      tabIndex={-1}
    >
      {preview}
    </section>
  );

  if (layout === 'read') {
    return (
      <div className="workarea" data-layout="read">
        {previewPane}
      </div>
    );
  }
  if (layout === 'editor') {
    return (
      <div className="workarea" data-layout="editor">
        {editorPane}
      </div>
    );
  }

  // Split: the first pane's width is `ratio` of the whole.
  const [first, second] = previewLeft ? [previewPane, editorPane] : [editorPane, previewPane];
  return (
    <div
      className="workarea"
      data-layout="split"
      ref={ref}
      style={{ ['--split' as string]: ratio }}
    >
      <div className="workarea__first">{first}</div>
      <Divider
        label="Resize editor and preview"
        value={ratio * 100}
        min={SPLIT_MIN * 100}
        max={SPLIT_MAX * 100}
        onDragStart={() => (start.current = useWorkspace.getState().splitRatio)}
        onDrag={(dx, done) => {
          const w = ref.current?.clientWidth || 1;
          useWorkspace.getState().setSplitRatio(start.current + dx / w, done);
        }}
        onDoubleClick={() => useWorkspace.getState().setSplitRatio(0.5)}
        onStep={(d, big) => {
          const ws = useWorkspace.getState();
          ws.setSplitRatio(ws.splitRatio + d * (big ? 0.1 : 0.02));
        }}
      />
      <div className="workarea__second">{second}</div>
      <SplitSync />
    </div>
  );
}
