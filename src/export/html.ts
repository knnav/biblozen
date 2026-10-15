// Self-contained HTML export (SPEC §13): current theme + reading style CSS inlined,
// local images (optionally) and the fonts in use embedded as data URIs, KaTeX and
// Mermaid output pre-rendered. Opens identically offline.

import { useDocument } from '../app/document';
import { useWorkspace } from '../app/workspace';
import { resolveWikilinkRef } from '../index/store';
import { getPlatform } from '../platform';
import { basename, dirname, relative, stem } from '../platform/path';
import { resolveLocalSrc } from '../render/links';
import { renderMarkdown } from '../render/markdown';
import { mermaidThemeFrom } from '../render/mermaidTheme';
import { postprocess } from '../render/postprocess';
import { getSettings } from '../settings/store';
import { useTheme } from '../themes/store';

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
};

function mimeOf(path: string): string {
  return MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** Renders the open document into a detached element, fully post-processed. */
async function renderDetached(): Promise<HTMLElement> {
  const doc = useDocument.getState();
  const theme = useTheme.getState();
  const s = getSettings();
  const host = document.createElement('div');
  // On screen but invisible, so lazy images and layout-dependent output resolve.
  host.style.cssText =
    'position:fixed;left:0;top:0;width:900px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;height:1px';
  const article = document.createElement('article');
  article.className = 'markdown-body';
  article.dataset.readingStyle = s.readingStyle;
  if (s.reader.dropCap) article.dataset.dropCap = 'true';
  article.innerHTML = renderMarkdown(doc.text).html;
  host.appendChild(article);
  document.body.appendChild(host);
  try {
    await postprocess(article, {
      docPath: doc.path!,
      root: useWorkspace.getState().root,
      remoteImages: s.reader.remoteImages,
      syntax: theme.syntax,
      mermaid: mermaidThemeFrom(theme),
      assetUrl: (p) => getPlatform().assetUrl(p),
      resolveWikilink: (ref) => resolveWikilinkRef(ref, doc.path),
      isStale: () => false,
    });
  } finally {
    host.remove();
  }
  return article;
}

/** Cleans interactive bits and rewrites links/images for a standalone file. */
async function prepare(article: HTMLElement, inlineImages: boolean): Promise<void> {
  const docPath = useDocument.getState().path!;
  const root = useWorkspace.getState().root;
  const platform = getPlatform();
  article.querySelectorAll('.code-block__copy, .heading-anchor').forEach((e) => e.remove());
  article.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox').forEach((i) => {
    i.disabled = true;
    if (i.checked) i.setAttribute('checked', '');
  });
  for (const a of article.querySelectorAll<HTMLAnchorElement>('a.wikilink')) {
    const path = a.dataset.resolved;
    if (path)
      a.setAttribute(
        'href',
        relative(dirname(docPath), path).split('/').map(encodeURIComponent).join('/'),
      );
    else a.removeAttribute('href');
  }
  for (const img of article.querySelectorAll<HTMLImageElement>('img')) {
    img.removeAttribute('loading');
    const raw = img.dataset.src ?? '';
    let local: string | null = null;
    if (img.classList.contains('wikilink-embed'))
      local = resolveWikilinkRef(img.dataset.wikilink ?? '', docPath).path;
    else if (raw) local = resolveLocalSrc(raw, docPath, root);
    if (local && inlineImages) {
      try {
        const bytes = await platform.readBinaryFile(local);
        img.src = `data:${mimeOf(local)};base64,${toBase64(bytes)}`;
      } catch {
        // Leave the relative path; the image just won't be embedded.
        img.src = raw;
      }
    } else if (local) {
      img.src = relative(dirname(docPath), local);
    }
  }
  // Drop our internal attributes.
  for (const el of article.querySelectorAll<HTMLElement>('*')) {
    for (const attr of [...el.attributes]) {
      if (
        /^data-(src|wikilink|resolved|hl|theme|settled|render-ms|parse-ms|task-line|rendered)$/.test(
          attr.name,
        )
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/** Font families the exported article uses. */
function usedFamilies(article: HTMLElement): Set<string> {
  const fams = new Set<string>();
  const probe = (el: Element | null) => {
    if (!el) return;
    for (const f of getComputedStyle(el).fontFamily.split(','))
      fams.add(f.trim().replace(/^["']|["']$/g, ''));
  };
  const live = document.createElement('div');
  live.style.cssText = 'position:fixed;left:-99999px;top:0';
  live.appendChild(article.cloneNode(true));
  document.body.appendChild(live);
  const a = live.firstElementChild!;
  probe(a);
  probe(a.querySelector('h1, h2, h3'));
  probe(a.querySelector('code, pre'));
  live.remove();
  if (article.querySelector('.katex'))
    for (const f of document.fonts)
      if (f.family.replace(/["']/g, '').startsWith('KaTeX'))
        fams.add(f.family.replace(/["']/g, ''));
  return fams;
}

/** All CSS in the page, with @font-face sources for used families inlined. */
async function collectCss(families: Set<string>): Promise<string> {
  const parts: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        if (!families.has(fam)) continue;
        const m = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'));
        if (!m) continue;
        if (m[1].startsWith('data:')) {
          // Already embedded (Vite inlines small fonts); fetching data: URLs is
          // blocked by the app's CSP, and isn't needed.
          parts.push(replaceSrc(rule.cssText, `url("${m[1]}")`));
          continue;
        }
        try {
          const url = new URL(m[1], sheet.href ?? location.href).href;
          const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
          const type = mimeOf(url.split('?')[0]);
          const format =
            type === 'font/woff2' ? 'woff2' : type === 'font/woff' ? 'woff' : 'truetype';
          // Keep only the embedded source; fallbacks would be external references.
          parts.push(
            replaceSrc(
              rule.cssText,
              `url(data:${type};base64,${toBase64(buf)}) format("${format}")`,
            ),
          );
        } catch {
          // Can't embed it: leave the face out (text falls back) rather than point
          // outside the file.
        }
      } else parts.push(rule.cssText);
    }
  }
  return parts.join('\n');
}

/**
 * Replaces the `src` descriptor of an @font-face rule. Scans instead of using a
 * regex: existing sources may be data URLs (Vite inlines small fonts), which contain `;`.
 */
export function replaceSrc(cssText: string, src: string): string {
  const start = cssText.search(/\bsrc\s*:/);
  if (start === -1) return cssText;
  let i = cssText.indexOf(':', start) + 1;
  let depth = 0;
  let quote: string | null = null;
  for (; i < cssText.length; i++) {
    const ch = cssText[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ';' || ch === '}') && depth === 0) break;
  }
  return `${cssText.slice(0, start)}src: ${src}${cssText.slice(i)}`;
}

export function exportTitle(text: string, path: string): string {
  const fm = /^---\r?\n(?:[\s\S]*?\n)?title:\s*["']?(.+?)["']?\s*\r?\n[\s\S]*?---/.exec(text);
  if (fm) return fm[1];
  const h1 = /^#\s+(.+)$/m.exec(text);
  return h1 ? h1[1].replace(/[*_`]/g, '').trim() : stem(path);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildExportHtml(): Promise<{
  html: string;
  title: string;
  fileName: string;
}> {
  const doc = useDocument.getState();
  if (!doc.path) throw new Error('No document open');
  const s = getSettings();
  const article = await renderDetached();
  await prepare(article, s.export.inlineImages);
  const css = await collectCss(usedFamilies(article));
  const theme = useTheme.getState();
  const vars = Object.entries(theme.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const title = exportTitle(doc.text, doc.path);
  const html = `<!doctype html>
<html lang="en" data-theme-type="${theme.type}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Biblozen">
<title>${escapeHtml(title)}</title>
<style>
${css}
:root{${vars};color-scheme:${theme.type}}
html,body{height:auto;overflow:auto;margin:0;background:var(--bg-base);color:var(--fg-base)}
body{user-select:text;-webkit-user-select:text;cursor:auto}
.markdown-body{--reading-width:${s.appearance.readingWidth}ch;--preview-zoom:1}
.md-chunk{content-visibility:visible}
</style>
</head>
<body class="biblozen-export">
${article.outerHTML}
</body>
</html>
`;
  return { html, title, fileName: `${stem(basename(doc.path))}.html` };
}

/** Semantic HTML for the clipboard (no page CSS, keeps inline code colors). */
export async function buildClipboardHtml(): Promise<string> {
  const article = await renderDetached();
  await prepare(article, true);
  return article.innerHTML;
}
