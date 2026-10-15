import { expect, test, type Page } from '@playwright/test';
import { boot, mod, openFolder, seed, shot, treeRow } from './helpers';

async function welcome(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
}

const backlinks = (page: Page) => page.getByRole('list', { name: 'Notes linking here' });

test('backlinks panel lists linking notes with context and opens at the line', async ({ page }) => {
  await welcome(page);
  await page.locator('[data-pane="preview"] a.wikilink', { hasText: 'Linking notes' }).click();
  await expect(page.locator('.titlebar__file')).toHaveText('Linking.md');
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('b');
  await expect(backlinks(page).locator('.backlinks__name')).toHaveText(['Welcome']);
  await expect(backlinks(page).locator('.backlinks__snippet').first()).toContainText(
    '[[guides/Linking|Linking notes]]',
  );
  await shot(page, 'm7', 'backlinks');
  await backlinks(page).locator('.backlinks__snippet').first().click();
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
});

test('backlinks update when another file adds a link', async ({ page }) => {
  await boot(page);
  await seed(page, {
    '/n/target.md': '# Target',
    '/n/a.md': 'nothing yet',
    '/n/b.md': 'see [[target]]',
  });
  await openFolder(page, '/n');
  await treeRow(page, 'target.md').click();
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect(backlinks(page).locator('.backlinks__name')).toHaveText(['b']);
  await seed(page, { '/n/a.md': 'now linking [[Target]] here' });
  await expect(backlinks(page).locator('.backlinks__name')).toHaveText(['a', 'b']);
  await seed(page, { '/n/c.md': 'new file → [target](target.md)' });
  await expect(backlinks(page).locator('.backlinks__name')).toHaveText(['a', 'b', 'c']);
});

test('quick open finds files fuzzily and # jumps to headings', async ({ page }) => {
  await welcome(page);
  await page.keyboard.press(`${mod}+p`);
  await page.getByRole('combobox').fill('lnk');
  await expect(page.getByRole('option').first()).toContainText('Linking.md');
  await shot(page, 'm7', 'quick-open');
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar__file')).toHaveText('Linking.md');
  await treeRow(page, 'Rendering.md').click();
  await page.keyboard.press(`${mod}+p`);
  await page.getByRole('combobox').fill('#diag');
  await expect(page.getByRole('option').first()).toContainText('Diagrams');
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.locator('#diagrams').evaluate((h) => Math.round(h.getBoundingClientRect().top)),
    )
    .toBeLessThan(140);
});

test('search across files: grouped results, open at line with highlights', async ({ page }) => {
  await welcome(page);
  await page.keyboard.press(`${mod}+Shift+S`);
  const input = page.getByRole('combobox', { name: 'Search in folder' });
  await expect(input).toBeFocused();
  await input.fill('outline');
  await expect(page.locator('.search-file')).not.toHaveCount(0);
  await expect(page.locator('.search-panel__status')).toContainText(/results? in \d+ files?/);
  const files = await page.locator('.search-file__name').allTextContents();
  expect(files).toContain('Reading.md');
  await expect(page.locator('.search-hit mark').first()).toHaveText(/outline/i);
  await shot(page, 'm7', 'search');
  // Navigate to a Reading.md hit with the keyboard.
  for (let i = 0; i < 20; i++) {
    const sel = page.locator('.search-hit[aria-selected="true"]');
    if ((await sel.locator('xpath=ancestor::section').getAttribute('aria-label')) === 'Reading.md')
      break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar__file')).toHaveText('Reading.md');
  await expect(page.locator('.workarea')).toHaveAttribute('data-layout', 'read');
  await expect(page.locator('mark.find-hit').first()).toBeVisible();
  // Options: whole word / regex.
  await page.keyboard.press(`${mod}+Shift+S`);
  await page.getByRole('button', { name: 'Regular expression' }).click();
  await page.getByRole('combobox', { name: 'Search in folder' }).fill('Mod\\+[A-Z]');
  await expect(page.locator('.search-hit').first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Search in folder' }).fill('zzzz-nothing');
  await expect(page.locator('.search-panel__status')).toHaveText('No results');
});

test('[[ autocompletes note names, then headings after #', async ({ page }) => {
  await welcome(page);
  await page.keyboard.press(`${mod}+e`);
  await page.locator('[data-pane="editor"] .cm-content').focus();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('[[Readi');
  const list = page.locator('.cm-tooltip-autocomplete');
  await expect(list).toContainText('Reading');
  await shot(page, 'm7', 'wikilink-autocomplete');
  // CodeMirror ignores Enter for 75 ms after the list changes (interactionDelay).
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type(' and [[Rendering#Ma');
  await expect(list).toContainText('Math');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  const text = await page.locator('[data-pane="editor"] .cm-content').textContent();
  expect(text).toContain('[[Reading]] and [[Rendering#Math]]');
});
