// Path helpers that work for both POSIX and Windows paths.
// Paths are kept in their native form; comparisons normalize separators.

export function sepOf(p: string): '/' | '\\' {
  return p.includes('\\') && !p.includes('/') ? '\\' : /^[A-Za-z]:\\/.test(p) ? '\\' : '/';
}

export function trimTrailingSep(p: string): string {
  if (p === '/' || /^[A-Za-z]:[\\/]?$/.test(p)) return p;
  return p.replace(/[\\/]+$/, '');
}

export function basename(p: string): string {
  const t = trimTrailingSep(p);
  const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'));
  return i === -1 ? t : t.slice(i + 1);
}

export function dirname(p: string): string {
  const t = trimTrailingSep(p);
  const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'));
  if (i === -1) return '.';
  if (i === 0) return t[0];
  const d = t.slice(0, i);
  return /^[A-Za-z]:$/.test(d) ? d + t[i] : d;
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i);
}

export function stem(p: string): string {
  const b = basename(p);
  const e = extname(b);
  return e ? b.slice(0, -e.length) : b;
}

export function join(base: string, ...parts: string[]): string {
  const sep = sepOf(base);
  let out = trimTrailingSep(base);
  for (const part of parts) {
    if (!part) continue;
    const clean = part
      .replace(/[\\/]+/g, sep)
      .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');
    if (!clean) continue;
    out = out.endsWith(sep) ? out + clean : out + sep + clean;
  }
  return normalize(out);
}

/** Resolves `.` and `..` segments lexically. */
export function normalize(p: string): string {
  const sep = sepOf(p);
  const drive = /^[A-Za-z]:/.exec(p)?.[0] ?? '';
  const rest = p.slice(drive.length);
  const absolute = rest.startsWith('/') || rest.startsWith('\\');
  const out: string[] = [];
  for (const seg of rest.split(/[\\/]+/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
      continue;
    }
    out.push(seg);
  }
  const body = out.join(sep);
  if (absolute) return drive + sep + body;
  return drive + body || '.';
}

export function comparable(p: string, caseInsensitive = true): string {
  const s = trimTrailingSep(p.replace(/\\/g, '/'));
  return caseInsensitive ? s.toLowerCase() : s;
}

export function samePath(a: string, b: string, caseInsensitive = true): boolean {
  return comparable(a, caseInsensitive) === comparable(b, caseInsensitive);
}

/** True when `child` is strictly inside `parent` (or equal when `orEqual`). */
export function isInside(
  parent: string,
  child: string,
  orEqual = false,
  caseInsensitive = true,
): boolean {
  const p = comparable(parent, caseInsensitive);
  const c = comparable(child, caseInsensitive);
  if (p === c) return orEqual;
  const prefix = p.endsWith('/') ? p : p + '/';
  return c.startsWith(prefix);
}

/** Path of `target` relative to directory `from`, always with `/` separators. */
export function relative(from: string, target: string): string {
  const a = trimTrailingSep(from.replace(/\\/g, '/')).split('/').filter(Boolean);
  const b = trimTrailingSep(target.replace(/\\/g, '/')).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  const up = a.slice(i).map(() => '..');
  return [...up, ...b.slice(i)].join('/') || '.';
}

export function isMarkdown(p: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(p);
}

export function isImage(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i.test(p);
}
