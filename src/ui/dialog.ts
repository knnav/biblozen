import { create } from 'zustand';

export interface DialogButton {
  id: string;
  label: string;
  kind?: 'primary' | 'danger' | 'default';
}

export interface DialogRequest {
  title: string;
  message?: string;
  buttons: DialogButton[];
  /** Button id chosen on Enter. Escape always resolves null (cancel). */
  defaultId?: string;
}

interface DialogStore {
  current: (DialogRequest & { resolve: (id: string | null) => void }) | null;
}

export const useDialog = create<DialogStore>(() => ({ current: null }));

/** Shows a modal dialog; resolves with the chosen button id, or null on cancel. */
export function ask(req: DialogRequest): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.getState().current?.resolve(null);
    useDialog.setState({
      current: {
        ...req,
        resolve: (id) => {
          useDialog.setState({ current: null });
          resolve(id);
        },
      },
    });
  });
}

export async function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  const r = await ask({
    title: opts.title,
    message: opts.message,
    defaultId: 'ok',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: opts.confirmLabel, kind: opts.danger ? 'danger' : 'primary' },
    ],
  });
  return r === 'ok';
}
