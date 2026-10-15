// Lazy KaTeX with a cache keyed by (source, display).

type Katex = typeof import('katex').default;
let katexP: Promise<Katex> | null = null;
const cache = new Map<string, string>();

export function loadKatex(): Promise<Katex> {
  katexP ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([m]) => m.default,
  );
  return katexP;
}

const key = (tex: string, display: boolean) => `${display ? 'D' : 'I'}${tex}`;

export function cachedMath(tex: string, display: boolean): string | undefined {
  return cache.get(key(tex, display));
}

export async function renderMath(tex: string, display: boolean): Promise<string> {
  const k = key(tex, display);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const katex = await loadKatex();
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
    });
  } catch (e) {
    html = `<span class="math-error" title="${String(e).replace(/"/g, '&quot;')}">${tex.replace(/</g, '&lt;')}</span>`;
  }
  cache.set(k, html);
  return html;
}
