import { ListTree, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useWorkspace } from '../app/workspace';
import { jumpToAnchor } from './nav';
import { useReader } from './store';
import './Panels.css';

export function OutlinePanel() {
  const headings = useReader((s) => s.headings);
  const active = useReader((s) => s.activeSlug);
  const listRef = useRef<HTMLOListElement>(null);
  const minLevel = headings.reduce((m, h) => Math.min(m, h.level), 6);

  useEffect(() => {
    if (!active) return;
    listRef.current
      ?.querySelector(`[data-slug="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <section className="panel" aria-label="Outline">
      <header className="panel__header">
        <ListTree size={13} aria-hidden />
        <h2>Outline</h2>
        <button
          className="icon-button"
          aria-label="Close outline"
          onClick={() => useWorkspace.getState().togglePanel('outline')}
        >
          <X size={13} />
        </button>
      </header>
      {headings.length === 0 ? (
        <p className="panel__empty">No headings in this document.</p>
      ) : (
        <nav aria-label="Document outline">
          <ol ref={listRef} className="outline">
            {headings.map((h) => (
              <li key={h.slug}>
                <a
                  href={`#${h.slug}`}
                  data-slug={h.slug}
                  aria-current={h.slug === active ? 'location' : undefined}
                  className="outline__item"
                  style={{ paddingLeft: `calc(var(--space-3) + ${(h.level - minLevel) * 12}px)` }}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpToAnchor(h.slug);
                  }}
                >
                  {h.text || '(untitled)'}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </section>
  );
}
