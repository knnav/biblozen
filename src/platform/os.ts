import type { OS } from './types';

export function detectOS(): OS {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const p = (nav?.platform || nav?.userAgent || '').toLowerCase();
  if (p.includes('mac')) return 'macos';
  if (p.includes('win')) return 'windows';
  return 'linux';
}
