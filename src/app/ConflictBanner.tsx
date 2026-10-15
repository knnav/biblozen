import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { basename } from '../platform/path';
import { diffLines } from './diff';
import { useDocument } from './document';
import { keepMine, reloadFromDisk } from './editing';
import { saveDocument } from './save';
import { closeDocument } from './actions';
import './ConflictBanner.css';

function DiffDialog({ onClose }: { onClose: () => void }) {
  const text = useDocument((s) => s.text);
  const disk = useDocument((s) => s.conflict?.diskText ?? '');
  const ops = diffLines(disk, text);
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="diff-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Differences between disk and editor"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        <header className="diff-dialog__header">
          <h2>Disk vs. your changes</h2>
          <span className="diff-legend diff-legend--del">on disk</span>
          <span className="diff-legend diff-legend--add">yours</span>
          <button className="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="diff-dialog__body">
          {ops === null ? (
            <p className="panel__empty">The files are too large to compare here.</p>
          ) : (
            <pre className="diff">
              {ops.map((o, i) => (
                <div key={i} className={`diff__line diff__line--${o.kind}`}>
                  <span className="diff__sign" aria-hidden>
                    {o.kind === 'add' ? '+' : o.kind === 'del' ? '−' : ' '}
                  </span>
                  {o.text || ' '}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConflictBanner() {
  const conflict = useDocument((s) => s.conflict);
  const path = useDocument((s) => s.path);
  const [showDiff, setShowDiff] = useState(false);
  if (!conflict || !path) return null;
  const deleted = conflict.diskText === null;
  return (
    <>
      <div className="conflict-banner" role="alert">
        <AlertTriangle size={15} aria-hidden />
        <span className="conflict-banner__text">
          <strong>{basename(path)}</strong> {deleted ? 'was deleted on disk.' : 'changed on disk.'}{' '}
          You have unsaved changes.
        </span>
        {deleted ? (
          <>
            <button className="button" data-kind="primary" onClick={() => void saveDocument()}>
              Save Again
            </button>
            <button className="button" onClick={() => keepMine()}>
              Keep Editing
            </button>
            <button className="button" data-kind="ghost" onClick={() => closeDocument()}>
              Close File
            </button>
          </>
        ) : (
          <>
            <button className="button" onClick={() => void reloadFromDisk()}>
              Reload
            </button>
            <button className="button" data-kind="primary" onClick={() => keepMine()}>
              Keep Mine
            </button>
            <button className="button" data-kind="ghost" onClick={() => setShowDiff(true)}>
              Show Diff
            </button>
          </>
        )}
      </div>
      {showDiff && <DiffDialog onClose={() => setShowDiff(false)} />}
    </>
  );
}
