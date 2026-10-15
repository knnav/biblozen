import { Palette, Type } from 'lucide-react';
import { useMemo } from 'react';
import { runCommand } from '../commands/registry';
import { useDocument, useDirty } from './document';
import { countWords, readingMinutes } from './stats';
import { useWorkspace } from './workspace';
import './StatusBar.css';

interface Props {
  themeName: string;
  readingStyleName: string;
}

export function StatusBar({ themeName, readingStyleName }: Props) {
  const text = useDocument((s) => s.text);
  const status = useDocument((s) => s.status);
  const cursor = useDocument((s) => s.cursor);
  const saving = useDocument((s) => s.saving);
  const dirty = useDirty();
  const mode = useWorkspace((s) => s.mode);
  const hint = useWorkspace((s) => s.hoverHint);
  const words = useMemo(() => (status === 'ready' ? countWords(text) : 0), [text, status]);
  const minutes = readingMinutes(words);

  return (
    <footer className="statusbar" aria-label="Status bar">
      <div className="statusbar__group">
        {status === 'ready' && (
          <>
            <span className="statusbar__item">
              {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            </span>
            <span className="statusbar__item">{minutes} min read</span>
            {mode === 'edit' && cursor && (
              <span className="statusbar__item">
                Ln {cursor.line}, Col {cursor.col}
              </span>
            )}
            <span
              className="statusbar__item statusbar__save"
              data-state={saving ? 'saving' : dirty ? 'dirty' : 'saved'}
            >
              {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
            </span>
          </>
        )}
      </div>
      <div className="statusbar__hint" aria-live="polite">
        {hint}
      </div>
      <div className="statusbar__group">
        <button
          className="statusbar__button"
          onClick={() => void runCommand('readingStyle.pick')}
          title="Reading style"
        >
          <Type size={12} aria-hidden />
          {readingStyleName}
        </button>
        <button
          className="statusbar__button"
          onClick={() => void runCommand('theme.pick')}
          title="Color theme"
        >
          <Palette size={12} aria-hidden />
          {themeName}
        </button>
      </div>
    </footer>
  );
}
