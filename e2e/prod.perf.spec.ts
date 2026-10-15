import { expect, test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { bigMarkdown } from '../scripts/fixtures';
import { bigFolder } from '../scripts/fixtures';
import { boot, mod, openFolder, seed, treeRow } from './helpers';

test.describe.configure({ mode: 'serial' });

function record(line: string) {
  mkdirSync('test-results', { recursive: true });
  appendFileSync('test-results/perf.txt', line + '\n');
  console.log(line);
}

test('1 MB markdown renders in under 300 ms', async ({ page }) => {
  const doc = bigMarkdown(1_000_000);
  expect(doc.length).toBeGreaterThan(1_000_000);
  await boot(page);
  await seed(page, { '/perf/big.md': doc, '/perf/small.md': '# small' });
  await openFolder(page, '/perf');
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    await treeRow(page, 'small.md').click();
    await expect(page.locator('.titlebar__file')).toHaveText('small.md');
    await treeRow(page, 'big.md').click();
    const article = page.locator('[data-pane="preview"] .markdown-body');
    await expect(article.locator('h1')).toHaveText('Big document');
    samples.push(Number(await article.getAttribute('data-render-ms')));
    record(`  parse+sanitize ${await article.getAttribute('data-parse-ms')} ms`);
  }
  const best = Math.min(...samples);
  record(
    `render 1MB: ${samples.map((s) => s.toFixed(0)).join(' / ')} ms (best ${best.toFixed(0)} ms, target < 300)`,
  );
  // Slower machines can loosen the budget with PERF_BUDGET_MS.
  expect(best).toBeLessThan(Number(process.env.PERF_BUDGET_MS ?? 300));
});

test('production build renders every feature under the app CSP', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on('pageerror', (e) => violations.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.titlebar__file')).toHaveText('Welcome.md');
  await treeRow(page, 'Rendering.md').click();
  const p = page.locator('[data-pane="preview"] .markdown-body');
  await expect(p).toHaveAttribute('data-settled', 'true', { timeout: 20_000 });
  await expect(p.locator('pre.shiki')).toHaveCount(4);
  await expect(p.locator('.math[data-rendered] .katex')).toHaveCount(3);
  await expect(p.locator('.mermaid-block.mermaid-rendered svg')).toHaveCount(2);
  expect(violations).toEqual([]);
});

test('2,000-file folder indexes in the background without blocking the UI', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  const files = bigFolder(2000);
  await page.evaluate((f) => {
    const fs = window.__biblozenFake!.fs;
    for (const [p, c] of Object.entries(f)) fs.write(`/big/${p}`, c, false);
  }, files);
  // Watch for long main-thread tasks during the build.
  await page.evaluate(() => {
    (window as unknown as { __longTasks: number[] }).__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        (window as unknown as { __longTasks: number[] }).__longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  const t0 = Date.now();
  await openFolder(page, '/big');
  // UI is usable right away: open the palette and a file while indexing.
  await page.keyboard.press(`${mod}+Shift+P`);
  await expect(page.getByRole('combobox')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+p`);
  await page.getByRole('combobox').fill('note-1999');
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar__file')).toHaveText('note-1999.md');
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('b');
  // Wait until indexing is done and backlinks resolve.
  await expect(
    page.getByRole('list', { name: 'Notes linking here' }).locator('.backlinks__group').first(),
  ).toBeVisible({ timeout: 60_000 });
  const elapsed = Date.now() - t0;
  const longTasks = await page.evaluate(
    () => (window as unknown as { __longTasks: number[] }).__longTasks,
  );
  const worst = Math.max(0, ...longTasks);
  record(
    `index 2000 files: ${elapsed} ms to backlinks; worst main-thread task ${Math.round(worst)} ms (target < 250)`,
  );
  expect(worst).toBeLessThan(250);
});
