import { CaseSensitive, FileText, Regex, WholeWord, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { openFile } from '../app/actions';
import { useWorkspace } from '../app/workspace';
import { getPlatform } from '../platform';
import { basename, dirname, relative } from '../platform/path';
import { errorMessage, type FileMatches, type SearchSummary } from '../platform/types';
import { setFind } from '../reader/store';
import { useSettings } from '../settings/store';
import './SearchPanel.css';

function Marked({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={i}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

interface Opts {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

let lastQuery = '';
let lastOpts: Opts = { caseSensitive: false, wholeWord: false, regex: false };

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const root = useWorkspace((s) => s.root);
  const markdownOnly = useSettings((s) => s.settings.files.markdownOnly);
  const ignored = useSettings((s) => s.settings.files.ignored);
  const [query, setQuery] = useState(lastQuery);
  const [opts, setOpts] = useState<Opts>(lastOpts);
  const [results, setResults] = useState<FileMatches[]>([]);
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    lastQuery = query;
    lastOpts = opts;
    if (!root || !query.trim()) {
      setResults([]);
      setSummary(null);
      setError(null);
      setBusy(false);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      const acc: FileMatches[] = [];
      let flush = 0;
      setBusy(true);
      setError(null);
      setResults([]);
      setActive(0);
      void getPlatform()
        .search(root, query, { ...opts, markdownOnly }, ignored, (f) => {
          if (!live) return;
          acc.push(f);
          cancelAnimationFrame(flush);
          flush = requestAnimationFrame(() => live && setResults([...acc]));
        })
        .then((s) => {
          if (!live) return;
          setResults([...acc]);
          setSummary(s);
        })
        .catch((e) => live && setError(errorMessage(e)))
        .finally(() => live && setBusy(false));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, opts, root, markdownOnly, ignored]);

  // Flattened list of result lines for keyboard navigation.
  const flat = useMemo(
    () => results.flatMap((f) => f.matches.map((m) => ({ path: f.path, m }))),
    [results],
  );

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (i: number) => {
    const hit = flat[i];
    if (!hit) return;
    onClose();
    void openFile(hit.path, { line: hit.m.line, mode: 'read' }).then(() => {
      // Highlight the term in the document when it's plain text.
      if (!opts.regex) setFind({ open: true, query, index: 0 });
    });
  };

  const toggle = (k: keyof Opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  let idx = 0;
  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <div
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search in folder"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(flat.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            open(active);
          } else if (e.altKey && ['c', 'w', 'r'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            toggle(
              ({ c: 'caseSensitive', w: 'wholeWord', r: 'regex' } as const)[
                e.key.toLowerCase() as 'c' | 'w' | 'r'
              ],
            );
          }
        }}
      >
        <div className="search-panel__bar">
          <input
            ref={inputRef}
            className="search-panel__input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
            aria-label="Search in folder"
            placeholder="Search in folder…"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="icon-button"
            aria-pressed={opts.caseSensitive}
            title="Match case (Alt+C)"
            aria-label="Match case"
            onClick={() => toggle('caseSensitive')}
          >
            <CaseSensitive size={16} />
          </button>
          <button
            className="icon-button"
            aria-pressed={opts.wholeWord}
            title="Whole word (Alt+W)"
            aria-label="Whole word"
            onClick={() => toggle('wholeWord')}
          >
            <WholeWord size={16} />
          </button>
          <button
            className="icon-button"
            aria-pressed={opts.regex}
            title="Regular expression (Alt+R)"
            aria-label="Regular expression"
            onClick={() => toggle('regex')}
          >
            <Regex size={16} />
          </button>
          <button className="icon-button" aria-label="Close search" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="search-panel__status" role="status" aria-live="polite">
          {error
            ? error
            : busy && !results.length
              ? 'Searching…'
              : summary && query
                ? summary.matches
                  ? `${summary.matches.toLocaleString()} ${summary.matches === 1 ? 'result' : 'results'} in ${summary.files} ${summary.files === 1 ? 'file' : 'files'}${summary.truncated ? ' — showing the first ones' : ''}`
                  : 'No results'
                : query
                  ? ''
                  : `Search ${markdownOnly ? 'Markdown files' : 'all files'} in this folder`}
        </div>
        <div
          ref={listRef}
          id={listId}
          className="search-panel__results"
          role="listbox"
          aria-label="Results"
        >
          {results.map((f) => (
            <section key={f.path} className="search-file" aria-label={basename(f.path)}>
              <header className="search-file__header">
                <FileText size={13} aria-hidden />
                <span className="search-file__name">{basename(f.path)}</span>
                <span className="search-file__dir">
                  {root ? relative(root, dirname(f.path)).replace(/^\.$/, '') : ''}
                </span>
                <span className="search-file__count">{f.matches.length}</span>
              </header>
              {f.matches.map((m) => {
                const i = idx++;
                return (
                  <div
                    key={m.line}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    className="search-hit"
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => open(i)}
                  >
                    <span className="search-hit__line">{m.line + 1}</span>
                    <span className="search-hit__text">
                      <Marked
                        text={m.text.trimStart()}
                        ranges={m.ranges.map(([a, b]) => {
                          const cut = m.text.length - m.text.trimStart().length;
                          return [a - cut, b - cut] as [number, number];
                        })}
                      />
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
