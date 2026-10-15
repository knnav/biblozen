import { expect, test, type Page } from '@playwright/test';
import { mod, openFolder, seed, shot, treeRow } from './helpers';

async function boot(page: Page) {
  await page.goto('/?nowelcome');
  await expect(page.locator('.app[data-loaded="true"]')).toBeAttached();
  await seed(page, { '/notes/doc.md': '# Doc\n\nSome text.' });
  await openFolder(page, '/notes');
  await treeRow(page, 'doc.md').click();
  await expect(page.locator('.workarea')).toBeVisible();
}

async function layout(page: Page) {
  return page.locator('.workarea').getAttribute('data-layout');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?nowelcome');
  await page.evaluate(() => localStorage.clear());
});

test('all three layouts are reachable with shortcuts', async ({ page }) => {
  await boot(page);
  expect(await layout(page)).toBe('read');
  await shot(page, 'm1', 'read-layout');
  await page.keyboard.press(`${mod}+e`);
  expect(await layout(page)).toBe('split');
  await shot(page, 'm1', 'split-layout');
  await page.keyboard.press(`${mod}+Backslash`);
  expect(await layout(page)).toBe('editor');
  await shot(page, 'm1', 'editor-only-layout');
  await page.keyboard.press(`${mod}+e`);
  expect(await layout(page)).toBe('read');
  await page.keyboard.press('e');
  expect(await layout(page)).toBe('editor');
});

test('all three layouts are reachable from the palette', async ({ page }) => {
  await boot(page);
  await page.keyboard.press(`${mod}+Shift+P`);
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await shot(page, 'm1', 'palette');
  await input.fill('switch to edit');
  await page.keyboard.press('Enter');
  await expect.poll(() => layout(page)).toBe('split');

  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('split editor only');
  await page.keyboard.press('Enter');
  await expect.poll(() => layout(page)).toBe('editor');

  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('read mode');
  await page.keyboard.press('Enter');
  await expect.poll(() => layout(page)).toBe('read');
});

test('palette lists recently used commands first and shows shortcuts', async ({ page }) => {
  await boot(page);
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('focus mode');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+Shift+P`);
  const first = page.getByRole('option').first();
  await expect(first).toContainText('Focus Mode');
  await expect(first.locator('kbd').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('sidebar toggles, focus mode hides chrome, Esc exits', async ({ page }) => {
  await boot(page);
  const sidebar = page.locator('.sidebar');
  await page.keyboard.press(`${mod}+b`);
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.keyboard.press(`${mod}+b`);
  await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  await page.keyboard.press(`${mod}+Shift+F`);
  await expect(page.locator('.shell')).toHaveAttribute('data-focus', 'true');
  await expect(page.locator('.statusbar')).toHaveCSS('opacity', '0');
  await shot(page, 'm1', 'focus-mode');
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell')).toHaveAttribute('data-focus', 'false');
});

test('sidebar width, split ratio and collapse persist across restarts', async ({ page }) => {
  await boot(page);
  const divider = page.getByRole('separator', { name: 'Resize sidebar' });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 101, box.y + 200, { steps: 5 });
  await page.mouse.up();
  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(330);

  await page.keyboard.press(`${mod}+e`);
  const split = page.getByRole('separator', { name: 'Resize editor and preview' });
  await split.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const ratio = Number(await split.getAttribute('aria-valuenow'));
  expect(ratio).toBe(60);

  await page.waitForTimeout(600); // state.json save debounce
  await page.reload();
  await boot(page);
  await page.waitForTimeout(300); // sidebar settles
  const width2 = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(width2 - width)).toBeLessThan(2);
  await page.keyboard.press(`${mod}+e`);
  expect(
    Number(
      await page
        .getByRole('separator', { name: 'Resize editor and preview' })
        .getAttribute('aria-valuenow'),
    ),
  ).toBe(60);
});

test('dragging the sidebar below its minimum collapses it', async ({ page }) => {
  await boot(page);
  const divider = page.getByRole('separator', { name: 'Resize sidebar' });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(20, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'true');
});
