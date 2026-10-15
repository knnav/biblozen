import { expect, test, type Page } from '@playwright/test';
import { boot, fakeRead, mod, openFolder, seed, shot, treeRow } from './helpers';

const editor = (page: Page) => page.locator('[data-pane="editor"] .cm-content');
const preview = (page: Page) => page.locator('[data-pane="preview"] .markdown-body');

async function openDoc(page: Page, files: Record<string, string>, name: string) {
  await boot(page);
  await seed(page, files);
  await openFolder(page, '/w');
  await treeRow(page, name).click();
  await expect(page.locator('.titlebar__file')).toHaveText(name);
}

/** Scrolls the (virtualized) editor so the line with `text` is at the top. */
async function scrollEditorTo(page: Page, text: string) {
  await page.evaluate(async (t) => {
    const mod = '/src/editor/controller.ts';
    const c = await import(/* @vite-ignore */ mod);
    const doc = c.getView().state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      if (doc.line(i).text === t) {
        c.scrollEditorToLine(i - 1);
        break;
      }
    }
  }, text);
}

async function edit(page: Page) {
  await page.keyboard.press(`${mod}+e`);
  await expect(editor(page)).toBeVisible();
  await editor(page).focus();
}

test('edit → save round-trips CRLF line endings and the trailing newline', async ({ page }) => {
  await openDoc(page, { '/w/crlf.md': '# Title\r\n\r\nFirst line\r\nSecond line\r\n' }, 'crlf.md');
  await edit(page);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type('Third line');
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar__dirty')).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('.statusbar__save')).toHaveText('Unsaved');
  await expect(page.locator('.tree__dirty')).toBeVisible();
  await shot(page, 'm6', 'split-dirty');
  await page.keyboard.press(`${mod}+s`);
  await expect(page.locator('.statusbar__save')).toHaveText('Saved');
  expect(await fakeRead(page, '/w/crlf.md')).toBe(
    '# Title\r\n\r\nFirst line\r\nSecond line\r\nThird line\r\n',
  );
  await expect(page.locator('.titlebar__dirty')).toHaveAttribute('data-visible', 'false');
});

test('LF files without a trailing newline stay that way', async ({ page }) => {
  await openDoc(page, { '/w/lf.md': 'a\nb' }, 'lf.md');
  await edit(page);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type('c');
  await page.keyboard.press(`${mod}+s`);
  await expect.poll(() => fakeRead(page, '/w/lf.md')).toBe('a\nbc');
});

test('external change while editing shows the banner; Reload / Keep mine / diff', async ({
  page,
}) => {
  await openDoc(page, { '/w/doc.md': '# Doc\n\nline one\nline two\n' }, 'doc.md');
  await edit(page);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type('my edit');
  await seed(page, { '/w/doc.md': '# Doc\n\nline one CHANGED\nline two\n' });
  const banner = page.getByRole('alert').filter({ hasText: 'changed on disk' });
  await expect(banner).toBeVisible();
  await shot(page, 'm6', 'conflict-banner');
  await banner.getByRole('button', { name: 'Show Diff' }).click();
  const diff = page.getByRole('dialog', { name: /Differences/ });
  await expect(
    diff.locator('.diff__line--del').filter({ hasText: 'line one CHANGED' }),
  ).toHaveCount(1);
  await expect(diff.locator('.diff__line--add').filter({ hasText: 'my edit' })).toHaveCount(1);
  await shot(page, 'm6', 'conflict-diff');
  await diff.getByRole('button', { name: 'Close' }).click();
  // Keep mine → saving overwrites the disk version.
  await banner.getByRole('button', { name: 'Keep Mine' }).click();
  await expect(banner).toHaveCount(0);
  await page.keyboard.press(`${mod}+s`);
  await expect.poll(() => fakeRead(page, '/w/doc.md')).toContain('my edit');
  // Another external change, this time Reload.
  await editor(page).focus();
  await page.keyboard.type('!');
  await seed(page, { '/w/doc.md': 'from disk\n' });
  await page
    .getByRole('alert')
    .filter({ hasText: 'changed on disk' })
    .getByRole('button', { name: 'Reload' })
    .click();
  await expect(editor(page)).toHaveText('from disk');
  await expect(page.locator('.statusbar__save')).toHaveText('Saved');
});

test('external change with no unsaved edits reloads silently', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': 'v1\n' }, 'doc.md');
  await edit(page);
  await seed(page, { '/w/doc.md': 'v2 from outside\n' });
  await expect(editor(page)).toHaveText('v2 from outside');
  await expect(page.getByRole('alert').filter({ hasText: 'changed on disk' })).toHaveCount(0);
});

test('no data loss on window close: Cancel keeps the window, Save writes', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': 'v1\n' }, 'doc.md');
  await edit(page);
  await page.keyboard.type('unsaved ');
  const close = page.evaluate(() => window.__biblozenFake!.requestClose());
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Save changes to “doc.md”?');
  await shot(page, 'm6', 'close-prompt');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(await close).toBe(false);
  const close2 = page.evaluate(() => window.__biblozenFake!.requestClose());
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save', exact: true }).click();
  expect(await close2).toBe(true);
  expect(await fakeRead(page, '/w/doc.md')).toBe('unsaved v1\n');
  // Clean documents close without asking.
  expect(await page.evaluate(() => window.__biblozenFake!.requestClose())).toBe(true);
});

test('switching files with unsaved changes asks Save / Discard / Cancel', async ({ page }) => {
  await openDoc(page, { '/w/a.md': 'A\n', '/w/b.md': 'B\n' }, 'a.md');
  await edit(page);
  await page.keyboard.type('x');
  await treeRow(page, 'b.md').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.titlebar__file')).toHaveText('a.md');
  await treeRow(page, 'b.md').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Don’t Save' }).click();
  await expect(page.locator('.titlebar__file')).toHaveText('b.md');
  expect(await fakeRead(page, '/w/a.md')).toBe('A\n');
});

test('formatting keys, list continuation and list indentation', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': '' }, 'doc.md');
  await edit(page);
  await page.keyboard.type('make ');
  await page.keyboard.press(`${mod}+b`);
  await page.keyboard.type('bold');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nested');
  await page.keyboard.press(`${mod}+s`);
  await expect
    .poll(() => fakeRead(page, '/w/doc.md'))
    .toBe('make **bold**\n\n- first\n- second\n  - nested');
  await expect(preview(page).locator('strong')).toHaveText('bold');
  await expect(preview(page).locator('li li')).toHaveText('nested');
});

test('find and replace in the editor', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': 'cat and cat\n' }, 'doc.md');
  await edit(page);
  await page.keyboard.press(`${mod}+h`);
  const replace = page.locator('.cm-search input[name=replace]');
  await expect(replace).toBeFocused();
  await page.locator('.cm-search input[name=search]').fill('cat');
  await replace.fill('dog');
  await page.locator('.cm-search button[name=replaceAll]').click();
  await expect(editor(page)).toHaveText('dog and dog');
  await shot(page, 'm6', 'find-replace');
});

test('preview re-renders shortly after typing', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': '# Start\n' }, 'doc.md');
  await edit(page);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type('\n## Added heading');
  await expect(preview(page).locator('h2')).toHaveText('Added heading');
});

test('mode switch keeps the reading position', async ({ page }) => {
  const long = Array.from(
    { length: 80 },
    (_, i) => `## Section ${i}\n\nParagraph ${i} text.\n`,
  ).join('\n');
  await openDoc(page, { '/w/long.md': long }, 'long.md');
  await page.locator('#section-40').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(100);
  await page.locator('[data-pane="preview"] [data-scroll]').focus();
  await page.keyboard.press('e'); // → split
  await expect(editor(page)).toBeVisible();
  const topEditorLine = () =>
    page.evaluate(() => {
      const sc = document.querySelector('[data-pane="editor"] .cm-scroller')!;
      const top = sc.getBoundingClientRect().top + 30;
      const line = [...document.querySelectorAll('.cm-line')].find(
        (l) => l.getBoundingClientRect().bottom > top,
      );
      return line?.textContent ?? '';
    });
  await expect.poll(topEditorLine).toMatch(/Section 40|Paragraph 39|Paragraph 40/);
  await page.keyboard.press(`${mod}+Backslash`); // editor only
  await expect.poll(topEditorLine).toMatch(/Section 40|Paragraph 39|Paragraph 40/);
  // Scroll the editor further and go back to reading.
  await scrollEditorTo(page, '## Section 60');
  await page.waitForTimeout(100);
  await page.keyboard.press(`${mod}+e`);
  await expect
    .poll(() =>
      page.locator('#section-60').evaluate((h) => Math.round(h.getBoundingClientRect().top)),
    )
    .toBeLessThan(160);
});

test('split view scroll sync follows the editor', async ({ page }) => {
  const long = Array.from({ length: 80 }, (_, i) => `## Part ${i}\n\nText ${i}.\n`).join('\n');
  await openDoc(page, { '/w/long.md': long }, 'long.md');
  await edit(page);
  await scrollEditorTo(page, '## Part 50');
  await expect
    .poll(() =>
      page
        .locator('#part-50')
        .evaluate((h) =>
          Math.abs(
            h.getBoundingClientRect().top - h.closest('[data-scroll]')!.getBoundingClientRect().top,
          ),
        ),
    )
    .toBeLessThan(80);
  await shot(page, 'm6', 'split-scroll-sync');
});

test('pasting an image saves it to assets/ and links it', async ({ page }) => {
  await openDoc(page, { '/w/My Note.md': 'Intro\n' }, 'My Note.md');
  await edit(page);
  await page.keyboard.press(`${mod}+End`);
  await page.evaluate(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>';
    const dt = new DataTransfer();
    dt.items.add(new File([svg], 'image.svg', { type: 'image/svg+xml' }));
    document
      .querySelector('[data-pane="editor"] .cm-content')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
  });
  await expect(editor(page)).toContainText('![](assets/My%20Note-');
  const files = await page.evaluate(() =>
    window.__biblozenFake!.fs.allPaths().filter((p) => p.startsWith('/w/assets/')),
  );
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^\/w\/assets\/My Note-\d{8}-\d{6}\.svg$/);
  await expect(preview(page).locator('img')).toHaveCount(1);
});

test('autosave after idle', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': 'v1\n' }, 'doc.md');
  await page.evaluate(() => {
    const fs = window.__biblozenFake!.fs;
    const s = JSON.parse(fs.read('/data/settings.json'));
    s.editor.autosave = 'idle';
    s.editor.autosaveDelaySec = 1;
    fs.write('/data/settings.json', JSON.stringify(s));
  });
  await edit(page);
  await page.waitForTimeout(300);
  await page.keyboard.type('auto ');
  await expect.poll(() => fakeRead(page, '/w/doc.md'), { timeout: 4000 }).toBe('auto v1\n');
});

test('vim mode toggles from the palette', async ({ page }) => {
  await openDoc(page, { '/w/doc.md': 'hello\n' }, 'doc.md');
  await edit(page);
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('toggle vim');
  await page.keyboard.press('Enter');
  await editor(page).focus();
  await expect(page.locator('.cm-fat-cursor')).toBeVisible();
  await page.keyboard.press('x'); // vim: delete char
  await expect(editor(page)).toHaveText('ello');
});

test('task toggle while dirty edits the buffer instead of saving', async ({ page }) => {
  await openDoc(page, { '/w/t.md': '- [ ] task\n\nend\n' }, 't.md');
  await edit(page);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type('x');
  await page.waitForTimeout(250);
  await preview(page).locator('input.task-list-item-checkbox').click();
  await expect(editor(page)).toContainText('- [x] task');
  expect(await fakeRead(page, '/w/t.md')).toBe('- [ ] task\n\nend\n');
});
