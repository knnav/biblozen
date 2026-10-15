import { expect, test } from '@playwright/test';
import { boot, mod, openFolder, seed, treeRow } from './helpers';

test('Open Folder routes through the shell and opens here in an empty window', async ({ page }) => {
  await boot(page);
  await seed(page, { '/r/a.md': '# A' });
  await openFolder(page, '/r');
  expect(await page.evaluate(() => window.__biblozenFake!.routed)).toEqual(['/r']);
  await expect(treeRow(page, 'a.md')).toBeVisible();
});

test('open-file requests from other launches/windows open in this window', async ({ page }) => {
  await boot(page);
  await seed(page, { '/r/a.md': '# A', '/r/b.md': '# B from elsewhere' });
  await openFolder(page, '/r');
  await page.evaluate(() => {
    for (const l of window.__biblozenFake!.openFileListeners) l('/r/b.md');
  });
  await expect(page.locator('.titlebar__file')).toHaveText('b.md');
  await expect(page.locator('[data-pane="preview"] h1')).toHaveText('B from elsewhere');
});

test('drops inside the folder open here; drops outside are routed', async ({ page }) => {
  await boot(page);
  await seed(page, { '/r/a.md': '# A', '/r/b.md': '# B', '/elsewhere/c.md': '# C' });
  await openFolder(page, '/r');
  const routedBefore = (await page.evaluate(() => window.__biblozenFake!.routed)).length;
  await page.evaluate(() => window.__biblozenFake!.drop(['/r/b.md']));
  await expect(page.locator('.titlebar__file')).toHaveText('b.md');
  expect((await page.evaluate(() => window.__biblozenFake!.routed)).length).toBe(routedBefore);
  await page.evaluate(() => window.__biblozenFake!.drop(['/elsewhere/c.md']));
  await expect
    .poll(() => page.evaluate(() => window.__biblozenFake!.routed.at(-1)))
    .toBe('/elsewhere/c.md');
});

test('session: the window reopens its folder and file after a restart', async ({ page }) => {
  // Only /data survives reloads in the fake filesystem, so the folder lives there.
  await boot(page);
  await seed(page, { '/data/vault/a.md': '# A', '/data/vault/b.md': '# B' });
  await openFolder(page, '/data/vault');
  await treeRow(page, 'b.md').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const fs = window.__biblozenFake!.fs;
        return fs.has('/data/session.json') ? fs.read('/data/session.json') : '';
      }),
    )
    .toContain('/data/vault/b.md');
  await page.reload();
  await expect(page.locator('.titlebar__file')).toHaveText('b.md');
  await expect(page.locator('.sidebar-panel__title')).toHaveText('vault');
});

test('New Window command asks the shell for a window', async ({ page }) => {
  await boot(page);
  await page.keyboard.press(`${mod}+Shift+N`);
  await expect.poll(() => page.evaluate(() => window.__biblozenFake!.newWindows)).toBe(1);
});
