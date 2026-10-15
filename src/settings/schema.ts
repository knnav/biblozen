export type AutosaveMode = 'off' | 'focus' | 'idle';

export interface Settings {
  theme: {
    light: string;
    dark: string;
    followOS: boolean;
    /** Which of light/dark to use when not following the OS. */
    manual: 'light' | 'dark';
  };
  readingStyle: string;
  appearance: {
    /** Max reading width in `ch`. */
    readingWidth: number;
    previewZoom: number;
    editorZoom: number;
    uiFontSize: number;
  };
  reader: {
    progressBar: boolean;
    scrollMemory: boolean;
    remoteImages: boolean;
    dropCap: boolean;
  };
  editor: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    vim: boolean;
    softWrap: boolean;
    autosave: AutosaveMode;
    autosaveDelaySec: number;
    scrollSync: boolean;
    previewOnLeft: boolean;
    imageFolder: string;
  };
  files: {
    markdownOnly: boolean;
    ignored: string[];
  };
  export: {
    inlineImages: boolean;
    pdfForceLight: boolean;
    pdfBreakBeforeH1: boolean;
  };
}

export const defaultSettings: Settings = {
  theme: { light: 'github-light', dark: 'catppuccin-mocha', followOS: true, manual: 'dark' },
  readingStyle: 'github',
  appearance: { readingWidth: 70, previewZoom: 1, editorZoom: 1, uiFontSize: 13 },
  reader: { progressBar: true, scrollMemory: true, remoteImages: true, dropCap: false },
  editor: {
    fontFamily: '',
    fontSize: 14,
    lineHeight: 1.6,
    vim: false,
    softWrap: true,
    autosave: 'off',
    autosaveDelaySec: 3,
    scrollSync: true,
    previewOnLeft: false,
    imageFolder: 'assets',
  },
  files: { markdownOnly: true, ignored: [] },
  export: { inlineImages: true, pdfForceLight: true, pdfBreakBeforeH1: false },
};

type Json = unknown;

/**
 * Merges untrusted JSON onto defaults. Values whose type doesn't match the default are
 * dropped, so a hand-edited typo can't put the app into a broken state.
 */
export function sanitize<T>(input: Json, defaults: T): T {
  if (Array.isArray(defaults)) {
    return (
      Array.isArray(input) && input.every((v) => typeof v === 'string') ? input : defaults
    ) as T;
  }
  if (typeof defaults === 'object' && defaults !== null) {
    const src =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, Json>)
        : {};
    const out: Record<string, unknown> = {};
    for (const [k, dv] of Object.entries(defaults)) out[k] = sanitize(src[k], dv);
    return out as T;
  }
  if (typeof input === typeof defaults && !(typeof input === 'number' && !Number.isFinite(input))) {
    return input as T;
  }
  return defaults;
}

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

/** Immutable set of a dotted path. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const src = (obj ?? {}) as Record<string, unknown>;
  return {
    ...src,
    [head]: rest.length ? setPath(src[head], rest.join('.'), value) : value,
  } as T;
}

/** Dotted paths of leaves that differ between a and b (arrays compare as leaves). */
export function changedPaths(a: unknown, b: unknown, prefix = ''): string[] {
  const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    return [...keys].flatMap((k) =>
      changedPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        prefix ? `${prefix}.${k}` : k,
      ),
    );
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}
