import { ChevronsDownUp, FilePlus, FileText, Files, FolderPlus, RotateCw } from 'lucide-react';
import { refreshTree } from '../app/actions';
import { useShortcutLabel } from '../app/useShortcut';
import { useWorkspace } from '../app/workspace';
import { basename, isMarkdown } from '../platform/path';
import { useSettings } from '../settings/store';
import { countFiles, filterTree } from './model';
import { startCreate } from './ops';
import { useTree } from './store';
import { Tree } from './Tree';
import './Sidebar.css';

export function Sidebar() {
  const root = useWorkspace((s) => s.root);
  const listing = useTree((s) => s.listing);
  const loading = useTree((s) => s.loading);
  const error = useTree((s) => s.error);
  const truncated = useTree((s) => s.truncated);
  const markdownOnly = useSettings((s) => s.settings.files.markdownOnly);
  const setSetting = useSettings((s) => s.set);
  const newFileKey = useShortcutLabel('file.new');

  if (!root) return null;

  const visible = listing ? filterTree(listing, markdownOnly) : null;
  const mdCount = listing ? countFiles(listing, isMarkdown) : 0;
  const empty = visible && (visible.children?.length ?? 0) === 0;

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel__header">
        <span className="sidebar-panel__title" title={root}>
          {basename(root)}
        </span>
        <div className="sidebar-panel__actions">
          <button
            className="icon-button"
            onClick={() => startCreate('file')}
            title={`New File${newFileKey ? ` (${newFileKey})` : ''}`}
            aria-label="New file"
          >
            <FilePlus size={15} strokeWidth={1.75} />
          </button>
          <button
            className="icon-button"
            onClick={() => startCreate('dir')}
            title="New Folder"
            aria-label="New folder"
          >
            <FolderPlus size={15} strokeWidth={1.75} />
          </button>
          <button
            className="icon-button"
            onClick={() => setSetting('files.markdownOnly', !markdownOnly)}
            aria-pressed={!markdownOnly}
            title={
              markdownOnly
                ? 'Showing Markdown only — click to show all files'
                : 'Showing all files — click to show Markdown only'
            }
            aria-label="Show all files"
          >
            {markdownOnly ? (
              <FileText size={15} strokeWidth={1.75} />
            ) : (
              <Files size={15} strokeWidth={1.75} />
            )}
          </button>
          <button
            className="icon-button"
            onClick={() => useTree.setState({ expanded: new Set() })}
            title="Collapse All Folders"
            aria-label="Collapse all folders"
          >
            <ChevronsDownUp size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {loading && !listing && (
        <div className="sidebar-panel__skeleton" aria-label="Loading files" role="status">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} style={{ width: `${45 + ((i * 37) % 40)}%`, marginLeft: (i % 3) * 12 }} />
          ))}
        </div>
      )}
      {error && (
        <div className="sidebar-panel__state" role="alert">
          <p>Couldn’t read this folder.</p>
          <p className="sidebar-panel__detail">{error}</p>
          <button className="button" onClick={() => void refreshTree()}>
            <RotateCw size={13} /> Try again
          </button>
        </div>
      )}
      {listing && empty && (
        <div className="sidebar-panel__state">
          <p>{markdownOnly && mdCount === 0 ? 'No Markdown files' : 'This folder is empty'}</p>
          <button className="button" data-kind="primary" onClick={() => startCreate('file')}>
            <FilePlus size={13} /> New File
          </button>
        </div>
      )}
      {listing && <Tree />}
      {truncated && (
        <div className="sidebar-panel__note" role="status">
          This folder is very large — only the first 50,000 entries are shown.
        </div>
      )}
    </div>
  );
}
