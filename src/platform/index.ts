import type { Platform } from './types';

export * from './types';

let current: Platform | null = null;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Picks the Tauri implementation inside the app, the in-memory fake elsewhere. */
export async function initPlatform(): Promise<Platform> {
  if (current) return current;
  if (isTauri()) {
    const { createTauriPlatform } = await import('./tauri');
    current = await createTauriPlatform();
  } else {
    const { createFakePlatform } = await import('./fake');
    current = await createFakePlatform(undefined, true);
  }
  return current;
}

export function getPlatform(): Platform {
  if (!current) throw new Error('platform not initialized');
  return current;
}

/** Test hook. */
export function setPlatform(p: Platform | null): void {
  current = p;
}
