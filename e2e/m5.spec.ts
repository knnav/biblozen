import { expect, test, type Page } from '@playwright/test';
import { mod, shot, treeRow } from './helpers';

async function welcome(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
}

const scroller = (page: Page) => page.locator('[data-pane="preview"] [data-scroll]');
const scrollTop = (page: Page) => scroller(page).evaluate((e) => Math.round(e.scrollTop));

/** Opens a file using only the keyboard (reveal → arrows → Enter). */
async function openByKeyboard(page: Page, name: string) {
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByRole('tree')).toBeFocused();
  await page.keyboard.press('Home');
  for (let i = 0; i < 12; i++) {
    if ((await treeRow(page, name).getAttribute('aria-selected')) === 'true') break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar__file')).toHaveText(name);
}

test('a document can be read and navigated without the mouse', async ({ page }) => {
  await welcome(page);
  await openByKeyboard(page, 'Reading.md');
  await page.setViewportSize({ width: 1100, height: 560 });

  // Line, half-page, page and end-to-end scrolling.
  const t0 = await scrollTop(page);
  await page.keyboard.press('j');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(t0);
  const t1 = await scrollTop(page);
  await page.keyboard.press('k');
  await expect.poll(() => scrollTop(page)).toBeLessThan(t1);
  await page.keyboard.press('d');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
  await page.keyboard.press('u');
  await page.keyboard.press('Space');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(300);
  await page.keyboard.press('Shift+G');
  await expect
    .poll(() => scroller(page).evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
    .toBeLessThan(2);
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.keyboard.press('g');
  await page.keyboard.press('g');
  await expect.poll(() => scrollTop(page)).toBe(0);

  // Outline: toggle, scroll-spy, jump via keyboard.
  await page.keyboard.press('o');
  const outline = page.getByRole('navigation', { name: 'Document outline' });
  await expect(outline.getByRole('link')).toHaveCount(6);
  await page.keyboard.press('Shift+G');
  await expect(outline.locator('[aria-current="location"]')).toHaveText(
    'A long section to scroll through',
  );
  await shot(page, 'm5', 'outline-scroll-spy');
  await outline.getByRole('link', { name: 'History' }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.locator('#history').evaluate((h) => Math.round(h.getBoundingClientRect().top)))
    .toBeLessThan(120);
  await expect(outline.locator('[aria-current="location"]')).toHaveText('History');

  // Back returns to where we were before the jump (bottom), forward goes again.
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('[');
  // History restores by source line, so "the bottom" means the last block's start.
  await expect
    .poll(() => scroller(page).evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
    .toBeLessThan(160);
  await page.keyboard.press(']');
  await expect
    .poll(() => page.locator('#history').evaluate((h) => Math.round(h.getBoundingClientRect().top)))
    .toBeLessThan(120);

  // Find with / then n / N.
  await page.keyboard.press('/');
  const findInput = page.getByRole('textbox', { name: 'Find in document' });
  await expect(findInput).toBeFocused();
  await page.keyboard.type('scroll');
  await expect(page.locator('.findbar__count')).toHaveText(/1 of \d+/);
  const total = Number((await page.locator('.findbar__count').textContent())!.split(' of ')[1]);
  expect(total).toBeGreaterThan(2);
  await page.keyboard.press('Enter');
  await expect(page.locator('.findbar__count')).toHaveText(`2 of ${total}`);
  await shot(page, 'm5', 'find');
  await page.keyboard.press('Escape');
  await expect(page.locator('mark.find-hit')).toHaveCount(0);
  await page.keyboard.press('/');
  await page.keyboard.type('outline');
  await page.keyboard.press('Tab'); // leave the input…
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('n'); // …and step with n / N
  await expect(page.locator('.findbar__count')).toHaveText(/2 of/);
  await page.keyboard.press('Shift+N');
  await expect(page.locator('.findbar__count')).toHaveText(/1 of/);

  // Follow a link with the keyboard and come back with Mod+[.
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+[`);
  await page.keyboard.press(`${mod}+[`);
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
  await page.keyboard.press(`${mod}+]`);
  await expect(page.locator('.titlebar__file')).toHaveText('Reading.md');

  // Theme picker and edit mode are one key away.
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('e');
  await expect(page.locator('.workarea')).toHaveAttribute('data-layout', 'split');
});

test('scroll position is remembered per file', async ({ page }) => {
  await welcome(page);
  await treeRow(page, 'Reading.md').click();
  await page.setViewportSize({ width: 1100, height: 520 });
  await page.locator('#history').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);
  await treeRow(page, 'Themes.md').click();
  await expect(page.locator('.titlebar__file')).toHaveText('Themes.md');
  await treeRow(page, 'Reading.md').click();
  await expect
    .poll(() => page.locator('#history').evaluate((h) => Math.round(h.getBoundingClientRect().top)))
    .toBeLessThan(140);
  // Survives a restart too.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('.titlebar__file')).toHaveText('Reading.md');
  await expect
    .poll(() => page.locator('#history').evaluate((h) => Math.round(h.getBoundingClientRect().top)))
    .toBeLessThan(140);
});

test('zoom applies to the preview and resets', async ({ page }) => {
  await welcome(page);
  const size = () =>
    page
      .locator('.markdown-body p')
      .first()
      .evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
  const base = await size();
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press(`${mod}+Equal`);
  await page.keyboard.press(`${mod}+Equal`);
  await expect.poll(size).toBeGreaterThan(base * 1.15);
  await shot(page, 'm5', 'zoomed');
  await page.keyboard.press(`${mod}+Minus`);
  await expect.poll(size).toBeLessThan(base * 1.15);
  await page.keyboard.press(`${mod}+0`);
  await expect.poll(size).toBe(base);
});

test('mouse back button goes back', async ({ page }) => {
  await welcome(page);
  await page.locator('[data-pane="preview"] a.wikilink', { hasText: 'Themes' }).first().click();
  await expect(page.locator('.titlebar__file')).toHaveText('Themes.md');
  await page.mouse.move(600, 400);
  await page.evaluate(() =>
    window.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true })),
  );
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
});

test('reading width and progress bar settings apply', async ({ page }) => {
  await welcome(page);
  const width = () =>
    page.locator('.markdown-body').evaluate((a) => a.getBoundingClientRect().width);
  const w0 = await width();
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('increase reading width');
  await page.keyboard.press('Enter');
  await expect.poll(width).toBeGreaterThan(w0);
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('toggle reading progress');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toHaveCount(0);
});
