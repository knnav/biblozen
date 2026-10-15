import { BookOpen, Copy, Minus, PanelLeft, PenLine, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getPlatform } from '../platform';
import { basename } from '../platform/path';
import { runCommand } from '../commands/registry';
import { useShortcutLabel } from './useShortcut';
import { useWorkspace } from './workspace';
import './TitleBar.css';

interface Props {
  dirty: boolean;
}

export function TitleBar({ dirty }: Props) {
  const platform = getPlatform();
  const root = useWorkspace((s) => s.root);
  const file = useWorkspace((s) => s.file);
  const mode = useWorkspace((s) => s.mode);
  const [maximized, setMaximized] = useState(false);
  const mac = platform.os === 'macos';
  const folderName = root ? basename(root) : 'Biblozen';
  const fileName = file ? basename(file) : null;
  const treeKey = useShortcutLabel('tree.toggle');
  const modeKey = useShortcutLabel('mode.toggleEdit');

  useEffect(() => {
    const title = fileName ? `${dirty ? '● ' : ''}${fileName} — ${folderName}` : folderName;
    void platform.window.setTitle(title);
  }, [platform, fileName, folderName, dirty]);

  const toggleMax = async () => {
    await platform.window.toggleMaximize();
    setMaximized((m) => !m);
  };

  return (
    <header className="titlebar" data-os={platform.os} data-tauri-drag-region>
      {mac && <div className="titlebar__traffic" data-tauri-drag-region />}
      <div className="titlebar__left">
        {root && (
          <button
            className="titlebar__icon"
            onClick={() => void runCommand('tree.toggle')}
            title={`Toggle sidebar${treeKey ? ` (${treeKey})` : ''}`}
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="titlebar__title" data-tauri-drag-region>
        <span className="titlebar__folder" data-tauri-drag-region>
          {folderName}
        </span>
        {fileName && (
          <>
            <span className="titlebar__sep" data-tauri-drag-region aria-hidden>
              /
            </span>
            <span className="titlebar__file" data-tauri-drag-region>
              {fileName}
            </span>
            <span
              className="titlebar__dirty"
              data-visible={dirty}
              aria-label={dirty ? 'Unsaved changes' : undefined}
              data-tauri-drag-region
            />
          </>
        )}
      </div>
      <div className="titlebar__right">
        {file && (
          <button
            className="titlebar__icon"
            data-active={mode === 'edit'}
            onClick={() => void runCommand('mode.toggleEdit')}
            title={`${mode === 'read' ? 'Edit' : 'Read'}${modeKey ? ` (${modeKey})` : ''}`}
            aria-label={mode === 'read' ? 'Switch to edit mode' : 'Switch to read mode'}
            aria-pressed={mode === 'edit'}
          >
            {mode === 'read' ? (
              <PenLine size={15} strokeWidth={1.75} />
            ) : (
              <BookOpen size={15} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
      {!mac && (
        <div className="titlebar__controls">
          <button
            className="titlebar__control"
            onClick={() => void platform.window.minimize()}
            aria-label="Minimize"
          >
            <Minus size={16} strokeWidth={1.5} />
          </button>
          <button
            className="titlebar__control"
            onClick={() => void toggleMax()}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? (
              <Copy size={13} strokeWidth={1.5} />
            ) : (
              <Square size={13} strokeWidth={1.5} />
            )}
          </button>
          <button
            className="titlebar__control titlebar__control--close"
            onClick={() => void platform.window.close()}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </header>
  );
}
