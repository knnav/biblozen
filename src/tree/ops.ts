// File operations triggered from the tree, palette and shortcuts.

import {
  closeDocument,
  openFile,
  persistExpanded,
  refreshTree,
  selectedOrActiveDir,
} from '../app/actions';
import { useDocument } from '../app/document';
import { toast, toastError } from '../app/toasts';
import { useWorkspace } from '../app/workspace';
import { getPlatform } from '../platform';
import { basename, dirname, isInside, join, relative, samePath } from '../platform/path';
import { confirm } from '../ui/dialog';
import { findNode, validateName, withMarkdownExt } from './model';
import { useTree } from './store';

/** Shows the inline "new file/folder" row in the right folder. */
export function startCreate(kind: 'file' | 'dir', parent?: string): void {
  const dir = parent ?? selectedOrActiveDir();
  if (!dir) {
    toast('Open a folder first', 'info');
    return;
  }
  const root = useWorkspace.getState().root!;
  const expanded = new Set(useTree.getState().expanded);
  if (!samePath(dir, root)) expanded.add(dir);
  useTree.setState({ creating: { parent: dir, kind }, expanded, filter: '', renaming: null });
  if (useWorkspace.getState().treeCollapsed) useWorkspace.getState().setTreeCollapsed(false);
}

export async function commitCreate(name: string): Promise<string | null> {
  const c = useTree.getState().creating;
  if (!c) return null;
  const err = validateName(name);
  if (err) {
    toast(err, 'warning');
    return null;
  }
  const platform = getPlatform();
  const finalName = c.kind === 'file' ? withMarkdownExt(name) : name.trim();
  const path = join(c.parent, finalName);
  try {
    if (c.kind === 'file') await platform.createFile(path, '');
    else await platform.createDir(path);
  } catch (e) {
    toastError(e, `Could not create “${finalName}”`);
    return null;
  }
  useTree.setState({ creating: null, selected: path });
  await refreshTree();
  // Spec: a new file opens in edit mode.
  if (c.kind === 'file') await openFile(path, { mode: 'edit' });
  return path;
}

export function cancelCreate(): void {
  useTree.setState({ creating: null });
}

export async function renamePath(path: string, newName: string): Promise<string | null> {
  const err = validateName(newName);
  if (err) {
    toast(err, 'warning');
    return null;
  }
  const target = join(dirname(path), newName.trim());
  useTree.setState({ renaming: null });
  if (target === path) return path;
  return movePath(path, target);
}

/** Moves/renames, keeping the open document, selection and expansion in sync. */
export async function movePath(from: string, to: string): Promise<string | null> {
  try {
    await getPlatform().rename(from, to);
  } catch (e) {
    toastError(e, `Could not move “${basename(from)}”`);
    return null;
  }
  const remap = (p: string) =>
    samePath(p, from) || isInside(from, p, false) ? to + p.slice(from.length) : p;
  const doc = useDocument.getState();
  if (doc.path && (samePath(doc.path, from) || isInside(from, doc.path))) {
    const np = remap(doc.path);
    useDocument.setState({ path: np });
    useWorkspace.setState({ file: np });
  }
  const t = useTree.getState();
  useTree.setState({
    expanded: new Set([...t.expanded].map(remap)),
    selected: t.selected ? remap(t.selected) : null,
  });
  persistExpanded();
  await refreshTree();
  return to;
}

export async function moveInto(path: string, targetDir: string): Promise<void> {
  if (samePath(dirname(path), targetDir)) return;
  if (samePath(path, targetDir) || isInside(path, targetDir)) {
    toast('Can’t move a folder into itself', 'warning');
    return;
  }
  await movePath(path, join(targetDir, basename(path)));
}

export async function duplicatePath(path: string): Promise<void> {
  try {
    const p = await getPlatform().duplicate(path);
    useTree.setState({ selected: p });
    await refreshTree();
  } catch (e) {
    toastError(e, `Could not duplicate “${basename(path)}”`);
  }
}

export async function trashPath(path: string): Promise<void> {
  const node = useTree.getState().listing ? findNode(useTree.getState().listing!, path) : null;
  const isDir = node?.kind === 'dir';
  const ok = await confirm({
    title: `Move “${basename(path)}” to the trash?`,
    message: isDir
      ? 'The folder and everything in it will be moved to the trash. You can restore it from there.'
      : 'You can restore it from the trash.',
    confirmLabel: 'Move to Trash',
    danger: true,
  });
  if (!ok) return;
  try {
    await getPlatform().trash(path);
  } catch (e) {
    toastError(e, `Could not move “${basename(path)}” to the trash`);
    return;
  }
  const doc = useDocument.getState();
  if (doc.path && (samePath(doc.path, path) || isInside(path, doc.path))) closeDocument();
  // Select a neighbour so keyboard users keep their place.
  const t = useTree.getState();
  if (t.selected && (samePath(t.selected, path) || isInside(path, t.selected)))
    useTree.setState({ selected: null });
  await refreshTree();
  toast(`Moved “${basename(path)}” to the trash`, 'success');
}

export async function copyPath(path: string, rel: boolean): Promise<void> {
  const root = useWorkspace.getState().root;
  const text = rel && root ? relative(root, path) : path;
  try {
    await getPlatform().copyText(text);
    toast(rel ? 'Copied relative path' : 'Copied path', 'success', { detail: text, timeout: 2500 });
  } catch (e) {
    toastError(e, 'Could not copy');
  }
}

export async function revealInOs(path: string): Promise<void> {
  try {
    await getPlatform().reveal(path);
  } catch (e) {
    toastError(e, 'Could not reveal');
  }
}

export function revealLabel(): string {
  const os = getPlatform().os;
  return os === 'macos'
    ? 'Reveal in Finder'
    : os === 'windows'
      ? 'Reveal in Explorer'
      : 'Reveal in File Manager';
}
