import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { FakeControls } from '../src/platform/fake';

declare global {
  interface Window {
    __biblozenFake?: FakeControls;
  }
}

export async function shot(page: Page, milestone: string, name: string): Promise<void> {
  const dir = path.join('docs', 'screenshots', milestone);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

/** Runs code against the in-memory fake filesystem exposed in browser mode. */
export async function fakeRead(page: Page, p: string): Promise<string> {
  return page.evaluate((file) => window.__biblozenFake!.fs.read(file), p);
}

export const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

export async function boot(page: Page, opts: { clear?: boolean } = {}): Promise<void> {
  await page.goto('/?nowelcome');
  if (opts.clear !== false) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.locator('.app[data-loaded="true"]').waitFor({ state: 'attached' });
}

/** Writes files into the fake filesystem (paths absolute). */
export async function seed(page: Page, files: Record<string, string>): Promise<void> {
  await page.evaluate((f) => {
    for (const [p, c] of Object.entries(f)) window.__biblozenFake!.fs.write(p, c);
  }, files);
}

/** Opens a folder through the real Open Folder command (fake dialog). */
export async function openFolder(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.__biblozenFake!.nextPick = p;
  }, path);
  await page.keyboard.press(`${mod}+Alt+o`);
  await page.locator('.sidebar-panel__title').waitFor();
}

export function treeRow(page: Page, name: string) {
  return page.getByRole('treeitem', { name, exact: true });
}
