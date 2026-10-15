// Pure tree logic: sorting, filtering, flattening for keyboard navigation.

import { isImage, isMarkdown } from '../platform/path';
import type { TreeNode } from '../platform/types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural, case-insensitive compare: file2 < file10. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

export function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .sort((a, b) =>
      a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : naturalCompare(a.name, b.name),
    )
    .map((n) => (n.children ? { ...n, children: sortNodes(n.children) } : n));
}

function hasAnyFile(n: TreeNode): boolean {
  return (n.children ?? []).some((c) => c.kind === 'file' || hasAnyFile(c));
}

/**
 * "Markdown only": keeps markdown files and folders that contain markdown somewhere
 * below them. Folders with no files at all stay visible, so a freshly created folder
 * doesn't vanish. "All files" keeps everything.
 */
export function filterTree(node: TreeNode, markdownOnly: boolean): TreeNode {
  if (!markdownOnly) return node;
  const walk = (n: TreeNode): TreeNode | null => {
    if (n.kind === 'file') return isMarkdown(n.name) ? n : null;
    const kids = (n.children ?? []).map(walk).filter((c): c is TreeNode => c !== null);
    if (kids.length === 0 && hasAnyFile(n)) return null;
    return { ...n, children: kids };
  };
  return walk(node) ?? { ...node, children: [] };
}

export interface Row {
  node: TreeNode;
  depth: number;
  parent: string | null;
  expanded: boolean;
}

/** Visible rows in display order, given the expanded set. */
export function flattenVisible(root: TreeNode, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const walk = (nodes: TreeNode[], depth: number, parent: string | null) => {
    for (const n of nodes) {
      const isOpen = n.kind === 'dir' && expanded.has(n.path);
      rows.push({ node: n, depth, parent, expanded: isOpen });
      if (isOpen && n.children) walk(n.children, depth + 1, n.path);
    }
  };
  walk(root.children ?? [], 0, null);
  return rows;
}

/** Type-to-filter: matching files plus their ancestor folders, all expanded. */
export function filterRows(root: TreeNode, query: string): Row[] {
  const q = query.toLowerCase();
  const rows: Row[] = [];
  const walk = (nodes: TreeNode[], depth: number, parent: string | null): boolean => {
    let any = false;
    for (const n of nodes) {
      if (n.kind === 'file') {
        if (n.name.toLowerCase().includes(q)) {
          rows.push({ node: n, depth, parent, expanded: false });
          any = true;
        }
      } else {
        const mark = rows.length;
        rows.push({ node: n, depth, parent, expanded: true });
        const hit = walk(n.children ?? [], depth + 1, n.path) || n.name.toLowerCase().includes(q);
        if (!hit) rows.length = mark;
        any ||= hit;
      }
    }
    return any;
  };
  walk(root.children ?? [], 0, null);
  return rows;
}

export function findNode(root: TreeNode, path: string): TreeNode | null {
  if (root.path === path) return root;
  for (const c of root.children ?? []) {
    const f = findNode(c, path);
    if (f) return f;
  }
  return null;
}

export function countFiles(root: TreeNode, pred: (name: string) => boolean = () => true): number {
  return (root.children ?? []).reduce(
    (n, c) => n + (c.kind === 'file' ? (pred(c.name) ? 1 : 0) : countFiles(c, pred)),
    0,
  );
}

export function allFiles(root: TreeNode): string[] {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    for (const c of n.children ?? []) {
      if (c.kind === 'file') out.push(c.path);
      else walk(c);
    }
  };
  walk(root);
  return out;
}

/** "Untitled.md", "Untitled 2.md", … not in `taken` (case-insensitive). */
export function uniqueName(taken: string[], base: string, ext: string): string {
  const set = new Set(taken.map((t) => t.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `${base}${n === 1 ? '' : ` ${n}`}${ext}`;
    if (!set.has(name.toLowerCase())) return name;
  }
}

/** Returns an error message, or null when the name is valid on every OS. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Name can’t be empty';
  if (n === '.' || n === '..') return 'That name is reserved';
  if (/[\\/]/.test(n)) return 'Name can’t contain / or \\';
  if (/[<>:"|?*]/.test(n)) return 'Name can’t contain < > : " | ? *';
  if (/[. ]$/.test(n)) return 'Name can’t end with a dot or space';
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) return 'That name is reserved on Windows';
  return null;
}

/** Adds `.md` when the user typed a bare name for a new note. */
export function withMarkdownExt(name: string): string {
  const n = name.trim();
  return /\.[a-z0-9]+$/i.test(n) ? n : `${n}.md`;
}

export function iconKind(n: TreeNode): 'dir' | 'markdown' | 'image' | 'file' {
  if (n.kind === 'dir') return 'dir';
  if (isMarkdown(n.name)) return 'markdown';
  if (isImage(n.name)) return 'image';
  return 'file';
}
