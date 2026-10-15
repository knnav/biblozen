import { useEffect, useRef } from 'react';
import { useSettings } from '../settings/store';
import { attach, detach, scrollEditorToLine } from './controller';
import { takePendingTopLine } from './position';
import './Editor.css';

export function Editor() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useSettings((st) => st.settings.editor);
  const zoom = useSettings((st) => st.settings.appearance.editorZoom);
  const width = useSettings((st) => st.settings.appearance.readingWidth);

  useEffect(() => {
    const el = ref.current!;
    attach(el);
    const pending = takePendingTopLine('editor');
    if (pending !== null) requestAnimationFrame(() => scrollEditorToLine(pending));
    return () => detach();
  }, []);

  return (
    <div
      ref={ref}
      className="editor-host"
      style={{
        ['--editor-font' as string]: s.fontFamily || undefined,
        ['--editor-size' as string]: `${s.fontSize}px`,
        ['--editor-leading' as string]: s.lineHeight,
        ['--editor-zoom' as string]: zoom,
        ['--reading-width' as string]: `${width}ch`,
      }}
    />
  );
}
