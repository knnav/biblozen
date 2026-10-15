import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fuzzyFilter, type FuzzyResult } from './fuzzy';
import './Picker.css';

export interface PickerTab {
  id: string;
  label: string;
}

export interface PickerProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** Text used for fuzzy matching. */
  getText: (item: T) => string;
  renderItem: (item: T, match: FuzzyResult) => ReactNode;
  onAccept: (item: T, query: string) => void;
  onCancel: () => void;
  /** Fires as the highlighted item changes (live preview). */
  onActiveChange?: (item: T | null) => void;
  placeholder: string;
  label: string;
  initialQuery?: string;
  initialActiveId?: string;
  emptyText?: ReactNode;
  /** Shown above the list, e.g. filter tabs. */
  tabs?: PickerTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Query rewriting hook (e.g. switching modes on a prefix). */
  onQueryChange?: (q: string) => void;
  /** Disable internal filtering (caller filters). */
  filter?: boolean;
  footer?: ReactNode;
  limit?: number;
  /** Maps the typed query to the one used for fuzzy filtering. */
  queryForFilter?: (q: string) => string;
}

export function Picker<T>(props: PickerProps<T>) {
  const {
    items,
    getId,
    getText,
    renderItem,
    onAccept,
    onCancel,
    onActiveChange,
    placeholder,
    label,
    initialQuery = '',
    initialActiveId,
    emptyText = 'No matches',
    tabs,
    activeTab,
    onTabChange,
    onQueryChange,
    filter = true,
    footer,
    limit = 200,
    queryForFilter,
  } = props;
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const usedInitial = useRef(false);

  const results = useMemo(
    () =>
      filter
        ? fuzzyFilter(items, queryForFilter ? queryForFilter(query) : query, getText, limit)
        : items
            .slice(0, limit)
            .map((item) => ({ item, match: { score: 0, indices: [] } as FuzzyResult })),
    [items, query, getText, filter, limit, queryForFilter],
  );

  // Start on the initially active item (e.g. current theme) once.
  useLayoutEffect(() => {
    if (usedInitial.current || !initialActiveId) return;
    usedInitial.current = true;
    const i = results.findIndex((r) => getId(r.item) === initialActiveId);
    if (i >= 0) setActive(i);
  }, [results, initialActiveId, getId]);

  const clamped = Math.min(active, Math.max(0, results.length - 1));
  const current = results[clamped]?.item ?? null;

  useEffect(() => {
    onActiveChange?.(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the item changes
  }, [current]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${clamped}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [clamped]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const move = (d: number) => {
    if (!results.length) return;
    setActive((a) => (Math.min(a, results.length - 1) + d + results.length) % results.length);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        setActive((a) => Math.min(results.length - 1, a + 8));
        break;
      case 'PageUp':
        e.preventDefault();
        setActive((a) => Math.max(0, a - 8));
        break;
      case 'Enter':
        e.preventDefault();
        if (current) onAccept(current, query);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        break;
      case 'Tab':
        if (tabs?.length && onTabChange) {
          e.preventDefault();
          const i = tabs.findIndex((t) => t.id === activeTab);
          const next = tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length];
          onTabChange(next.id);
          setActive(0);
        }
        break;
    }
  };

  return (
    <div className="picker-backdrop" onMouseDown={onCancel}>
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="picker__input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={current ? `${listId}-${clamped}` : undefined}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            onQueryChange?.(e.target.value);
          }}
        />
        {tabs && (
          <div className="picker__tabs" role="tablist" aria-label="Filter">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={t.id === activeTab}
                className="picker__tab"
                tabIndex={-1}
                onClick={() => {
                  onTabChange?.(t.id);
                  setActive(0);
                  inputRef.current?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div ref={listRef} id={listId} className="picker__list" role="listbox" aria-label={label}>
          {results.length === 0 && <div className="picker__empty">{emptyText}</div>}
          {results.map(({ item, match }, i) => (
            <div
              key={getId(item)}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === clamped}
              className="picker__item"
              onMouseMove={() => i !== clamped && setActive(i)}
              onClick={() => onAccept(item, query)}
            >
              {renderItem(item, match)}
            </div>
          ))}
        </div>
        {footer && <div className="picker__footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Renders text with fuzzy-match indices highlighted. */
export function Highlight({
  text,
  indices,
  offset = 0,
}: {
  text: string;
  indices: number[];
  offset?: number;
}) {
  if (!indices.length) return <>{text}</>;
  const set = new Set(indices.map((i) => i - offset));
  const out: ReactNode[] = [];
  let buf = '';
  let inMatch = false;
  const flush = (key: number) => {
    if (!buf) return;
    out.push(inMatch ? <mark key={key}>{buf}</mark> : buf);
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m !== inMatch) {
      flush(i);
      inMatch = m;
    }
    buf += text[i];
  }
  flush(text.length);
  return <>{out}</>;
}
