import { expect, test } from '@playwright/test';
import { boot, fakeRead, mod, openFolder, seed, shot, treeRow } from './helpers';

const FILES = {
  '/notes/file10.md': '# Ten',
  '/notes/file2.md': '# Two',
  '/notes/guide/intro.md': '# Intro\n\nHello',
  '/notes/guide/setup.md': '# Setup',
  '/notes/assets/pic.png': 'PNG',
  '/notes/todo.txt': 'x',
  '/notes/.gitignore': 'x',
};

test.beforeEach(async ({ page }) => {
  await boot(page);
  await seed(page, FILES);
});

test('shows folders first with natural sort and filters markdown', async ({ page }) => {
  await openFolder(page, '/notes');
  const names = await page.getByRole('treeitem').allTextContents();
  expect(names).toEqual(['guide', 'file2.md', 'file10.md']);
  await shot(page, 'm2', 'tree-markdown-only');
  await page.getByRole('button', { name: 'Show all files' }).click();
  await expect(page.getByRole('treeitem')).toHaveText([
    'assets',
    'guide',
    'file2.md',
    'file10.md',
    'todo.txt',
  ]);
  await shot(page, 'm2', 'tree-all-files');
});

test('external changes appear live', async ({ page }) => {
  await openFolder(page, '/notes');
  await seed(page, { '/notes/added.md': 'new' });
  await expect(treeRow(page, 'added.md')).toBeVisible();
  await page.evaluate(() => window.__biblozenFake!.fs.remove('/notes/file2.md'));
  await expect(treeRow(page, 'file2.md')).toHaveCount(0);
  await page.evaluate(() =>
    window.__biblozenFake!.fs.rename('/notes/file10.md', '/notes/renamed.md'),
  );
  await expect(treeRow(page, 'renamed.md')).toBeVisible();
});

test('delete goes to the trash after confirmation', async ({ page }) => {
  await openFolder(page, '/notes');
  await treeRow(page, 'file2.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Move “file2.md” to the trash?');
  await shot(page, 'm2', 'confirm-trash');
  await dialog.getByRole('button', { name: 'Move to Trash' }).click();
  await expect(treeRow(page, 'file2.md')).toHaveCount(0);
  const trashed = await page.evaluate(() => window.__biblozenFake!.fs.trashed);
  expect(trashed).toEqual(['/notes/file2.md']);
});

test('tree is fully keyboard-operable', async ({ page }) => {
  await openFolder(page, '/notes');
  // Focus the tree without the mouse.
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByRole('tree')).toBeFocused();
  await expect(treeRow(page, 'guide')).toHaveAttribute('aria-selected', 'true');
  // Expand guide, go into it, open intro.md.
  await page.keyboard.press('ArrowRight');
  await expect(treeRow(page, 'guide')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(treeRow(page, 'intro.md')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar__file')).toHaveText('intro.md');
  await expect(page.locator('[data-pane="preview"]')).toContainText('Hello');
  // Enter moved focus to the content; come back to the tree on the active file.
  await expect(page.getByRole('tree')).not.toBeFocused();
  await page.keyboard.press(`${mod}+Shift+E`);
  await expect(page.getByRole('tree')).toBeFocused();
  await expect(treeRow(page, 'intro.md')).toHaveAttribute('aria-selected', 'true');
  // Left goes to parent, Left again collapses.
  await page.keyboard.press('ArrowLeft');
  await expect(treeRow(page, 'guide')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(treeRow(page, 'guide')).toHaveAttribute('aria-expanded', 'false');
  // Rename with F2.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('F2');
  const input = page.getByRole('textbox', { name: 'Rename file2.md' });
  await expect(input).toBeFocused();
  await page.keyboard.type('second');
  await page.keyboard.press('Enter');
  await expect(treeRow(page, 'second.md')).toBeVisible();
  expect(await fakeRead(page, '/notes/second.md')).toBe('# Two');
  await expect(page.getByRole('tree')).toBeFocused();
  // Context menu from the keyboard → New Folder.
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await shot(page, 'm2', 'context-menu');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('drafts');
  await page.keyboard.press('Enter');
  await expect(treeRow(page, 'drafts')).toBeVisible();
  // Type-to-filter.
  await page.getByRole('tree').focus();
  await page.keyboard.type('setu');
  await expect(page.getByRole('treeitem')).toHaveText(['guide', 'setup.md']);
  await shot(page, 'm2', 'type-to-filter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem')).toHaveCount(4);
});

test('new file opens in edit mode', async ({ page }) => {
  await openFolder(page, '/notes');
  await page.keyboard.press(`${mod}+n`);
  const input = page.getByRole('textbox', { name: 'New file name' });
  await expect(input).toBeFocused();
  await page.keyboard.type('fresh');
  await page.keyboard.press('Enter');
  await expect(treeRow(page, 'fresh.md')).toBeVisible();
  await expect(page.locator('.workarea')).toHaveAttribute('data-layout', 'split');
  expect(await fakeRead(page, '/notes/fresh.md')).toBe('');
});

test('drag a file into a folder moves it', async ({ page }) => {
  await openFolder(page, '/notes');
  await treeRow(page, 'file2.md').dragTo(treeRow(page, 'guide'));
  await expect(treeRow(page, 'file2.md')).toHaveCount(0);
  expect(await fakeRead(page, '/notes/guide/file2.md')).toBe('# Two');
});

test('context menu copies paths and reveals', async ({ page }) => {
  await openFolder(page, '/notes');
  await treeRow(page, 'file10.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy Relative Path' }).click();
  await treeRow(page, 'file10.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Reveal in/ }).click();
  const fake = await page.evaluate(() => ({
    clip: window.__biblozenFake!.clipboard,
    rev: window.__biblozenFake!.revealed,
  }));
  expect(fake.clip).toEqual(['file10.md']);
  expect(fake.rev).toEqual(['/notes/file10.md']);
});

test('empty states: no folder, empty folder, recent folders', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Open Folder/ })).toBeVisible();
  await shot(page, 'm2', 'empty-no-folder');
  await seed(page, { '/empty/readme.txt': 'not markdown' });
  await openFolder(page, '/empty');
  await expect(page.getByText('No Markdown files').first()).toBeVisible();
  await shot(page, 'm2', 'empty-folder');
  await page.keyboard.press(`${mod}+Shift+P`);
  await page.getByRole('combobox').fill('close folder');
  await page.keyboard.press('Enter');
  const recent = page.getByRole('region', { name: 'Recent folders' });
  await expect(recent.getByRole('button', { name: /empty/ }).first()).toBeVisible();
  await shot(page, 'm2', 'empty-recent-folders');
  await recent.getByRole('button', { name: 'Remove empty from recent folders' }).click();
  await expect(recent).toHaveCount(0);
});

test('folder-level state (expansion, last file) restores after restart', async ({ page }) => {
  await openFolder(page, '/notes');
  await treeRow(page, 'guide').click();
  await treeRow(page, 'setup.md').click();
  await expect(page.locator('.titlebar__file')).toHaveText('setup.md');
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('.app[data-loaded="true"]').waitFor({ state: 'attached' });
  await seed(page, FILES);
  await openFolder(page, '/notes');
  await expect(treeRow(page, 'setup.md')).toBeVisible();
  await expect(page.locator('.titlebar__file')).toHaveText('setup.md');
});
