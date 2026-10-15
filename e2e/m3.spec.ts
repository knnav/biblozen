import { expect, test, type Page } from '@playwright/test';
import { boot, fakeRead, openFolder, seed, shot, treeRow } from './helpers';

async function firstRun(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
}

const preview = (page: Page) => page.locator('[data-pane="preview"] .markdown-body');

async function settled(page: Page) {
  await expect(preview(page)).toHaveAttribute('data-settled', 'true', { timeout: 20_000 });
}

test('first run opens the Welcome folder with front matter card', async ({ page }) => {
  await firstRun(page);
  await expect(page.locator('.sidebar-panel__title')).toHaveText('Welcome');
  const card = page.locator('details.front-matter');
  await expect(card).toBeVisible();
  await expect(card.locator('summary')).toContainText('Welcome to Biblozen');
  await expect(preview(page).locator('h1#welcome-to-biblozen')).toBeVisible();
  await settled(page);
  await shot(page, 'm3', 'welcome');
});

test('Rendering tour renders every feature', async ({ page }) => {
  await firstRun(page);
  await treeRow(page, 'Rendering.md').click();
  await expect(page.locator('.titlebar__file')).toHaveText('Rendering.md');
  await settled(page);
  const p = preview(page);
  await expect(p.locator('.markdown-alert')).toHaveCount(5);
  await expect(p.locator('input.task-list-item-checkbox')).toHaveCount(4);
  await expect(p.locator('table')).toHaveCount(1);
  await expect(p.locator('pre.shiki')).toHaveCount(4);
  await expect(p.locator('pre.shiki .line span[style*="color"]').first()).toBeVisible();
  await expect(p.locator('.math[data-rendered] .katex')).toHaveCount(3);
  await expect(p.locator('.mermaid-block.mermaid-rendered svg')).toHaveCount(2);
  await expect(p.locator('.footnotes li')).toHaveCount(2);
  // Images are lazy: bring them on screen first.
  await p.locator('img[alt="Biblozen sketch"]').scrollIntoViewIfNeeded();
  await expect(p.locator('img[alt="Biblozen sketch"]')).toHaveJSProperty('complete', true);
  await expect
    .poll(() => p.locator('img.wikilink-embed').evaluate((i: HTMLImageElement) => i.complete))
    .toBe(true);
  expect(
    await p.locator('img[alt="Biblozen sketch"]').evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBeGreaterThan(0);
  expect(
    await p.locator('img.wikilink-embed').evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBeGreaterThan(0);
  // Every block carries a source line.
  const missing = await p.evaluate(
    (a) =>
      [
        ...a.querySelectorAll(':scope > :is(p, h1, h2, h3, ul, ol, div, blockquote, details)'),
      ].filter((e) => !e.hasAttribute('data-line') && !e.classList.contains('footnotes')).length,
  );
  expect(missing).toBe(0);
  await shot(page, 'm3', 'rendering-top');
  for (const [id, name] of [
    ['alerts', 'alerts'],
    ['code', 'code'],
    ['math', 'math'],
    ['diagrams', 'diagrams'],
  ] as const) {
    await p.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.locator(`#${id}`).evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await shot(page, 'm3', `rendering-${name}`);
  }
});

test('task checkbox toggles the source line and saves immediately', async ({ page }) => {
  await firstRun(page);
  await treeRow(page, 'Rendering.md').click();
  await settled(page);
  const box = preview(page).locator('input.task-list-item-checkbox').nth(2);
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  await expect
    .poll(() => fakeRead(page, '/data/Welcome/Rendering.md'))
    .toContain('- [x] Try a different theme');
  await expect(page.locator('.statusbar__save')).toHaveText('Saved');
});

test('links: anchors scroll, md links open with anchor, external opens browser, wikilinks resolve', async ({
  page,
}) => {
  await firstRun(page);
  const p = preview(page);
  // Relative .md link with anchor.
  await p.getByRole('link', { name: 'the rendering tour' }).click();
  await expect(page.locator('.titlebar__file')).toHaveText('Rendering.md');
  await expect
    .poll(() => page.locator('#code').evaluate((h) => Math.round(h.getBoundingClientRect().top)))
    .toBeLessThan(200);
  // Wikilink back.
  await p.locator('a.wikilink', { hasText: 'Welcome' }).last().click();
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
  // External link.
  await p.getByRole('link', { name: 'external links' }).click();
  expect(await page.evaluate(() => window.__biblozenFake!.opened)).toEqual(['https://example.com']);
  // Hover hint.
  await p.locator('a.wikilink', { hasText: 'Linking notes' }).hover();
  await expect(page.locator('.statusbar__hint')).toHaveText('guides/Linking.md');
  // Wikilink with alias + nested path.
  await p.locator('a.wikilink', { hasText: 'Linking notes' }).click();
  await expect(page.locator('.titlebar__file')).toHaveText('Linking.md');
  // Unresolved wikilink is styled and creates the note on click.
  const missing = p.locator('a.wikilink', { hasText: 'A note to write later' });
  await expect(missing).toHaveClass(/wikilink--unresolved/);
  await shot(page, 'm3', 'wikilinks');
  await missing.click();
  await expect(page.locator('.titlebar__file')).toHaveText('A note to write later.md');
  await expect(page.locator('.workarea')).toHaveAttribute('data-layout', 'split');
});

test('malicious document is neutralized', async ({ page }) => {
  await boot(page);
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await seed(page, {
    '/evil/evil.md': [
      '# Evil',
      '<script>window.__pwned = 1</script>',
      '<img src="x" onerror="window.__pwned = 2">',
      '<a href="javascript:window.__pwned=3">js link</a>',
      '[md js](javascript:window.__pwned=4)',
      '<iframe src="https://example.com"></iframe>',
      '<div onmouseover="window.__pwned=5">hover me</div>',
      '<svg><script>window.__pwned=6</script></svg>',
      '<a href="data:text/html,<script>alert(1)</script>">data link</a>',
      '<details open ontoggle="window.__pwned=7"><summary>s</summary>x</details>',
      '<math><mtext><table><mglyph><style><img src=x onerror="window.__pwned=8">',
    ].join('\n\n'),
  });
  await openFolder(page, '/evil');
  await treeRow(page, 'evil.md').click();
  await expect(preview(page).locator('h1')).toHaveText('Evil');
  await preview(page).getByText('hover me').hover();
  await preview(page).getByText('js link').click();
  await preview(page).getByText('md js').click();
  await preview(page).getByText('data link').click();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(await preview(page).locator('script, iframe').count()).toBe(0);
  expect(page.url()).toContain('localhost:1420');
  await shot(page, 'm3', 'malicious-neutralized');
});
