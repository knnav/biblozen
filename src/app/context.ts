import type { CommandContext } from '../commands/registry';
import { useDocument } from './document';
import { useWorkspace } from './workspace';

export function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(el.type);
  }
  return (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    !!el.closest?.('.cm-editor')
  );
}

export function commandContext(): CommandContext {
  const ws = useWorkspace.getState();
  const doc = useDocument.getState();
  const active = document.activeElement;
  return {
    mode: doc.path && doc.status === 'ready' ? ws.mode : 'none',
    textFocus: isTextInput(active),
    editorFocus: !!active?.closest?.('.cm-editor'),
    overlay: ws.overlay !== null,
  };
}
