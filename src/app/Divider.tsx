import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import './Divider.css';

interface Props {
  /** Accessible name, e.g. "Resize sidebar". */
  label: string;
  /** Current value for aria (px or ratio*100). */
  value: number;
  min: number;
  max: number;
  /** Called with the pointer delta in px since drag start. `done` on release. */
  onDrag: (deltaPx: number, done: boolean) => void;
  onDragStart?: () => void;
  onDoubleClick?: () => void;
  /** Keyboard step handler: +1 / -1. */
  onStep: (dir: 1 | -1, big: boolean) => void;
}

export function Divider({
  label,
  value,
  min,
  max,
  onDrag,
  onDragStart,
  onDoubleClick,
  onStep,
}: Props) {
  const start = useRef<number | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.dataset.resizing = 'true';
    onDragStart?.();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    onDrag(e.clientX - start.current, false);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    onDrag(e.clientX - start.current, true);
    start.current = null;
    delete document.body.dataset.resizing;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onStep(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
    } else if (e.key === 'Enter' && onDoubleClick) {
      e.preventDefault();
      onDoubleClick();
    }
  };

  return (
    <div
      className="divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );
}
