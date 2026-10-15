// Keybinding parsing and matching. Bindings are strings like "Mod+Shift+P",
// chords like "Mod+K Mod+T", and read-mode sequences like "g g".

import type { OS } from '../platform/types';

export interface KeyStroke {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  /** Ctrl on macOS (distinct from Mod there). */
  ctrl: boolean;
  key: string;
}

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  esc: 'escape',
  return: 'enter',
  plus: '+',
};

function normKey(k: string): string {
  const l = k.toLowerCase();
  return KEY_ALIASES[l] ?? l;
}

export function parseStroke(s: string): KeyStroke {
  // Split on "+" but allow a literal "+" key at the end ("Mod++").
  const parts = s.endsWith('++') ? [...s.slice(0, -2).split('+'), '+'] : s.split('+');
  const stroke: KeyStroke = { mod: false, alt: false, shift: false, ctrl: false, key: '' };
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'mod' || l === 'cmd') stroke.mod = true;
    else if (l === 'alt' || l === 'option') stroke.alt = true;
    else if (l === 'shift') stroke.shift = true;
    else if (l === 'ctrl') stroke.ctrl = true;
    else stroke.key = normKey(p);
  }
  return stroke;
}

export function parseBinding(b: string): KeyStroke[] {
  return b.trim().split(/\s+/).map(parseStroke);
}

/** Converts a KeyboardEvent to a stroke, using physical keys for letters/digits. */
export function eventToStroke(e: KeyboardEvent, os: OS): KeyStroke | null {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead'].includes(e.key)) return null;
  let key = e.key;
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^Digit(\d)$/.exec(e.code);
  if (letter && (e.altKey || e.metaKey || e.ctrlKey || key.length !== 1 || !/[a-z]/i.test(key)))
    key = letter[1];
  else if (digit && (e.altKey || e.metaKey || e.ctrlKey)) key = digit[1];
  else if (e.code === 'Equal' && (e.metaKey || e.ctrlKey)) key = '=';
  else if (e.code === 'Minus' && (e.metaKey || e.ctrlKey)) key = '-';
  const mac = os === 'macos';
  return {
    mod: mac ? e.metaKey : e.ctrlKey,
    ctrl: mac ? e.ctrlKey : false,
    alt: e.altKey,
    shift: e.shiftKey,
    key: normKey(key),
  };
}

export function strokesEqual(a: KeyStroke, b: KeyStroke): boolean {
  if (a.key !== b.key || a.mod !== b.mod || a.alt !== b.alt || a.ctrl !== b.ctrl) return false;
  // Shift is implied for shifted symbols ("?", "G" typed as "Shift+g" stays explicit).
  return a.shift === b.shift;
}

const MAC_SYMBOLS: Record<string, string> = { mod: '⌘', alt: '⌥', shift: '⇧', ctrl: '⌃' };

function displayKey(k: string): string {
  const map: Record<string, string> = {
    space: 'Space',
    escape: 'Esc',
    enter: '↵',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    backspace: '⌫',
    delete: 'Del',
    tab: 'Tab',
  };
  return map[k] ?? (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
}

/** Human-readable keys for one stroke, e.g. ["⌘", "⇧", "P"] or ["Ctrl", "Shift", "P"]. */
export function strokeParts(s: KeyStroke, os: OS): string[] {
  const mac = os === 'macos';
  const parts: string[] = [];
  if (s.ctrl) parts.push(mac ? MAC_SYMBOLS.ctrl : 'Ctrl');
  if (s.alt) parts.push(mac ? MAC_SYMBOLS.alt : 'Alt');
  if (s.shift) parts.push(mac ? MAC_SYMBOLS.shift : 'Shift');
  if (s.mod) parts.push(mac ? MAC_SYMBOLS.mod : 'Ctrl');
  if (mac) {
    // macOS convention orders ⌃⌥⇧⌘.
  } else {
    // Windows convention: Ctrl first.
    parts.sort((a, b) => (a === 'Ctrl' ? -1 : b === 'Ctrl' ? 1 : 0));
  }
  parts.push(displayKey(s.key));
  return parts;
}

export function formatBinding(b: string, os: OS): string[][] {
  return parseBinding(b).map((s) => strokeParts(s, os));
}

export function formatBindingText(b: string, os: OS): string {
  return formatBinding(b, os)
    .map((p) => p.join(os === 'macos' ? '' : '+'))
    .join(' ');
}
