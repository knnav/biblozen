import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mod, shot, treeRow } from './helpers';

async function welcome(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
}

async function palette(page: Page, cmd: string) {
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill(cmd);
  await page.keyboard.press('Enter');
}

const STYLE_PROBES = [
  'body',
  '.markdown-body',
  '.markdown-body h1',
  '.markdown-body p',
  '.markdown-alert-tip',
  '.code-block',
  'table th',
];
const PROPS = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'line-height',
  'font-weight',
  'max-width',
];

function probe(page: Page, scope: string) {
  return page.evaluate(
    ({ probes, props, scope }) =>
      Object.fromEntries(
        probes.map((sel) => {
          const el =
            document.querySelector(
              sel === 'body' ? 'body' : `${scope} ${sel.replace('.markdown-body', '')}`.trim(),
            ) ?? document.querySelector(sel);
          const cs = el ? getComputedStyle(el) : null;
          return [
            sel,
            cs ? Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])) : null,
          ];
        }),
      ),
    { probes: STYLE_PROBES, props: PROPS, scope },
  );
}

test('exported HTML is self-contained and renders identically offline', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await welcome(page);
  await treeRow(page, 'Rendering.md').click();
  await expect(page.locator('[data-pane="preview"] .markdown-body')).toHaveAttribute(
    'data-settled',
    'true',
    { timeout: 20_000 },
  );
  await palette(page, 'export as html');
  await expect
    .poll(() => page.evaluate(() => window.__biblozenFake!.exports.length), { timeout: 20_000 })
    .toBe(1);
  const exp = await page.evaluate(() => window.__biblozenFake!.exports[0]);
  expect(exp.name).toBe('Rendering.html');
  const dir = path.resolve('test-results/export');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, exp.name);
  writeFileSync(file, exp.contents);

  // No external references at all.
  expect(exp.contents).not.toMatch(/<script/i);
  expect(exp.contents).not.toMatch(/(src|href)=["']https?:\/\/(?!example\.com)/i);
  // Only embedded data or in-document SVG references (url(#marker)) are allowed.
  expect(exp.contents).not.toMatch(/url\((?!["']?(data:|#))/i);

  const ctx = await browser.newContext({
    offline: true,
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 800 },
  });
  const off = await ctx.newPage();
  const requests: string[] = [];
  off.on('request', (r) => {
    if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url());
  });
  await off.goto(`file://${file}`);
  await expect(off.locator('.markdown-alert')).toHaveCount(5);
  await expect(off.locator('pre.shiki .line span[style*="color"]').first()).toBeVisible();
  await expect(off.locator('.katex')).toHaveCount(3);
  await expect(off.locator('.mermaid-block svg')).toHaveCount(2);
  expect(
    await off
      .locator('img[alt="Biblozen sketch"]')
      .evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBeGreaterThan(0);
  expect(await off.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
  await off.evaluate(() => document.fonts.ready);
  expect(requests).toEqual([]);
  // Same look: computed styles of key elements match the app's preview.
  const appStyles = await probe(page, '[data-pane="preview"] .markdown-body');
  const expStyles = await probe(off, '.markdown-body');
  for (const sel of STYLE_PROBES.slice(1))
    expect([sel, expStyles[sel]]).toEqual([sel, appStyles[sel]]);
  expect(expStyles.body!['background-color']).toBe(appStyles.body!['background-color']);
  mkdirSync('docs/screenshots/m9', { recursive: true });
  await off.screenshot({ path: 'docs/screenshots/m9/exported-html-offline.png' });
  await ctx.close();
});

test('copy as HTML puts rendered HTML on the clipboard', async ({ page }) => {
  await welcome(page);
  await palette(page, 'copy as html');
  await expect
    .poll(() => page.evaluate(() => window.__biblozenFake!.clipboard.at(-1) ?? ''))
    .toContain('<h1 id="welcome-to-biblozen"');
});

test('print: chrome hidden, document full width, forced light theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await welcome(page);
  await palette(page, 'print');
  await expect.poll(() => page.evaluate(() => window.__biblozenFake!.printed)).toBe(1);
  // Light theme while printing.
  await expect(page.locator('html')).toHaveAttribute('data-theme-type', 'light');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.titlebar')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.statusbar')).toBeHidden();
  const overflow = await page
    .locator('.preview-scroll')
    .evaluate((e) => getComputedStyle(e).overflow);
  expect(overflow).toBe('visible');
  await shot(page, 'm9', 'print-preview');
  await page.emulateMedia({ media: 'screen' });
  // Theme restores afterwards.
  await expect(page.locator('html')).toHaveAttribute('data-theme-type', 'dark', { timeout: 5000 });
});

test('settings screen: search, change, keyboard, persisted to settings.json', async ({ page }) => {
  await welcome(page);
  await page.keyboard.press(`${mod}+Comma`);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search settings' })).toBeFocused();
  await shot(page, 'm9', 'settings');
  await page.keyboard.type('progress');
  await expect(dialog.locator('.settings__row')).toHaveCount(1);
  // Keyboard: Tab to the switch, Space toggles it.
  const sw = page.getByRole('switch', { name: 'Reading progress bar' });
  for (let i = 0; i < 12 && !(await sw.evaluate((e) => e === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(sw).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Reading progress bar' })).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(window.__biblozenFake!.fs.read('/data/settings.json')).reader.progressBar,
      ),
    )
    .toBe(false);
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('');
  await dialog.getByLabel('Reading style').selectOption('book');
  await expect(page.locator('[data-pane="preview"] .markdown-body')).toHaveAttribute(
    'data-reading-style',
    'book',
  );
  await dialog.getByLabel('Reading width').fill('80');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(window.__biblozenFake!.fs.read('/data/settings.json')).appearance.readingWidth,
      ),
    )
    .toBe(80);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

async function axe(page: Page, include?: string, disable: string[] = []) {
  // Measure settled UI, not a fade-in (opacity lowers measured contrast).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) b = b.include(include);
  if (disable.length) b = b.disableRules(disable);
  const r = await b.analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    );
}

test('accessibility: no serious axe violations on main screens', async ({ page }) => {
  await welcome(page);
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press(`${mod}+Shift+E`);
  expect(await axe(page, '.sidebar')).toEqual([]);
  await page.keyboard.press(`${mod}+Shift+P`);
  expect(await axe(page, '.picker')).toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+Comma`);
  expect(await axe(page, '.settings')).toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+e`);
  // CodeMirror's scroller holds a focusable contenteditable, which this rule misses.
  expect(await axe(page, '[data-pane="editor"]', ['scrollable-region-focusable'])).toEqual([]);
});

test('reduced motion: transitions collapse to near zero', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await welcome(page);
  const dur = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--dur-base').trim(),
  );
  expect(dur).toBe('0.01ms');
});
