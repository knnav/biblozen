import { useEffect, useState } from 'react';
import { useDocument } from '../app/document';
import { useWorkspace } from '../app/workspace';
import { Preview } from './Preview';

/** SPEC §2: preview re-renders ~150 ms after typing stops while editing. */
export const PREVIEW_DEBOUNCE_MS = 150;

export function LivePreview() {
  const text = useDocument((s) => s.text);
  const path = useDocument((s) => s.path);
  const editing = useWorkspace((s) => s.mode === 'edit');
  const [shown, setShown] = useState({ text, path });

  useEffect(() => {
    // Immediate when not editing or when the document itself changed.
    if (!editing || path !== shown.path) {
      setShown({ text, path });
      return;
    }
    const t = setTimeout(() => setShown({ text, path }), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, path, editing, shown.path]);

  return <Preview text={shown.path === path ? shown.text : text} />;
}
