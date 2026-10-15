import { create } from 'zustand';
import type { TreeNode } from '../platform/types';

export interface CreatingState {
  parent: string;
  kind: 'file' | 'dir';
}

export interface TreeState {
  /** Sorted, unfiltered listing of the root. */
  listing: TreeNode | null;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  expanded: Set<string>;
  selected: string | null;
  renaming: string | null;
  creating: CreatingState | null;
  filter: string;
  menu: { x: number; y: number; path: string | null } | null;
  dropTarget: string | null;
}

export const useTree = create<TreeState>(() => ({
  listing: null,
  loading: false,
  error: null,
  truncated: false,
  expanded: new Set(),
  selected: null,
  renaming: null,
  creating: null,
  filter: '',
  menu: null,
  dropTarget: null,
}));

export function resetTree(): void {
  useTree.setState({
    listing: null,
    loading: false,
    error: null,
    truncated: false,
    expanded: new Set(),
    selected: null,
    renaming: null,
    creating: null,
    filter: '',
    menu: null,
    dropTarget: null,
  });
}
