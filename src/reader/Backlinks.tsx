import { FileText, Link2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { openFile } from '../app/actions';
import { useDocument } from '../app/document';
import { useWorkspace } from '../app/workspace';
import { queryBacklinks } from '../index/client';
import type { Backlink } from '../index/core';
import { useIndex } from '../index/store';
import { basename, dirname, relative } from '../platform/path';
import './Panels.css';

export function BacklinksPanel() {
  const path = useDocument((s) => s.path);
  const version = useIndex((s) => s.version);
  const status = useIndex((s) => s.status);
  const progress = useIndex((s) => s.progress);
  const root = useWorkspace((s) => s.root);
  const [links, setLinks] = useState<{ path: string | null; list: Backlink[] }>({
    path: null,
    list: [],
  });

  useEffect(() => {
    if (!path) return;
    let live = true;
    void queryBacklinks(path).then((list) => live && setLinks({ path, list }));
    return () => {
      live = false;
    };
  }, [path, version]);

  const groups = useMemo(() => {
    const m = new Map<string, Backlink[]>();
    for (const b of links.path === path ? links.list : [])
      m.set(b.source, [...(m.get(b.source) ?? []), b]);
    return [...m.entries()];
  }, [links, path]);

  const loading = status === 'building' && groups.length === 0;

  return (
    <section className="panel" aria-label="Backlinks">
      <header className="panel__header">
        <Link2 size={13} aria-hidden />
        <h2>
          Backlinks{groups.length > 0 && <span className="panel__count">{groups.length}</span>}
        </h2>
        <button
          className="icon-button"
          aria-label="Close backlinks"
          onClick={() => useWorkspace.getState().togglePanel('backlinks')}
        >
          <X size={13} />
        </button>
      </header>
      {loading ? (
        <p className="panel__empty" role="status">
          Indexing notes… {progress.total > 0 && `${progress.done} / ${progress.total}`}
        </p>
      ) : groups.length === 0 ? (
        <p className="panel__empty">No other notes link here.</p>
      ) : (
        <div className="panel__body">
          <ul className="backlinks" aria-label="Notes linking here">
            {groups.map(([source, list]) => {
              const dir = root ? relative(root, dirname(source)) : dirname(source);
              return (
                <li key={source} className="backlinks__group">
                  <div className="backlinks__file" title={source}>
                    <FileText size={13} aria-hidden />
                    <span className="backlinks__name">
                      {basename(source).replace(/\.md$/i, '')}
                    </span>
                    {dir !== '.' && <span className="backlinks__dir">{dir}</span>}
                  </div>
                  {list.map((b) => (
                    <button
                      key={b.line}
                      className="backlinks__snippet"
                      onClick={() => void openFile(source, { line: b.line })}
                      title={`Open ${basename(source)} at line ${b.line + 1}`}
                    >
                      {b.context}
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
