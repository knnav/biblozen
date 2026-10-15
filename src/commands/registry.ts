// Central command registry. Every user-facing action registers here so it shows up
// in the palette with its shortcut, and so keybindings have one dispatcher.

import { eventToStroke, parseBinding, strokesEqual, type KeyStroke } from './keys';
import type { OS } from '../platform/types';

export type Mode = 'none' | 'read' | 'edit';

export interface CommandContext {
  mode: Mode;
  /** Focus is in a text field, the editor, or another typing surface. */
  textFocus: boolean;
  editorFocus: boolean;
  /** A modal overlay (palette, dialog) is open. */
  overlay: boolean;
}

export interface Binding {
  keys: string;
  when?: (ctx: CommandContext) => boolean;
}

export interface Command {
  id: string;
  title: string;
  category?: string;
  keys?: (string | Binding)[];
  /** Command is available (palette + keys). */
  when?: (ctx: CommandContext) => boolean;
  /** Not listed in the palette (e.g. internal key handlers like `j`). */
  hidden?: boolean;
  run: () => void | Promise<void>;
}

type Listener = () => void;

const commands = new Map<string, Command>();
const listeners = new Set<Listener>();
let version = 0;
let contextProvider: () => CommandContext = () => ({
  mode: 'none',
  textFocus: false,
  editorFocus: false,
  overlay: false,
});
let onRun: (id: string) => void = () => {};
let onError: (e: unknown) => void = (e) => console.error(e);

function notify() {
  version++;
  for (const l of listeners) l();
}

export function registerCommand(cmd: Command): () => void {
  commands.set(cmd.id, cmd);
  notify();
  return () => {
    if (commands.get(cmd.id) === cmd) {
      commands.delete(cmd.id);
      notify();
    }
  };
}

export function registerCommands(cmds: Command[]): () => void {
  const disposers = cmds.map(registerCommand);
  return () => disposers.forEach((d) => d());
}

export function getCommand(id: string): Command | undefined {
  return commands.get(id);
}

export function allCommands(): Command[] {
  return [...commands.values()];
}

export function subscribeCommands(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function commandsVersion(): number {
  return version;
}

export function setCommandContextProvider(p: () => CommandContext): void {
  contextProvider = p;
}

export function getCommandContext(): CommandContext {
  return contextProvider();
}

export function setCommandHooks(hooks: {
  onRun?: (id: string) => void;
  onError?: (e: unknown) => void;
}) {
  if (hooks.onRun) onRun = hooks.onRun;
  if (hooks.onError) onError = hooks.onError;
}

export function isAvailable(cmd: Command, ctx = contextProvider()): boolean {
  return !cmd.when || cmd.when(ctx);
}

export async function runCommand(id: string): Promise<boolean> {
  const cmd = commands.get(id);
  if (!cmd || !isAvailable(cmd)) return false;
  onRun(id);
  try {
    await cmd.run();
  } catch (e) {
    onError(e);
  }
  return true;
}

/** Bindings listed for display: first binding whose `when` passes, else the first one. */
export function displayKeys(cmd: Command, ctx = contextProvider()): string[] {
  if (!cmd.keys?.length) return [];
  return cmd.keys
    .map((k) => (typeof k === 'string' ? { keys: k } : k))
    .filter((b) => !b.when || b.when(ctx))
    .map((b) => b.keys);
}

function isPlain(strokes: KeyStroke[]): boolean {
  return strokes.every((s) => !s.mod && !s.ctrl && !s.alt);
}

const SEQUENCE_TIMEOUT = 1200;

/**
 * Creates the global keydown handler. Handles chords ("Mod+K Mod+T") and plain-key
 * sequences ("g g"). Plain keys never fire while typing in a text field.
 */
export function createKeyDispatcher(os: OS) {
  let pending: KeyStroke[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reset = () => {
    pending = [];
    clearTimeout(timer);
  };

  return function onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing) return;
    const stroke = eventToStroke(e, os);
    if (!stroke) return;
    const ctx = contextProvider();
    const seq = [...pending, stroke];

    let exact: Command | undefined;
    let prefix = false;
    for (const cmd of commands.values()) {
      if (!cmd.keys || !isAvailable(cmd, ctx)) continue;
      for (const k of cmd.keys) {
        const b = typeof k === 'string' ? { keys: k } : k;
        if (b.when && !b.when(ctx)) continue;
        const strokes = parseBinding(b.keys);
        if (isPlain(strokes) && (ctx.textFocus || ctx.overlay)) continue;
        if (strokes.length < seq.length) continue;
        if (!seq.every((s, i) => strokesEqual(s, strokes[i]))) continue;
        if (strokes.length === seq.length) exact ??= cmd;
        else prefix = true;
      }
    }

    if (exact) {
      e.preventDefault();
      e.stopPropagation();
      reset();
      void runCommand(exact.id);
      return;
    }
    if (prefix) {
      e.preventDefault();
      pending = seq;
      clearTimeout(timer);
      timer = setTimeout(reset, SEQUENCE_TIMEOUT);
      return;
    }
    reset();
  };
}

/** Test hook. */
export function clearCommands(): void {
  commands.clear();
  notify();
}
