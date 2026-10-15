import DOMPurify from 'dompurify';

/** URLs we allow in href/src after sanitizing. Everything else is dropped. */
const SAFE_URL =
  /^(?:https?:|mailto:|tel:|#|asset:|https?:\/\/asset\.localhost|data:image\/(?:png|gif|jpe?g|webp|avif|svg\+xml);|blob:|[^:]*$)/i;

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    for (const attr of ['href', 'src', 'xlink:href']) {
      const v = el.getAttribute?.(attr);
      if (v !== null && v !== undefined && !SAFE_URL.test(v.trim())) el.removeAttribute(attr);
    }
    // Raw-HTML images with relative paths resolve like markdown images.
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src');
      if (src && !/^(?:https?:|data:|blob:|asset:)/i.test(src)) {
        el.setAttribute('data-src', src);
        el.removeAttribute('src');
      }
    }
    if (el.tagName === 'A' && el.getAttribute('target')) el.removeAttribute('target');
  });
}

export function sanitize(html: string): string {
  configure();
  return DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,
    ADD_TAGS: ['details', 'summary'],
    ADD_ATTR: ['aria-label', 'aria-hidden', 'tabindex', 'loading'],
    FORBID_TAGS: [
      'style',
      'iframe',
      'frame',
      'frameset',
      'object',
      'embed',
      'form',
      'base',
      'meta',
      'link',
      'script',
      'noscript',
      'template',
    ],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'action', 'background', 'ping'],
  });
}

/** For trusted-but-external SVG (Mermaid output). */
export function sanitizeSvg(svg: string): string {
  configure();
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
  });
}
