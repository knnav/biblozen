// Lazy Shiki highlighting. Grammars and themes load on first use; results are cached.

import type { HighlighterCore, ThemeRegistrationAny } from 'shiki/core';

let highlighterP: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();
const loadedThemes = new Set<string>();
const cache = new Map<string, string>();
const CACHE_CAP = 800;

async function getHighlighter(): Promise<HighlighterCore> {
  highlighterP ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]);
    return createHighlighterCore({ themes: [], langs: [], engine: createJavaScriptRegexEngine() });
  })();
  return highlighterP;
}

let langIndex: Promise<Map<string, string>> | null = null;

/** Maps every language id and alias to its canonical bundled id. */
function languageIndex(): Promise<Map<string, string>> {
  langIndex ??= import('shiki/langs').then(({ bundledLanguagesInfo }) => {
    const m = new Map<string, string>();
    for (const info of bundledLanguagesInfo) {
      m.set(info.id, info.id);
      for (const a of info.aliases ?? []) m.set(a, info.id);
    }
    return m;
  });
  return langIndex;
}

export async function resolveLang(lang: string): Promise<string | null> {
  if (!lang) return null;
  return (await languageIndex()).get(lang.toLowerCase()) ?? null;
}

async function ensureLang(h: HighlighterCore, id: string): Promise<void> {
  if (loadedLangs.has(id)) return;
  const { bundledLanguages } = await import('shiki/langs');
  const loader = bundledLanguages[id as keyof typeof bundledLanguages];
  if (!loader) throw new Error(`unknown language ${id}`);
  await h.loadLanguage(loader);
  loadedLangs.add(id);
}

export type SyntaxTheme = { id: string; theme?: ThemeRegistrationAny };

async function ensureTheme(h: HighlighterCore, t: SyntaxTheme): Promise<string> {
  if (loadedThemes.has(t.id)) return t.id;
  if (t.theme) {
    await h.loadTheme({ ...t.theme, name: t.id } as ThemeRegistrationAny);
  } else {
    const { bundledThemes } = await import('shiki/themes');
    const loader = bundledThemes[t.id as keyof typeof bundledThemes];
    if (!loader) throw new Error(`unknown theme ${t.id}`);
    await h.loadTheme(loader);
  }
  loadedThemes.add(t.id);
  return t.id;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const key = (theme: string, lang: string, code: string) => `${theme}\u0000${lang}\u0000${code}`;

/** Synchronous cache lookup so re-renders don't flash unhighlighted code. */
export function cachedHighlight(code: string, lang: string, theme: string): string | undefined {
  return cache.get(key(theme, lang, code));
}

/** Returns inner HTML for <code> (one span.line per line), or null if the language is unknown. */
export async function highlight(
  code: string,
  lang: string,
  theme: SyntaxTheme,
): Promise<string | null> {
  const k = key(theme.id, lang, code);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const id = await resolveLang(lang);
  if (!id) return null;
  const h = await getHighlighter();
  await Promise.all([ensureLang(h, id), ensureTheme(h, theme)]);
  const { tokens } = h.codeToTokens(code, { lang: id, theme: theme.id });
  const html = tokens
    .map(
      (line) =>
        '<span class="line">' +
        line
          .map((t) => {
            const style: string[] = [];
            if (t.color) style.push(`color:${t.color}`);
            const fs = t.fontStyle ?? 0;
            if (fs & 1) style.push('font-style:italic');
            if (fs & 2) style.push('font-weight:bold');
            if (fs & 4) style.push('text-decoration:underline');
            return style.length
              ? `<span style="${style.join(';')}">${escapeHtml(t.content)}</span>`
              : escapeHtml(t.content);
          })
          .join('') +
        '</span>',
    )
    .join('\n');
  if (cache.size > CACHE_CAP) cache.delete(cache.keys().next().value!);
  cache.set(k, html);
  return html;
}
