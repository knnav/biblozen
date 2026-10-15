import { closeFolder, openFolder, openPath, revealInTree } from '../app/actions';
import { useDocument } from '../app/document';
import { toast } from '../app/toasts';
import { useWorkspace } from '../app/workspace';
import type { Command, CommandContext } from '../commands/registry';
import { getPlatform } from '../platform';
import { useSettings } from '../settings/store';
import { ensureWelcomeFolder } from '../welcome';
import { join } from '../platform/path';
import { copyPath, duplicatePath, revealInOs, revealLabel, startCreate, trashPath } from './ops';
import { useTree } from './store';

const hasRoot = () => useWorkspace.getState().root !== null;
const activePath = () => useDocument.getState().path;
const hasFile = (_c: CommandContext) => activePath() !== null;

export function fileCommands(): Command[] {
  return [
    {
      id: 'folder.open',
      title: 'Open Folder…',
      category: 'File',
      keys: ['Mod+Alt+O'],
      run: async () => {
        const p = await getPlatform().pickFolder();
        if (p) await openPath(p);
      },
    },
    {
      id: 'file.open',
      title: 'Open File…',
      category: 'File',
      keys: ['Mod+O'],
      run: async () => {
        const p = await getPlatform().pickFile();
        if (p) await openPath(p);
      },
    },
    {
      id: 'folder.openRecent',
      title: 'Open Recent Folder…',
      category: 'File',
      run: () => useWorkspace.getState().openOverlay('recentFolders'),
    },
    {
      id: 'welcome.open',
      title: 'Open Welcome Folder',
      category: 'Help',
      run: async () => {
        const root = await ensureWelcomeFolder();
        if (useWorkspace.getState().root) await openPath(join(root, 'Welcome.md'));
        else await openFolder(root, { file: join(root, 'Welcome.md') });
      },
    },
    {
      id: 'window.new',
      title: 'New Window',
      category: 'File',
      keys: ['Mod+Shift+N'],
      run: () => getPlatform().newWindow(),
    },
    {
      id: 'folder.close',
      title: 'Close Folder',
      category: 'File',
      when: hasRoot,
      run: () => closeFolder(),
    },
    {
      id: 'file.new',
      title: 'New File',
      category: 'File',
      keys: ['Mod+N'],
      when: hasRoot,
      run: () => startCreate('file'),
    },
    {
      id: 'folder.new',
      title: 'New Folder',
      category: 'File',
      when: hasRoot,
      run: () => startCreate('dir'),
    },
    {
      id: 'tree.reveal',
      title: 'Reveal Active File in Sidebar',
      category: 'View',
      keys: ['Mod+Shift+E'],
      when: hasRoot,
      run: () => {
        const p = activePath();
        if (useWorkspace.getState().treeCollapsed) useWorkspace.getState().setTreeCollapsed(false);
        if (useWorkspace.getState().focusMode)
          useWorkspace.getState().dispatchMode({ type: 'exitFocus' });
        if (p) revealInTree(p, true);
        else requestAnimationFrame(() => document.querySelector<HTMLElement>('.tree')?.focus());
      },
    },
    {
      id: 'tree.collapseAll',
      title: 'Collapse All Folders',
      category: 'View',
      when: hasRoot,
      run: () => useTree.setState({ expanded: new Set() }),
    },
    {
      id: 'files.toggleMarkdownOnly',
      title: 'Toggle Markdown Only / All Files',
      category: 'View',
      when: hasRoot,
      run: () => {
        const s = useSettings.getState();
        s.set('files.markdownOnly', !s.settings.files.markdownOnly);
        toast(
          s.settings.files.markdownOnly ? 'Showing all files' : 'Showing Markdown files only',
          'info',
          {
            timeout: 2000,
          },
        );
      },
    },
    {
      id: 'file.rename',
      title: 'Rename File…',
      category: 'File',
      when: hasFile,
      run: () => {
        const p = activePath()!;
        revealInTree(p, false);
        useTree.setState({ renaming: p });
      },
    },
    {
      id: 'file.duplicate',
      title: 'Duplicate File',
      category: 'File',
      when: hasFile,
      run: () => duplicatePath(activePath()!),
    },
    {
      id: 'file.trash',
      title: 'Move File to Trash',
      category: 'File',
      when: hasFile,
      run: () => trashPath(activePath()!),
    },
    {
      id: 'file.reveal',
      title: revealLabel(),
      category: 'File',
      when: hasFile,
      run: () => revealInOs(activePath()!),
    },
    {
      id: 'file.copyPath',
      title: 'Copy Path of Active File',
      category: 'File',
      when: hasFile,
      run: () => copyPath(activePath()!, false),
    },
    {
      id: 'file.copyRelativePath',
      title: 'Copy Relative Path of Active File',
      category: 'File',
      when: hasFile,
      run: () => copyPath(activePath()!, true),
    },
  ];
}
