import { expect, test, type Page } from '@playwright/test';
import { mod, shot, treeRow } from './helpers';

const TOP10 = [
  'github-light',
  'github-dark-default',
  'catppuccin-latte',
  'catppuccin-mocha',
  'nord',
  'dracula',
  'one-dark-pro',
  'solarized-light',
  'rose-pine-dawn',
  'tokyo-night',
];

async function welcome(page: Page, colorScheme: 'light' | 'dark' = 'dark') {
  await page.emulateMedia({ colorScheme });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
}

const bg = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
  );

async function setSettings(page: Page, patch: (s: Record<string, unknown>) => void) {
  await page.evaluate((fn) => {
    const fs = window.__biblozenFake!.fs;
    const s = JSON.parse(fs.read('/data/settings.json'));
    new Function('s', fn)(s);
    fs.write('/data/settings.json', JSON.stringify(s));
  }, `(${patch.toString()})(s)`);
}

test('follows the OS appearance', async ({ page }) => {
  await welcome(page, 'dark');
  const darkBg = await bg(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => bg(page)).not.toBe(darkBg);
  await expect(page.locator('.statusbar')).toContainText('GitHub Light');
});

test('theme picker previews live, Esc reverts, Enter applies', async ({ page }) => {
  await welcome(page);
  const original = await bg(page);
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('t');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => bg(page)).not.toBe(original);
  await shot(page, 'm4', 'theme-picker');
  await page.keyboard.press('Escape');
  await expect.poll(() => bg(page)).toBe(original);

  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.press(`${mod}+t`);
  await page.getByRole('combobox').fill('dracula');
  await page.keyboard.press('Enter');
  await expect(page.locator('.statusbar')).toContainText('Dracula');
  await expect.poll(() => bg(page)).toBe('#282a36');
  // Persisted to settings.json.
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(window.__biblozenFake!.fs.read('/data/settings.json')).theme.dark,
      ),
    )
    .toBe('dracula');
});

test('picker filters light/dark with tabs', async ({ page }) => {
  await welcome(page);
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('color theme');
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'Light' }).click();
  const names = await page.getByRole('option').allTextContents();
  expect(names.length).toBeGreaterThan(10);
  expect(names.every((n) => n.includes('Light'))).toBe(true);
  await page.keyboard.press('Escape');
});

test('at least 40 built-in themes are listed', async ({ page }) => {
  await welcome(page);
  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.press(`${mod}+t`);
  expect(await page.getByRole('option').count()).toBeGreaterThanOrEqual(40);
});

test('dropping a VS Code theme into data/themes makes it appear without restart', async ({
  page,
}) => {
  await welcome(page);
  await page.evaluate(() => {
    window.__biblozenFake!.fs.write(
      '/data/themes/my-theme.json',
      `{
        // VS Code themes are JSONC
        "name": "My Neon",
        "type": "dark",
        "colors": { "editor.background": "#0b0f1a", "editor.foreground": "#e6f1ff", "focusBorder": "#ff2bd6", },
        "tokenColors": [{ "scope": "keyword", "settings": { "foreground": "#ff2bd6" } }]
      }`,
    );
  });
  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.press(`${mod}+t`);
  await page.getByRole('combobox').fill('my neon');
  await expect(page.getByRole('option', { name: /My Neon/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => bg(page)).toBe('#0b0f1a');
  // Edits hot-reload too.
  await page.evaluate(() => {
    const fs = window.__biblozenFake!.fs;
    fs.write(
      '/data/themes/my-theme.json',
      fs.read('/data/themes/my-theme.json').replace('#0b0f1a', '#101a2b'),
    );
  });
  await expect.poll(() => bg(page)).toBe('#101a2b');
  // Broken themes report an error instead of crashing.
  await page.evaluate(() => window.__biblozenFake!.fs.write('/data/themes/broken.json', '{ nope'));
  await expect(page.getByRole('alert').filter({ hasText: 'broken.json' })).toBeVisible();
});

test('settings.json edits hot-reload (reading style)', async ({ page }) => {
  await welcome(page);
  await setSettings(page, (s) => {
    s.readingStyle = 'book';
  });
  await expect(page.locator('.markdown-body')).toHaveAttribute('data-reading-style', 'book');
  await expect(page.locator('.statusbar')).toContainText('Book');
});

test('reading style picker previews and applies', async ({ page }) => {
  await welcome(page);
  await page
    .locator('.statusbar')
    .getByRole('button', { name: /GitHub/ })
    .first()
    .click();
  await page.getByRole('combobox').fill('mono');
  await expect(page.locator('.markdown-body')).toHaveAttribute('data-reading-style', 'mono');
  await page.keyboard.press('Escape');
  await expect(page.locator('.markdown-body')).toHaveAttribute('data-reading-style', 'github');
});

test('screenshots: top 10 themes on the rendering tour', async ({ page }) => {
  test.setTimeout(120_000);
  await welcome(page);
  await treeRow(page, 'Rendering.md').click();
  for (const id of TOP10) {
    await page.evaluate((themeId) => {
      const fs = window.__biblozenFake!.fs;
      const s = JSON.parse(fs.read('/data/settings.json'));
      const type = /light|latte|dawn/.test(themeId) ? 'light' : 'dark';
      s.theme = { ...s.theme, followOS: false, manual: type, [type]: themeId };
      fs.write('/data/settings.json', JSON.stringify(s));
    }, id);
    await expect(page.locator('html')).toHaveAttribute('data-theme-id', id);
    await expect(page.locator('.markdown-body')).toHaveAttribute('data-settled', 'true', {
      timeout: 20_000,
    });
    await page.waitForTimeout(250);
    await page.locator('#alerts').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await shot(page, 'm4', `theme-${id}-alerts`);
    await page.locator('#code').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(150);
    await shot(page, 'm4', `theme-${id}-code`);
  }
});

test('screenshots: reading styles in light and dark', async ({ page }) => {
  test.setTimeout(120_000);
  await welcome(page);
  await treeRow(page, 'Rendering.md').click();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const style of ['github', 'book', 'academic', 'compact', 'mono']) {
      await setSettings(page, (s) => void s);
      await page.evaluate((st) => {
        const fs = window.__biblozenFake!.fs;
        const s = JSON.parse(fs.read('/data/settings.json'));
        s.readingStyle = st;
        fs.write('/data/settings.json', JSON.stringify(s));
      }, style);
      await expect(page.locator('.markdown-body')).toHaveAttribute('data-reading-style', style);
      await page.waitForTimeout(200);
      await page.locator('.preview-scroll').evaluate((e) => (e.scrollTop = 0));
      await shot(page, 'm4', `style-${style}-${scheme}-top`);
      await page.locator('#lists').evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await shot(page, 'm4', `style-${style}-${scheme}-lists`);
    }
  }
});
