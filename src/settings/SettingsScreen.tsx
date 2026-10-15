import { FolderOpen, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toastError } from '../app/toastStore';
import { getPlatform } from '../platform';
import { join } from '../platform/path';
import { BUILTIN, useThemes } from '../themes/engine';
import { READING_STYLES } from '../themes/readingStyles';
import { getPath } from './schema';
import { useSettings } from './store';
import './SettingsScreen.css';

type Control =
  | { kind: 'toggle' }
  | { kind: 'select'; options: () => { value: string; label: string }[] }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string; scale?: number }
  | { kind: 'text'; placeholder?: string }
  | { kind: 'list'; placeholder?: string }
  | { kind: 'action'; label: string; run: () => void | Promise<void> };

interface Row {
  key: string;
  group: string;
  label: string;
  description?: string;
  control: Control;
  /** Hide when this returns false. */
  visible?: () => boolean;
}

const themeOptions = (type: 'light' | 'dark') => () =>
  [...useThemes.getState().user, ...BUILTIN]
    .filter((t) => t.type === type)
    .map((t) => ({ value: t.id, label: t.source === 'user' ? `${t.name} (custom)` : t.name }));

const ROWS: Row[] = [
  {
    group: 'Appearance',
    key: 'theme.followOS',
    label: 'Follow system appearance',
    description: 'Switch between the light and dark theme with the OS.',
    control: { kind: 'toggle' },
  },
  {
    group: 'Appearance',
    key: 'theme.manual',
    label: 'Appearance',
    description: 'Used when not following the system.',
    control: {
      kind: 'select',
      options: () => [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
    visible: () => !useSettings.getState().settings.theme.followOS,
  },
  {
    group: 'Appearance',
    key: 'theme.light',
    label: 'Light theme',
    control: { kind: 'select', options: themeOptions('light') },
  },
  {
    group: 'Appearance',
    key: 'theme.dark',
    label: 'Dark theme',
    control: { kind: 'select', options: themeOptions('dark') },
  },
  {
    group: 'Appearance',
    key: 'readingStyle',
    label: 'Reading style',
    description: 'Typography for the preview. Colors come from the theme.',
    control: {
      kind: 'select',
      options: () => READING_STYLES.map((r) => ({ value: r.id, label: r.name })),
    },
  },
  {
    group: 'Appearance',
    key: 'appearance.readingWidth',
    label: 'Reading width',
    description: 'Maximum line length in the preview.',
    control: { kind: 'number', min: 40, max: 140, step: 5, unit: 'ch' },
  },
  {
    group: 'Appearance',
    key: 'appearance.previewZoom',
    label: 'Preview zoom',
    control: { kind: 'number', min: 50, max: 250, step: 10, unit: '%', scale: 100 },
  },
  {
    group: 'Appearance',
    key: 'appearance.editorZoom',
    label: 'Editor zoom',
    control: { kind: 'number', min: 50, max: 250, step: 10, unit: '%', scale: 100 },
  },
  {
    group: 'Appearance',
    key: 'reader.dropCap',
    label: 'Drop cap',
    description: 'Large first letter in the Book reading style.',
    control: { kind: 'toggle' },
  },

  {
    group: 'Reader',
    key: 'reader.progressBar',
    label: 'Reading progress bar',
    description: 'A thin bar under the title bar.',
    control: { kind: 'toggle' },
  },
  {
    group: 'Reader',
    key: 'reader.scrollMemory',
    label: 'Remember scroll position',
    description: 'Reopen each file where you left off.',
    control: { kind: 'toggle' },
  },
  {
    group: 'Reader',
    key: 'reader.remoteImages',
    label: 'Load remote images',
    description: 'Images from the web. Off shows a placeholder instead.',
    control: { kind: 'toggle' },
  },

  {
    group: 'Editor',
    key: 'editor.fontFamily',
    label: 'Font',
    description: 'Leave empty for JetBrains Mono.',
    control: { kind: 'text', placeholder: 'JetBrains Mono' },
  },
  {
    group: 'Editor',
    key: 'editor.fontSize',
    label: 'Font size',
    control: { kind: 'number', min: 10, max: 28, step: 1, unit: 'px' },
  },
  {
    group: 'Editor',
    key: 'editor.lineHeight',
    label: 'Line height',
    control: { kind: 'number', min: 1, max: 2.4, step: 0.05 },
  },
  { group: 'Editor', key: 'editor.softWrap', label: 'Soft wrap', control: { kind: 'toggle' } },
  { group: 'Editor', key: 'editor.vim', label: 'Vim mode', control: { kind: 'toggle' } },
  {
    group: 'Editor',
    key: 'editor.autosave',
    label: 'Autosave',
    control: {
      kind: 'select',
      options: () => [
        { value: 'off', label: 'Off' },
        { value: 'focus', label: 'When the window loses focus' },
        { value: 'idle', label: 'After a pause in typing' },
      ],
    },
  },
  {
    group: 'Editor',
    key: 'editor.autosaveDelaySec',
    label: 'Autosave delay',
    control: { kind: 'number', min: 1, max: 60, step: 1, unit: 's' },
    visible: () => useSettings.getState().settings.editor.autosave === 'idle',
  },
  {
    group: 'Editor',
    key: 'editor.scrollSync',
    label: 'Scroll sync',
    description: 'Keep editor and preview aligned in split view.',
    control: { kind: 'toggle' },
  },
  {
    group: 'Editor',
    key: 'editor.previewOnLeft',
    label: 'Preview on the left',
    control: { kind: 'toggle' },
  },
  {
    group: 'Editor',
    key: 'editor.imageFolder',
    label: 'Image folder',
    description: 'Pasted images go here, next to the document.',
    control: { kind: 'text', placeholder: 'assets' },
  },

  {
    group: 'Files',
    key: 'files.markdownOnly',
    label: 'Show Markdown files only',
    description: 'In the sidebar and in search.',
    control: { kind: 'toggle' },
  },
  {
    group: 'Files',
    key: 'files.ignored',
    label: 'Ignored names',
    description: 'Folders and files to hide, one per line (in addition to .gitignore).',
    control: { kind: 'list', placeholder: 'drafts\narchive' },
  },

  {
    group: 'Export',
    key: 'export.inlineImages',
    label: 'Embed images in HTML exports',
    control: { kind: 'toggle' },
  },
  {
    group: 'Export',
    key: 'export.pdfForceLight',
    label: 'Print with a light theme',
    description: 'Use the light theme for PDFs even in dark mode.',
    control: { kind: 'toggle' },
  },
  {
    group: 'Export',
    key: 'export.pdfBreakBeforeH1',
    label: 'New page before each top-level heading',
    control: { kind: 'toggle' },
  },

  {
    group: 'Advanced',
    key: '__dataFolder',
    label: 'Data folder',
    description: 'Settings, themes and window state live here.',
    control: {
      kind: 'action',
      label: 'Show Data Folder',
      run: async () => {
        const p = getPlatform();
        await p
          .reveal(join((await p.getDataDir()).path, 'settings.json'))
          .catch((e) => toastError(e, 'Couldn’t open'));
      },
    },
  },
  {
    group: 'Advanced',
    key: '__themesFolder',
    label: 'Custom themes',
    description: 'Drop VS Code or Biblozen theme files into the themes folder.',
    control: {
      kind: 'action',
      label: 'Show Themes Folder',
      run: async () => {
        const p = getPlatform();
        await p
          .reveal(join((await p.getDataDir()).path, 'themes'))
          .catch((e) => toastError(e, 'Couldn’t open'));
      },
    },
  },
];

const GROUPS = ['Appearance', 'Reader', 'Editor', 'Files', 'Export', 'Advanced'];

function Field({ row, id }: { row: Row; id: string }) {
  const value = useSettings((s) => getPath(s.settings, row.key));
  const set = useSettings((s) => s.set);
  const c = row.control;
  switch (c.kind) {
    case 'toggle':
      return (
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="switch"
          checked={!!value}
          onChange={(e) => set(row.key, e.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          id={id}
          className="select"
          value={String(value)}
          onChange={(e) => set(row.key, e.target.value)}
        >
          {c.options().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'number': {
      const scale = c.scale ?? 1;
      return (
        <span className="number-field">
          <input
            id={id}
            type="number"
            className="input input--number"
            min={c.min}
            max={c.max}
            step={c.step}
            value={Math.round(Number(value) * scale * 100) / 100}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) set(row.key, Math.min(c.max, Math.max(c.min, n)) / scale);
            }}
          />
          {c.unit && <span className="number-field__unit">{c.unit}</span>}
        </span>
      );
    }
    case 'text':
      return (
        <input
          id={id}
          className="input"
          value={String(value ?? '')}
          placeholder={c.placeholder}
          spellCheck={false}
          onChange={(e) => set(row.key, e.target.value)}
        />
      );
    case 'list':
      return (
        <textarea
          id={id}
          className="input input--list"
          value={(value as string[]).join('\n')}
          placeholder={c.placeholder}
          rows={3}
          spellCheck={false}
          onChange={(e) =>
            set(
              row.key,
              e.target.value
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
        />
      );
    case 'action':
      return (
        <button id={id} className="button" onClick={() => void c.run()}>
          <FolderOpen size={14} aria-hidden /> {c.label}
        </button>
      );
  }
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const settings = useSettings((s) => s.settings);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  useEffect(() => searchRef.current?.focus(), []);

  const rows = useMemo(() => {
    void settings; // visibility depends on settings
    const q = query.trim().toLowerCase();
    return ROWS.filter(
      (r) =>
        (r.visible?.() ?? true) &&
        (!q || `${r.group} ${r.label} ${r.description ?? ''} ${r.key}`.toLowerCase().includes(q)),
    );
  }, [query, settings]);

  const groups = GROUPS.filter((g) => rows.some((r) => r.group === g));

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="settings__header">
          <h2 id={`${baseId}-title`}>Settings</h2>
          <label className="settings__search">
            <Search size={14} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search settings"
              aria-label="Search settings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <div className="settings__main">
          <nav className="settings__nav" aria-label="Settings sections">
            {groups.map((g) => (
              <a
                key={g}
                href={`#${baseId}-${g}`}
                className="settings__nav-item"
                onClick={(e) => {
                  e.preventDefault();
                  bodyRef.current
                    ?.querySelector(`[data-group="${g}"]`)
                    ?.scrollIntoView({ block: 'start' });
                }}
              >
                {g}
              </a>
            ))}
          </nav>
          <div ref={bodyRef} className="settings__body">
            {groups.length === 0 && <p className="settings__empty">No settings match “{query}”.</p>}
            {groups.map((g) => (
              <section
                key={g}
                data-group={g}
                aria-labelledby={`${baseId}-${g}`}
                className="settings__group"
              >
                <h3 id={`${baseId}-${g}`}>{g}</h3>
                {rows
                  .filter((r) => r.group === g)
                  .map((r) => {
                    const id = `${baseId}-${r.key}`;
                    return (
                      <div key={r.key} className="settings__row" data-kind={r.control.kind}>
                        <div className="settings__text">
                          <label htmlFor={id}>{r.label}</label>
                          {r.description && (
                            <p className="settings__desc" id={`${id}-desc`}>
                              {r.description}
                            </p>
                          )}
                        </div>
                        <div className="settings__control">
                          <Field row={r} id={id} />
                        </div>
                      </div>
                    );
                  })}
              </section>
            ))}
            <p className="settings__footnote">
              Changes save to <code>settings.json</code> in the data folder, which you can also edit
              by hand.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
