// Theme runtime: picks the active theme from settings + OS appearance, writes CSS
// variables, supports live preview, and hot-reloads user themes from <data>/themes.

import { create } from 'zustand';
import { getPlatform } from '../platform';
import { errorMessage } from '../platform/types';
import { join, stem } from '../platform/path';
import type { Settings } from '../settings/schema';
import { getSettings, useSettings } from '../settings/store';
import builtinJson from './builtin.json';
import { parseUserTheme } from './derive';
import { useTheme } from './store';
import { TOKEN_KEYS, cssVarName, type ThemeDef } from './types';

export const BUILTIN: ThemeDef[] = (builtinJson as ThemeDef[]).map((t) => ({
  ...t,
  source: 'builtin',
}));

interface ThemesState {
  user: ThemeDef[];
  errors: Record<string, string>;
  /** Theme being previewed in the picker (not saved). */
  previewId: string | null;
}

export const useThemes = create<ThemesState>(() => ({ user: [], errors: {}, previewId: null }));

export function allThemes(): ThemeDef[] {
  return [...useThemes.getState().user, ...BUILTIN];
}

export function findTheme(id: string): ThemeDef | undefined {
  return useThemes.getState().user.find((t) => t.id === id) ?? BUILTIN.find((t) => t.id === id);
}

const darkQuery = () =>
  typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;

export function osIsDark(): boolean {
  return darkQuery()?.matches ?? true;
}

/** Which scheme is in effect for the given settings. */
export function activeScheme(s: Settings['theme'], dark = osIsDark()): 'light' | 'dark' {
  return s.followOS ? (dark ? 'dark' : 'light') : s.manual;
}

export function activeThemeId(s: Settings['theme'], dark = osIsDark()): string {
  return activeScheme(s, dark) === 'dark' ? s.dark : s.light;
}

function fallbackFor(scheme: 'light' | 'dark'): ThemeDef {
  return findTheme(scheme === 'dark' ? 'catppuccin-mocha' : 'github-light') ?? BUILTIN[0];
}

const CACHE_KEY = 'biblozen-theme-vars';

export function themeVars(t: ThemeDef): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of TOKEN_KEYS) vars[cssVarName(k)] = t.tokens[k];
  return vars;
}

function writeVars(vars: Record<string, string>, type: 'light' | 'dark') {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty('color-scheme', type);
  root.dataset.themeType = type;
}

/** Applies cached variables before React mounts so there's no flash of the wrong theme. */
export function applyCachedTheme(): void {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as {
      vars: Record<string, string>;
      type: 'light' | 'dark';
    } | null;
    if (cached?.vars) writeVars(cached.vars, cached.type);
  } catch {
    // No cache yet.
  }
}

export function applyTheme(t: ThemeDef, persistCache = true): void {
  const vars = themeVars(t);
  writeVars(vars, t.type);
  document.documentElement.dataset.themeId = t.id;
  const syntax =
    typeof t.syntax === 'string'
      ? { id: t.syntax }
      : {
          id: `user-${t.id}`,
          theme: {
            name: `user-${t.id}`,
            type: t.type,
            colors: t.syntax.colors ?? {},
            tokenColors: t.syntax.tokenColors,
          },
        };
  useTheme.setState((s) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    syntax,
    vars,
    version: s.version + 1,
  }));
  if (persistCache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ vars, type: t.type }));
    } catch {
      // Storage unavailable; the theme still applies.
    }
  }
}

/** Re-applies the theme the settings call for (unless a preview is showing). */
export function applyActive(): void {
  if (useThemes.getState().previewId) return;
  const s = getSettings().theme;
  const scheme = activeScheme(s);
  applyTheme(findTheme(activeThemeId(s)) ?? fallbackFor(scheme));
}

export function previewTheme(id: string | null): void {
  useThemes.setState({ previewId: id });
  if (id) {
    const t = findTheme(id);
    if (t) applyTheme(t, false);
  } else applyActive();
}

/**
 * Makes `id` the active theme. Picking a theme of the other appearance while
 * following the OS switches to a fixed appearance (otherwise it wouldn't show).
 */
export function chooseTheme(id: string): { stoppedFollowing: boolean } {
  const t = findTheme(id);
  if (!t) return { stoppedFollowing: false };
  const s = useSettings.getState();
  const cur = s.settings.theme;
  let stoppedFollowing = false;
  let next = { ...cur, [t.type]: id };
  if (cur.followOS && activeScheme(cur) !== t.type) {
    next = { ...next, followOS: false, manual: t.type };
    stoppedFollowing = true;
  } else if (!cur.followOS) next = { ...next, manual: t.type };
  useThemes.setState({ previewId: null });
  s.set('theme', next);
  applyActive();
  return { stoppedFollowing };
}

async function loadUserThemes(dir: string): Promise<void> {
  const platform = getPlatform();
  let entries: { name: string; isDir: boolean }[];
  try {
    entries = await platform.listDir(dir);
  } catch {
    entries = [];
  }
  const user: ThemeDef[] = [];
  const errors: Record<string, string> = {};
  for (const e of entries) {
    if (e.isDir || !/\.jsonc?$/i.test(e.name)) continue;
    try {
      const text = await platform.readTextFile(join(dir, e.name));
      user.push(parseUserTheme(text, `user:${stem(e.name)}`));
    } catch (err) {
      errors[e.name] = errorMessage(err);
    }
  }
  user.sort((a, b) => a.name.localeCompare(b.name));
  useThemes.setState({ user, errors });
}

/** Starts the engine: initial apply, OS + settings listeners, user theme hot reload. */
export async function bindThemes(onError: (msg: string) => void): Promise<() => void> {
  const platform = getPlatform();
  const { path: dataDir } = await platform.getDataDir();
  const dir = join(dataDir, 'themes');
  await loadUserThemes(dir);
  applyActive();

  const mq = darkQuery();
  const onOs = () => applyActive();
  mq?.addEventListener('change', onOs);
  const unsubSettings = useSettings.subscribe((st, prev) => {
    if (st.settings.theme !== prev.settings.theme) applyActive();
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let unwatch: (() => void) | undefined;
  try {
    unwatch = await platform.watch(
      dir,
      () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const before = useThemes.getState().errors;
          await loadUserThemes(dir);
          const { errors } = useThemes.getState();
          for (const [file, msg] of Object.entries(errors)) {
            if (before[file] !== msg) onError(`Theme “${file}” couldn’t be loaded: ${msg}`);
          }
          applyActive();
        }, 150);
      },
      { recursive: false, delayMs: 100 },
    );
  } catch (e) {
    onError(`Theme hot-reload unavailable: ${errorMessage(e)}`);
  }
  for (const [file, msg] of Object.entries(useThemes.getState().errors)) {
    onError(`Theme “${file}” couldn’t be loaded: ${msg}`);
  }

  return () => {
    mq?.removeEventListener('change', onOs);
    unsubSettings();
    unwatch?.();
    clearTimeout(timer);
  };
}
