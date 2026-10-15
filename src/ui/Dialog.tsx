import { useEffect, useId, useRef } from 'react';
import { useDialog } from './dialog';
import './Dialog.css';

export function DialogHost() {
  const current = useDialog((s) => s.current);
  const titleId = useId();
  const msgId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!current) return;
    restore.current = document.activeElement as HTMLElement | null;
    const btn =
      ref.current?.querySelector<HTMLButtonElement>(`[data-id="${current.defaultId}"]`) ??
      ref.current?.querySelector<HTMLButtonElement>('button');
    btn?.focus();
    return () => restore.current?.focus?.();
  }, [current]);

  if (!current) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      current.resolve(null);
    } else if (e.key === 'Tab') {
      // Trap focus inside the dialog.
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={() => current.resolve(null)}>
      <div
        ref={ref}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={current.message ? msgId : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="dialog__title">
          {current.title}
        </h2>
        {current.message && (
          <p id={msgId} className="dialog__message">
            {current.message}
          </p>
        )}
        <div className="dialog__buttons">
          {current.buttons.map((b) => (
            <button
              key={b.id}
              data-id={b.id}
              className="button"
              data-kind={b.kind ?? 'default'}
              onClick={() => current.resolve(b.id === 'cancel' ? null : b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
