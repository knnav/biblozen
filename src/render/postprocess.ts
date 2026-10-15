// Fills render placeholders after the HTML is in the DOM: images, code highlighting,
// math, diagrams, wikilink resolution. Cached results apply synchronously so
// re-renders don't flash; misses load lazily.

import { cachedHighlight, highlight, type SyntaxTheme } from './highlight';
import { cachedMath, renderMath } from './katex';
import { resolveLocalSrc } from './links';
import { cachedDiagram, renderDiagram, type MermaidTheme } from './mermaid';

export interface WikiResolution {
  path: string | null;
  heading: string | null;
}

export interface PostprocessContext {
  docPath: string;
  root: string | null;
  remoteImages: boolean;
  syntax: SyntaxTheme;
  mermaid: MermaidTheme;
  assetUrl: (path: string) => string;
  resolveWikilink: (ref: string) => WikiResolution;
  /** True once this render has been superseded. */
  isStale: () => boolean;
}

const mermaidSource = new WeakMap<Element, string>();
const codeSource = new WeakMap<Element, string>();

function processImages(root: HTMLElement, ctx: PostprocessContext) {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-src], img.wikilink-embed')) {
    let src: string | null;
    if (img.classList.contains('wikilink-embed')) {
      const r = ctx.resolveWikilink(img.dataset.wikilink ?? '');
      src = r.path ? ctx.assetUrl(r.path) : null;
      if (!r.path) {
        img.classList.add('img-missing');
        img.title = `Not found: ${img.dataset.wikilink}`;
        continue;
      }
    } else {
      const raw = img.dataset.src ?? '';
      if (/^https?:/i.test(raw)) {
        if (!ctx.remoteImages) {
          const ph = document.createElement('span');
          ph.className = 'img-blocked';
          ph.textContent = `Remote image blocked${img.alt ? `: ${img.alt}` : ''}`;
          ph.title = raw;
          img.replaceWith(ph);
          continue;
        }
        src = raw;
      } else if (/^data:image\//i.test(raw)) {
        src = raw;
      } else {
        const local = resolveLocalSrc(raw, ctx.docPath, ctx.root);
        src = local ? ctx.assetUrl(local) : null;
      }
    }
    if (!src) {
      img.classList.add('img-missing');
      continue;
    }
    if (img.getAttribute('src') !== src) {
      img.addEventListener(
        'error',
        () => {
          img.classList.add('img-missing');
          img.title = `Couldn’t load ${img.dataset.src ?? img.dataset.wikilink ?? ''}`;
        },
        { once: true },
      );
      img.src = src;
    }
  }
}

function processCode(root: HTMLElement, ctx: PostprocessContext): Promise<unknown>[] {
  const jobs: Promise<unknown>[] = [];
  for (const pre of root.querySelectorAll<HTMLPreElement>('pre[data-lang]')) {
    if (pre.dataset.hl === ctx.syntax.id) continue;
    const code = pre.querySelector('code');
    if (!code) continue;
    const lang = pre.dataset.lang ?? '';
    if (!lang) continue;
    let src = codeSource.get(pre);
    if (src === undefined) {
      src = code.textContent ?? '';
      codeSource.set(pre, src);
    }
    const apply = (html: string | null) => {
      if (html === null) return;
      code.innerHTML = html;
      pre.dataset.hl = ctx.syntax.id;
      pre.classList.remove('shiki-pending');
      pre.classList.add('shiki');
    };
    const hit = cachedHighlight(src, lang, ctx.syntax.id);
    if (hit !== undefined) {
      apply(hit);
      continue;
    }
    const s = src;
    jobs.push(
      highlight(s, lang, ctx.syntax)
        .then((html) => {
          if (!ctx.isStale() && pre.isConnected) apply(html);
        })
        .catch(() => pre.classList.remove('shiki-pending')),
    );
  }
  return jobs;
}

function processMath(root: HTMLElement, ctx: PostprocessContext): Promise<unknown>[] {
  const jobs: Promise<unknown>[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.math:not([data-rendered])')) {
    const tex = el.textContent ?? '';
    const display = el.classList.contains('math-block');
    const apply = (html: string) => {
      el.innerHTML = html;
      el.dataset.rendered = 'true';
    };
    const hit = cachedMath(tex, display);
    if (hit !== undefined) {
      apply(hit);
      continue;
    }
    jobs.push(
      renderMath(tex, display).then((html) => {
        if (!ctx.isStale() && el.isConnected) apply(html);
      }),
    );
  }
  return jobs;
}

function processMermaid(root: HTMLElement, ctx: PostprocessContext): Promise<unknown>[] {
  const jobs: Promise<unknown>[] = [];
  for (const block of root.querySelectorAll<HTMLElement>('.mermaid-block')) {
    if (block.dataset.theme === ctx.mermaid.key) continue;
    let src = mermaidSource.get(block);
    if (src === undefined) {
      src = block.querySelector('.mermaid-source')?.textContent ?? '';
      mermaidSource.set(block, src);
    }
    const apply = (svg: string) => {
      block.innerHTML = svg;
      block.dataset.theme = ctx.mermaid.key;
      block.classList.add('mermaid-rendered');
      block.classList.remove('mermaid-error');
    };
    const hit = cachedDiagram(src, ctx.mermaid);
    if (hit !== undefined) {
      apply(hit);
      continue;
    }
    block.classList.add('mermaid-loading');
    const s = src;
    jobs.push(
      renderDiagram(s, ctx.mermaid)
        .then((svg) => {
          if (!ctx.isStale() && block.isConnected) apply(svg);
        })
        .catch((e: unknown) => {
          if (ctx.isStale() || !block.isConnected) return;
          block.classList.add('mermaid-error');
          block.dataset.theme = ctx.mermaid.key;
          const msg = document.createElement('div');
          msg.className = 'mermaid-error__message';
          msg.textContent = `Diagram error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
          const pre = document.createElement('pre');
          pre.className = 'mermaid-source';
          pre.textContent = s;
          block.replaceChildren(msg, pre);
        })
        .finally(() => block.classList.remove('mermaid-loading')),
    );
  }
  return jobs;
}

function processWikilinks(root: HTMLElement, ctx: PostprocessContext) {
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a.wikilink')) {
    const r = ctx.resolveWikilink(a.dataset.wikilink ?? '');
    a.classList.toggle('wikilink--unresolved', r.path === null);
    if (r.path) a.dataset.resolved = r.path;
    else delete a.dataset.resolved;
  }
}

/** Returns a promise that settles when all async enhancements are done (tests, export). */
export function postprocess(root: HTMLElement, ctx: PostprocessContext): Promise<void> {
  processImages(root, ctx);
  processWikilinks(root, ctx);
  const jobs = [...processCode(root, ctx), ...processMath(root, ctx), ...processMermaid(root, ctx)];
  return Promise.allSettled(jobs).then(() => undefined);
}
