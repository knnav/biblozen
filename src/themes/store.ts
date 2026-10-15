// Active theme state shared by the renderer, editor and chrome.
// (The full theme engine lands in M4; this holds what the renderer needs.)

import { create } from 'zustand';
import type { SyntaxTheme } from '../render/highlight';

export interface ActiveTheme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  syntax: SyntaxTheme;
  /** Resolved CSS color tokens (`--bg-base` → value). */
  vars: Record<string, string>;
  /** Bumps whenever the theme changes (cache key for diagrams). */
  version: number;
}

export const useTheme = create<ActiveTheme>(() => ({
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  type: 'dark',
  syntax: { id: 'catppuccin-mocha' },
  vars: {},
  version: 0,
}));
