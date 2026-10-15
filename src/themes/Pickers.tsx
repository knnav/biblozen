import { Check } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from '../app/toasts';
import { Highlight, Picker } from '../commands/Picker';
import { useSettings } from '../settings/store';
import { activeThemeId, allThemes, chooseTheme, previewTheme, useThemes } from './engine';
import { READING_STYLES, type ReadingStyle } from './readingStyles';
import type { ThemeDef } from './types';
import './Pickers.css';

function Swatches({ t }: { t: ThemeDef }) {
  const k = t.tokens;
  return (
    <span
      className="theme-swatch"
      style={{ background: k['bg.base'], borderColor: k['border.strong'] }}
      aria-hidden
    >
      <span style={{ background: k['fg.base'] }} />
      <span style={{ background: k['fg.link'] }} />
      <span style={{ background: k.accent }} />
      <span style={{ background: k['callout.tip'] }} />
    </span>
  );
}

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const settingsTheme = useSettings((s) => s.settings.theme);
  const user = useThemes((s) => s.user);
  const current = activeThemeId(settingsTheme);
  const [tab, setTab] = useState<'all' | 'light' | 'dark'>('all');
  const committed = useRef(false);
  const items = useMemo(() => {
    void user;
    const list = allThemes();
    return tab === 'all' ? list : list.filter((t) => t.type === tab);
  }, [tab, user]);

  const close = () => {
    if (!committed.current) previewTheme(null);
    onClose();
  };

  return (
    <Picker
      label="Color theme"
      placeholder="Search themes… (↑↓ to preview)"
      items={items}
      getId={(t) => t.id}
      getText={(t) => t.name}
      initialActiveId={current}
      tabs={[
        { id: 'all', label: 'All' },
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
      onActiveChange={(t) => previewTheme(t?.id ?? null)}
      onCancel={close}
      onAccept={(t) => {
        committed.current = true;
        const { stoppedFollowing } = chooseTheme(t.id);
        onClose();
        if (stoppedFollowing) {
          toast(`Using ${t.name} instead of following the system appearance`, 'info', {
            action: {
              label: 'Follow system',
              run: () => useSettings.getState().set('theme.followOS', true),
            },
          });
        }
      }}
      renderItem={(t, m) => (
        <div className="picker-row">
          <Swatches t={t} />
          <span className="picker-row__main">
            <Highlight text={t.name} indices={m.indices} />
          </span>
          {t.source === 'user' && <span className="theme-badge">Custom</span>}
          <span className="picker-row__detail">{t.type === 'dark' ? 'Dark' : 'Light'}</span>
          {t.id === current && (
            <Check size={14} className="picker-row__check" aria-label="Current" />
          )}
        </div>
      )}
      footer={
        <>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> preview
          </span>
          <span>
            <kbd>↵</kbd> apply
          </span>
          <span>
            <kbd>Tab</kbd> light / dark
          </span>
          <span>
            <kbd>Esc</kbd> revert
          </span>
        </>
      }
    />
  );
}

export function ReadingStylePicker({ onClose }: { onClose: () => void }) {
  const current = useSettings((s) => s.settings.readingStyle);
  const original = useRef(current);
  const committed = useRef(false);
  const set = useSettings((s) => s.set);
  // Live preview writes straight to the preview root, not settings.
  const preview = (id: string | null) => {
    for (const el of document.querySelectorAll<HTMLElement>('.markdown-body')) {
      el.dataset.readingStyle = id ?? original.current;
    }
  };
  return (
    <Picker<ReadingStyle>
      label="Reading style"
      placeholder="Search reading styles…"
      items={READING_STYLES}
      getId={(r) => r.id}
      getText={(r) => r.name}
      initialActiveId={current}
      onActiveChange={(r) => preview(r?.id ?? null)}
      onCancel={() => {
        if (!committed.current) preview(null);
        onClose();
      }}
      onAccept={(r) => {
        committed.current = true;
        set('readingStyle', r.id);
        onClose();
      }}
      renderItem={(r, m) => (
        <div className="picker-row">
          <span className="reading-sample" style={{ fontFamily: r.sampleFont }} aria-hidden>
            Aa
          </span>
          <span className="picker-row__main">
            <Highlight text={r.name} indices={m.indices} />
            <span className="picker-row__sub">{r.description}</span>
          </span>
          {r.id === current && (
            <Check size={14} className="picker-row__check" aria-label="Current" />
          )}
        </div>
      )}
    />
  );
}
