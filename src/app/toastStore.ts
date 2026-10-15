import { create } from 'zustand';
import { errorMessage } from '../platform/types';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
  action?: { label: string; run: () => void };
  /** ms; 0 = sticky */
  timeout: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'timeout'> & { timeout?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    const timeout = t.timeout ?? (t.kind === 'error' ? 8000 : 4000);
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id, timeout }] }));
    if (timeout > 0) setTimeout(() => get().dismiss(id), timeout);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(
  message: string,
  kind: ToastKind = 'info',
  extra: Partial<Toast> = {},
): number {
  return useToasts.getState().push({ message, kind, ...extra });
}

export function toastError(e: unknown, prefix?: string): number {
  const msg = errorMessage(e);
  return toast(prefix ? `${prefix}: ${msg}` : msg, 'error');
}
