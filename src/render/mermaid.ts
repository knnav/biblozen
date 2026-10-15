// Lazy Mermaid rendering, themed from the current color tokens. Cached by source + theme.

import { sanitizeSvg } from './sanitize';

type Mermaid = typeof import('mermaid').default;
let mermaidP: Promise<Mermaid> | null = null;
let configuredFor = '';
const cache = new Map<string, string>();
let counter = 0;

export interface MermaidTheme {
  key: string;
  dark: boolean;
  vars: Record<string, string>;
}

const key = (src: string, theme: MermaidTheme) => `${theme.key}\u0000${src}`;

export function cachedDiagram(src: string, theme: MermaidTheme): string | undefined {
  return cache.get(key(src, theme));
}

/** Serializes renders: mermaid keeps global state while rendering. */
let queue: Promise<unknown> = Promise.resolve();

export function renderDiagram(src: string, theme: MermaidTheme): Promise<string> {
  const k = key(src, theme);
  const hit = cache.get(k);
  if (hit !== undefined) return Promise.resolve(hit);
  const job = queue.then(async () => {
    mermaidP ??= import('mermaid').then((m) => m.default);
    const mermaid = await mermaidP;
    if (configuredFor !== theme.key) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        darkMode: theme.dark,
        themeVariables: theme.vars,
        fontFamily: 'var(--font-ui)',
        // SVG <text> labels survive sanitizing; HTML labels in foreignObject don't.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      configuredFor = theme.key;
    }
    const id = `bz-mermaid-${++counter}`;
    try {
      const { svg } = await mermaid.render(id, src);
      const clean = sanitizeSvg(svg);
      cache.set(k, clean);
      return clean;
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = job.catch(() => {});
  return job;
}
