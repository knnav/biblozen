// Color math for theme derivation (culori, OKLab/OKLCH).

import { converter, formatHex, interpolate, parse, wcagContrast, type Color } from 'culori';

const toRgb = converter('rgb');
const toOklch = converter('oklch');

export function isColor(s: unknown): s is string {
  return typeof s === 'string' && parse(s) !== undefined;
}

/** Resolves `#rrggbbaa` (and other alpha colors) to an opaque hex over `bg`. */
export function flatten(color: string, bg: string): string {
  const c = toRgb(parse(color));
  const b = toRgb(parse(bg));
  if (!c) return bg;
  const a = c.alpha ?? 1;
  if (a >= 1 || !b) return formatHex(c) ?? color;
  return formatHex({
    mode: 'rgb',
    r: c.r * a + b.r * (1 - a),
    g: c.g * a + b.g * (1 - a),
    b: c.b * a + b.b * (1 - a),
  })!;
}

/** Mix `a` toward `b` by t (0 = a, 1 = b) in OKLab. */
export function mix(a: string, b: string, t: number): string {
  return formatHex(interpolate([a, b], 'oklab')(t) as Color)!;
}

export function contrast(a: string, b: string): number {
  return wcagContrast(a, b);
}

export function luminanceIsDark(c: string): boolean {
  const o = toOklch(parse(c));
  return (o?.l ?? 0) < 0.6;
}

/** Shifts lightness in OKLCH. */
export function adjustL(c: string, delta: number): string {
  const o = toOklch(parse(c))!;
  return formatHex({ ...o, l: Math.min(1, Math.max(0, o.l + delta)) })!;
}

/**
 * Nudges `fg` lighter/darker (keeping hue) until it reaches `min` contrast on `bg`.
 * Falls back to black/white if the hue can't get there.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const preferred = luminanceIsDark(bg) ? 1 : -1;
  // Try the natural direction first, then the other one (mid-grey backgrounds).
  for (const dir of [preferred, -preferred]) {
    let c = fg;
    for (let i = 0; i < 50; i++) {
      c = adjustL(c, dir * 0.02);
      if (contrast(c, bg) >= min) return c;
    }
  }
  return contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#ffffff' : '#000000';
}

export function readableOn(bg: string): string {
  return contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111';
}

export function hex(c: string): string {
  return formatHex(parse(c)) ?? c;
}

export function deltaE(a: string, b: string): number {
  const da = toOklch(parse(a))!;
  const db = toOklch(parse(b))!;
  return Math.abs(da.l - db.l) * 100 + Math.abs((da.c ?? 0) - (db.c ?? 0)) * 100;
}
