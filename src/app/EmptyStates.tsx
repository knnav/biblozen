import { FilePlus, FileText, FolderOpen, Search, X, AlertCircle, RotateCw } from 'lucide-react';
import { runCommand } from '../commands/registry';
import { basename, dirname } from '../platform/path';
import { applyState, patchRemoveRecentFolder, useAppState } from '../settings/appState';
import { startCreate } from '../tree/ops';
import { openFile, openPath } from './actions';
import { useDocument } from './document';
import { useShortcutLabel } from './useShortcut';
import './EmptyStates.css';

function Shortcut({ id }: { id: string }) {
  const label = useShortcutLabel(id);
  return label ? <kbd>{label}</kbd> : null;
}

export function NoFolder() {
  const recent = useAppState((s) => s.state.recentFolders);
  return (
    <div className="empty empty--welcome">
      <div className="empty__card">
        <div className="empty__mark" aria-hidden>
          <svg viewBox="0 0 64 64" width="56" height="56">
            <path
              d="M32 18c-6-4-14-5-22-3.5v32c8-1.5 16-.5 22 3.5z"
              fill="currentColor"
              opacity=".9"
            />
            <path
              d="M32 18c6-4 14-5 22-3.5v32c-8-1.5-16-.5-22 3.5z"
              fill="currentColor"
              opacity=".6"
            />
          </svg>
        </div>
        <h1 className="empty__title">Biblozen</h1>
        <p className="empty__lead">Open a folder of Markdown to start reading.</p>
        <div className="empty__actions">
          <button
            className="button"
            data-kind="primary"
            data-size="lg"
            onClick={() => void runCommand('folder.open')}
          >
            <FolderOpen size={15} /> Open Folder <Shortcut id="folder.open" />
          </button>
          <button className="button" data-size="lg" onClick={() => void runCommand('file.open')}>
            <FileText size={15} /> Open File <Shortcut id="file.open" />
          </button>
        </div>
        {recent.length > 0 && (
          <section className="empty__recent" aria-label="Recent folders">
            <h2>Recent</h2>
            <ul>
              {recent.map((r) => (
                <li key={r}>
                  <button className="empty__recent-open" onClick={() => void openPath(r)} title={r}>
                    <FolderOpen size={14} aria-hidden />
                    <span className="empty__recent-name">{basename(r)}</span>
                    <span className="empty__recent-path">{dirname(r)}</span>
                  </button>
                  <button
                    className="icon-button empty__recent-remove"
                    aria-label={`Remove ${basename(r)} from recent folders`}
                    title="Remove from list"
                    onClick={() => applyState(patchRemoveRecentFolder(r))}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="empty__hint">or drop a folder or file anywhere in this window</p>
      </div>
    </div>
  );
}

export function NoFile({ hasFiles }: { hasFiles: boolean }) {
  if (!hasFiles) {
    return (
      <div className="empty">
        <div className="empty__card">
          <FileText className="empty__icon" size={32} strokeWidth={1.25} aria-hidden />
          <p className="empty__lead">No Markdown files here yet.</p>
          <button className="button" data-kind="primary" onClick={() => startCreate('file')}>
            <FilePlus size={14} /> New File <Shortcut id="file.new" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="empty__card">
        <FileText className="empty__icon" size={32} strokeWidth={1.25} aria-hidden />
        <p className="empty__lead">Pick a file from the sidebar.</p>
        <dl className="empty__keys">
          <div>
            <dt>Quick open</dt>
            <dd>
              <Shortcut id="file.quickOpen" />
            </dd>
          </div>
          <div>
            <dt>Search in folder</dt>
            <dd>
              <Shortcut id="search.open" />
            </dd>
          </div>
          <div>
            <dt>All commands</dt>
            <dd>
              <Shortcut id="palette.open" />
            </dd>
          </div>
        </dl>
        <button
          className="button"
          data-kind="ghost"
          onClick={() => void runCommand('file.quickOpen')}
        >
          <Search size={14} /> Find a file
        </button>
      </div>
    </div>
  );
}

export function DocError() {
  const path = useDocument((s) => s.path);
  const error = useDocument((s) => s.error);
  return (
    <div className="empty">
      <div className="empty__card" role="alert">
        <AlertCircle
          className="empty__icon empty__icon--error"
          size={32}
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="empty__lead">Couldn’t open {path ? `“${basename(path)}”` : 'this file'}.</p>
        <p className="empty__detail">{error}</p>
        {path && (
          <button className="button" onClick={() => void openFile(path)}>
            <RotateCw size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function DocLoading() {
  return (
    <div className="empty" role="status" aria-label="Loading">
      <div className="doc-skeleton" aria-hidden>
        <span style={{ width: '45%', height: 22 }} />
        <span style={{ width: '92%' }} />
        <span style={{ width: '88%' }} />
        <span style={{ width: '70%' }} />
      </div>
    </div>
  );
}
