import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { closeFind, setFind, stepFind, useReader } from './store';
import './FindBar.css';

export function FindBar() {
  const find = useReader((s) => s.find);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (find.open) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [find.open, find.focusSeq]);

  if (!find.open) return null;
  const status = find.query
    ? find.count
      ? `${find.index + 1} of ${find.count}`
      : 'No results'
    : '';

  const close = () => {
    closeFind();
    document.querySelector<HTMLElement>('[data-pane="preview"] [data-scroll]')?.focus();
  };

  return (
    <div className="findbar" role="search" aria-label="Find in document">
      <input
        ref={ref}
        className="findbar__input"
        placeholder="Find in document"
        aria-label="Find in document"
        value={find.query}
        spellCheck={false}
        onChange={(e) => setFind({ query: e.target.value, index: 0 })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            stepFind(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      />
      <span
        className="findbar__count"
        aria-live="polite"
        data-empty={find.query && !find.count ? true : undefined}
      >
        {status}
      </span>
      <button
        className="icon-button"
        aria-label="Previous match"
        onClick={() => stepFind(-1)}
        disabled={!find.count}
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="icon-button"
        aria-label="Next match"
        onClick={() => stepFind(1)}
        disabled={!find.count}
      >
        <ChevronDown size={14} />
      </button>
      <button className="icon-button" aria-label="Close find" onClick={close}>
        <X size={14} />
      </button>
    </div>
  );
}
