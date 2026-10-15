import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts, type ToastKind } from './toastStore';
import './Toasts.css';

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className="toast"
            data-kind={t.kind}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon className="toast__icon" size={16} strokeWidth={2} aria-hidden />
            <div className="toast__body">
              <div className="toast__message">{t.message}</div>
              {t.detail && <div className="toast__detail">{t.detail}</div>}
            </div>
            {t.action && (
              <button
                className="toast__action"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
