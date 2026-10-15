import {
  ChevronRight,
  Copy,
  CopyPlus,
  File,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  Link2,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { focusContent, openFile, persistExpanded } from '../app/actions';
import { isDirty, useDocument } from '../app/document';
import { useWorkspace } from '../app/workspace';
import { getPlatform } from '../platform';
import { dirname, extname, samePath } from '../platform/path';
import type { TreeNode } from '../platform/types';
import { useSettings } from '../settings/store';
import { Menu, type MenuEntry } from '../ui/Menu';
import { filterRows, filterTree, findNode, flattenVisible, iconKind, type Row } from './model';
import {
  cancelCreate,
  commitCreate,
  copyPath,
  duplicatePath,
  moveInto,
  renamePath,
  revealInOs,
  revealLabel,
  startCreate,
  trashPath,
} from './ops';
import { useTree } from './store';
import './Tree.css';

const INDENT = 12;

function NodeIcon({ node, open }: { node: TreeNode; open: boolean }) {
  const k = iconKind(node);
  const props = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
  if (k === 'dir') return open ? <FolderOpen {...props} /> : <Folder {...props} />;
  if (k === 'markdown') return <FileText {...props} />;
  if (k === 'image') return <Image {...props} />;
  return <File {...props} />;
}

function NameInput({
  initial,
  selectStem,
  onCommit,
  onCancel,
  label,
}: {
  initial: string;
  selectStem: boolean;
  onCommit: (v: string) => void;
  onCancel: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    const ext = selectStem ? extname(initial) : '';
    el.setSelectionRange(0, ext ? initial.length - ext.length : initial.length);
  }, [initial, selectStem]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = ref.current!.value;
    if (commit && v.trim() && v !== initial) onCommit(v);
    else onCancel();
    document.querySelector<HTMLElement>('.tree')?.focus();
  };
  return (
    <input
      ref={ref}
      className="tree__input"
      defaultValue={initial}
      aria-label={label}
      spellCheck={false}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function Tree() {
  const listing = useTree((s) => s.listing);
  const expanded = useTree((s) => s.expanded);
  const selected = useTree((s) => s.selected);
  const renaming = useTree((s) => s.renaming);
  const creating = useTree((s) => s.creating);
  const filter = useTree((s) => s.filter);
  const menu = useTree((s) => s.menu);
  const dropTarget = useTree((s) => s.dropTarget);
  const markdownOnly = useSettings((s) => s.settings.files.markdownOnly);
  const activeFile = useWorkspace((s) => s.file);
  const root = useWorkspace((s) => s.root);
  const dirty = useDocument(isDirty);
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const visibleTree = useMemo(
    () => (listing ? filterTree(listing, markdownOnly) : null),
    [listing, markdownOnly],
  );
  const rows: Row[] = useMemo(() => {
    if (!visibleTree) return [];
    return filter ? filterRows(visibleTree, filter) : flattenVisible(visibleTree, expanded);
  }, [visibleTree, expanded, filter]);

  // Insert the inline "new file/folder" row at the top of its folder.
  const createIndex = useMemo(() => {
    if (!creating || !root) return -1;
    if (samePath(creating.parent, root)) return 0;
    const i = rows.findIndex((r) => samePath(r.node.path, creating.parent));
    return i === -1 ? 0 : i + 1;
  }, [creating, rows, root]);
  const createDepth = useMemo(() => {
    if (!creating || !root || samePath(creating.parent, root)) return 0;
    const r = rows.find((r) => samePath(r.node.path, creating.parent));
    return r ? r.depth + 1 : 0;
  }, [creating, rows, root]);

  const selIndex = rows.findIndex((r) => selected && samePath(r.node.path, selected));

  useEffect(() => {
    if (selIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${selIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selIndex]);

  const setExpanded = (path: string, open: boolean) => {
    const next = new Set(useTree.getState().expanded);
    if (open) next.add(path);
    else next.delete(path);
    useTree.setState({ expanded: next });
    persistExpanded();
  };

  /** Opens files (focusing the content unless `stay`), toggles folders. */
  const activate = (row: Row, stay = false) => {
    useTree.setState({ selected: row.node.path });
    if (row.node.kind === 'dir') setExpanded(row.node.path, !row.expanded);
    else
      void openFile(row.node.path, { reveal: false }).then((ok) => {
        if (ok && !stay) focusContent();
      });
  };

  const select = (i: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (r) useTree.setState({ selected: r.node.path });
  };

  const openMenuFor = (path: string | null, x: number, y: number) => {
    if (path) useTree.setState({ selected: path });
    useTree.setState({ menu: { x, y, path } });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming || creating) return;
    const mod = getPlatform().os === 'macos' ? e.metaKey : e.ctrlKey;
    const row = selIndex >= 0 ? rows[selIndex] : null;
    const key = e.key;
    let handled = true;
    if (key === 'ArrowDown') select(selIndex + 1);
    else if (key === 'ArrowUp') select(selIndex < 0 ? rows.length - 1 : selIndex - 1);
    else if (key === 'Home') select(0);
    else if (key === 'End') select(rows.length - 1);
    else if (key === 'PageDown') select(selIndex + 10);
    else if (key === 'PageUp') select(selIndex - 10);
    else if (key === 'ArrowRight' && row) {
      if (row.node.kind === 'dir' && !row.expanded && !filter) setExpanded(row.node.path, true);
      else if (row.node.kind === 'dir') select(selIndex + 1);
    } else if (key === 'ArrowLeft' && row) {
      if (row.node.kind === 'dir' && row.expanded && !filter) setExpanded(row.node.path, false);
      else if (row.parent) useTree.setState({ selected: row.parent });
    } else if (key === 'Enter' && row && !mod) activate(row);
    else if (key === ' ' && row && !mod) activate(row, true);
    else if (key === 'F2' && row) useTree.setState({ renaming: row.node.path });
    else if ((key === 'Delete' || (mod && key === 'Backspace')) && row)
      void trashPath(row.node.path);
    else if ((key === 'ContextMenu' || (e.shiftKey && key === 'F10')) && row) {
      const el = listRef.current
        ?.querySelector(`[data-index="${selIndex}"]`)
        ?.getBoundingClientRect();
      openMenuFor(row.node.path, (el?.left ?? 0) + 24, el?.bottom ?? 0);
    } else if (key === 'Escape' && filter) useTree.setState({ filter: '' });
    else if (key === 'Backspace' && filter) useTree.setState({ filter: filter.slice(0, -1) });
    else if (key.length === 1 && !mod && !e.altKey && !e.ctrlKey && !e.metaKey && key !== ' ') {
      // Type-to-filter.
      const f = filter + key;
      useTree.setState({ filter: f });
      requestAnimationFrame(() => {
        const first = filterRows(visibleTree!, f).find((r) => r.node.kind === 'file');
        if (first) useTree.setState({ selected: first.node.path });
      });
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // ---- Drag and drop (move within the tree) ----
  const dirFor = (node: TreeNode | null) =>
    node ? (node.kind === 'dir' ? node.path : dirname(node.path)) : root;
  const onDragStart = (e: DragEvent, node: TreeNode) => {
    e.dataTransfer.setData('application/x-biblozen-path', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: DragEvent, node: TreeNode | null) => {
    if (!e.dataTransfer.types.includes('application/x-biblozen-path')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const t = dirFor(node);
    if (t !== dropTarget) useTree.setState({ dropTarget: t });
  };
  const onDrop = (e: DragEvent, node: TreeNode | null) => {
    const from = e.dataTransfer.getData('application/x-biblozen-path');
    useTree.setState({ dropTarget: null });
    const to = dirFor(node);
    if (!from || !to) return;
    e.preventDefault();
    e.stopPropagation();
    void moveInto(from, to);
  };

  const menuItems = (path: string | null): MenuEntry[] => {
    const node = path && listing ? findNode(listing, path) : null;
    const target = path ?? root!;
    const parent = node ? (node.kind === 'dir' ? node.path : dirname(node.path)) : root!;
    const items: MenuEntry[] = [
      {
        id: 'new-file',
        label: 'New File',
        icon: <FilePlus size={14} />,
        run: () => startCreate('file', parent),
      },
      {
        id: 'new-folder',
        label: 'New Folder',
        icon: <FolderPlus size={14} />,
        run: () => startCreate('dir', parent),
      },
    ];
    if (node) {
      items.push(
        'separator',
        {
          id: 'rename',
          label: 'Rename',
          shortcut: 'F2',
          icon: <Pencil size={14} />,
          run: () => useTree.setState({ renaming: node.path }),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: <CopyPlus size={14} />,
          run: () => void duplicatePath(node.path),
        },
        {
          id: 'trash',
          label: 'Move to Trash',
          shortcut: 'Del',
          danger: true,
          icon: <Trash2 size={14} />,
          run: () => void trashPath(node.path),
        },
      );
    }
    items.push(
      'separator',
      {
        id: 'reveal',
        label: revealLabel(),
        icon: <SquareArrowOutUpRight size={14} />,
        run: () => void revealInOs(target),
      },
      {
        id: 'copy-path',
        label: 'Copy Path',
        icon: <Copy size={14} />,
        run: () => void copyPath(target, false),
      },
      {
        id: 'copy-rel',
        label: 'Copy Relative Path',
        icon: <Link2 size={14} />,
        run: () => void copyPath(target, true),
      },
    );
    return items;
  };

  const createRow = creating && (
    <div
      className="tree__row tree__row--editing"
      style={{ paddingLeft: 8 + createDepth * INDENT + 16 }}
      key="__create"
    >
      <span className="tree__icon">
        {creating.kind === 'dir' ? (
          <Folder size={15} strokeWidth={1.75} />
        ) : (
          <FileText size={15} strokeWidth={1.75} />
        )}
      </span>
      <NameInput
        initial=""
        selectStem={false}
        label={creating.kind === 'dir' ? 'New folder name' : 'New file name'}
        onCommit={(v) => void commitCreate(v)}
        onCancel={cancelCreate}
      />
    </div>
  );

  const items: React.ReactNode[] = rows.map((row, i) => {
    const n = row.node;
    const isActive = !!activeFile && samePath(activeFile, n.path);
    const isSel = i === selIndex;
    const isDrop = n.kind === 'dir' && dropTarget !== null && samePath(dropTarget, n.path);
    return (
      <div
        key={n.path}
        id={`tree-row-${i}`}
        data-index={i}
        data-tree-path={n.path}
        role="treeitem"
        aria-level={row.depth + 1}
        aria-expanded={n.kind === 'dir' ? row.expanded : undefined}
        aria-selected={isSel}
        aria-current={isActive ? 'page' : undefined}
        className="tree__row"
        data-active={isActive || undefined}
        data-selected={isSel || undefined}
        data-drop={isDrop || undefined}
        style={{ paddingLeft: 8 + row.depth * INDENT }}
        draggable={!renaming}
        onDragStart={(e) => onDragStart(e, n)}
        onDragOver={(e) => onDragOver(e, n)}
        onDragLeave={() => useTree.setState({ dropTarget: null })}
        onDrop={(e) => onDrop(e, n)}
        onClick={() => {
          if (n.kind === 'dir') listRef.current?.focus();
          activate(row);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenuFor(n.path, e.clientX, e.clientY);
        }}
      >
        {Array.from({ length: row.depth }, (_, d) => (
          <span key={d} className="tree__guide" style={{ left: 8 + d * INDENT + 7 }} aria-hidden />
        ))}
        <span className="tree__chevron" data-open={row.expanded || undefined} aria-hidden>
          {n.kind === 'dir' && <ChevronRight size={13} strokeWidth={2} />}
        </span>
        <span className="tree__icon" data-kind={iconKind(n)}>
          <NodeIcon node={n} open={row.expanded} />
        </span>
        {renaming && samePath(renaming, n.path) ? (
          <NameInput
            initial={n.name}
            selectStem={n.kind === 'file'}
            label={`Rename ${n.name}`}
            onCommit={(v) => void renamePath(n.path, v)}
            onCancel={() => useTree.setState({ renaming: null })}
          />
        ) : (
          <span className="tree__name">{n.name}</span>
        )}
        {isActive && dirty && <span className="tree__dirty" aria-label="Unsaved changes" />}
      </div>
    );
  });
  if (createRow) items.splice(createIndex, 0, createRow);

  return (
    <>
      {filter && (
        <div className="tree__filter" role="status">
          <span>
            Filter: <strong>{filter}</strong>
          </span>
          <button className="tree__filter-clear" onClick={() => useTree.setState({ filter: '' })}>
            Esc to clear
          </button>
        </div>
      )}
      <div
        ref={listRef}
        className="tree"
        role="tree"
        aria-label="Files"
        tabIndex={0}
        aria-activedescendant={selIndex >= 0 ? `tree-row-${selIndex}` : undefined}
        data-focused={focused || undefined}
        data-drop={
          dropTarget !== null && root !== null && samePath(dropTarget, root) ? true : undefined
        }
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true);
          if (selIndex < 0 && rows.length && !renaming && !creating) {
            const active = rows.findIndex((r) => activeFile && samePath(r.node.path, activeFile));
            select(active >= 0 ? active : 0);
          }
        }}
        onBlur={() => setFocused(false)}
        onDragOver={(e) => onDragOver(e, null)}
        onDrop={(e) => onDrop(e, null)}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuFor(null, e.clientX, e.clientY);
        }}
      >
        {items}
        {filter && rows.length === 0 && (
          <div className="tree__no-match">No files match “{filter}”</div>
        )}
      </div>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          label="File actions"
          items={menuItems(menu.path)}
          onClose={() => {
            useTree.setState({ menu: null });
            listRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
