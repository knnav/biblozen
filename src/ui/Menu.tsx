import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './Menu.css';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export type MenuEntry = MenuItem | 'separator';

interface Props {
  x: number;
  y: number;
  items: MenuEntry[];
  label: string;
  onClose: () => void;
}

export function Menu({ x, y, items, label, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const actionable = items.filter((i): i is MenuItem => i !== 'separator' && !i.disabled);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      x: Math.max(pad, Math.min(x, window.innerWidth - r.width - pad)),
      y: Math.max(pad, Math.min(y, window.innerHeight - r.height - pad)),
    });
  }, [x, y]);

  useEffect(() => {
    ref.current?.focus();
    const close = () => onClose();
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  const activeId = actionable[active]?.id;

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % actionable.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + actionable.length) % actionable.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(actionable.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const it = actionable[active];
      if (it) {
        onClose();
        it.run();
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="menu-layer" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        className="menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={activeId ? `menu-${activeId}` : undefined}
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {items.map((it, i) =>
          it === 'separator' ? (
            <div key={`sep-${i}`} className="menu__separator" role="separator" />
          ) : (
            <div
              key={it.id}
              id={`menu-${it.id}`}
              role="menuitem"
              aria-disabled={it.disabled || undefined}
              className="menu__item"
              data-active={it.id === activeId}
              data-danger={it.danger || undefined}
              onMouseEnter={() => {
                const idx = actionable.indexOf(it);
                if (idx >= 0) setActive(idx);
              }}
              onClick={() => {
                if (it.disabled) return;
                onClose();
                it.run();
              }}
            >
              <span className="menu__icon" aria-hidden>
                {it.icon}
              </span>
              <span className="menu__label">{it.label}</span>
              {it.shortcut && <span className="menu__shortcut">{it.shortcut}</span>}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
