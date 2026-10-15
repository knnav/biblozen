import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { detectOS } from './os';
import type {
  DataDirInfo,
  FileMatches,
  Platform,
  RouteResult,
  WindowInit,
  SearchSummary,
  TreeListing,
  WatchEvent,
  WatchEventKind,
} from './types';

function mapKind(type: fs.WatchEventKind): WatchEventKind | null {
  if (type === 'any' || type === 'other') return 'other';
  if ('access' in type) return null;
  if ('create' in type) return 'create';
  if ('remove' in type) return 'remove';
  if ('modify' in type) {
    const m = type.modify;
    return m.kind === 'rename' ? 'rename' : 'modify';
  }
  return 'other';
}

export async function createTauriPlatform(): Promise<Platform> {
  const win = getCurrentWindow();
  return {
    kind: 'tauri',
    os: detectOS(),
    getDataDir: () => invoke<DataDirInfo>('get_data_dir'),
    readTextFile: (path) => fs.readTextFile(path),
    readBinaryFile: (path) => fs.readFile(path),
    assetUrl: (path) => convertFileSrc(path),
    writeFileAtomic: (path, contents) => invoke('write_file_atomic', { path, contents }),
    exists: (path) => fs.exists(path),
    async watch(path, onEvents, opts) {
      // The plugin debounces for us; we batch to our own WatchEvent shape.
      const unwatch = await fs.watch(
        path,
        (ev) => {
          const kind = mapKind(ev.type);
          if (!kind) return;
          const e: WatchEvent = { kind, paths: ev.paths };
          onEvents([e]);
        },
        { recursive: opts.recursive, delayMs: opts.delayMs },
      );
      return unwatch;
    },
    openExternal: (url) => openUrl(url),
    windowInit: () => invoke<WindowInit>('window_init'),
    openPath: (path) => invoke<RouteResult>('open_path_cmd', { path }),
    newWindow: async () => {
      await invoke('new_window');
    },
    reportSession: (root, file) => invoke('report_session', { root, file }),
    onOpenFile: (cb) => getCurrentWebviewWindow().listen<string>('open-file', (e) => cb(e.payload)),
    setWindowRoot: (root) => invoke<string>('set_window_root', { root }),
    listTree: (root, ignored) => invoke<TreeListing>('list_tree', { root, ignored }),
    createFile: (path, contents) => invoke('create_file', { path, contents }),
    createDir: (path) => invoke('create_dir', { path }),
    rename: (from, to) => invoke('rename_path', { from, to }),
    duplicate: (path) => invoke<string>('duplicate_path', { path }),
    trash: (path) => invoke('trash', { path }),
    reveal: (path) => invoke('reveal_in_os', { path }),
    isDir: async (path) => {
      try {
        return (await fs.stat(path)).isDirectory;
      } catch {
        return false;
      }
    },
    search: (root, query, opts, ignored, onFile) => {
      const onEvent = new Channel<{ type: 'file'; data: FileMatches }>();
      onEvent.onmessage = (m) => onFile(m.data);
      return invoke<SearchSummary>('search', { root, query, opts, ignored, onEvent });
    },
    savePastedImage: (docPath, bytes, ext, folder, timestamp) =>
      invoke<string>('save_pasted_image', bytes, {
        headers: {
          'x-doc-path': encodeURIComponent(docPath),
          'x-ext': ext,
          'x-folder': encodeURIComponent(folder),
          'x-timestamp': timestamp,
        },
      }),
    importImage: (docPath, srcPath, folder, timestamp) =>
      invoke<string>('import_image', { docPath, srcPath, folder, timestamp }),
    listDir: async (path) =>
      (await fs.readDir(path)).map((e) => ({ name: e.name, isDir: e.isDirectory })),
    pickFolder: async () => {
      const r = await dialog.open({ directory: true, multiple: false, title: 'Open Folder' });
      return typeof r === 'string' ? r : null;
    },
    pickFile: async () => {
      const r = await dialog.open({
        directory: false,
        multiple: false,
        title: 'Open File',
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'txt'] },
        ],
      });
      return typeof r === 'string' ? r : null;
    },
    copyText: (text) => navigator.clipboard.writeText(text),
    copyHtml: async (html, plain) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } catch {
        // Some webviews only support plain text on the clipboard.
        await navigator.clipboard.writeText(html);
      }
    },
    printPage: () => invoke('print_window'),
    saveExport: (defaultName, contents, filterName, extension) =>
      invoke<string | null>('save_export', { defaultName, contents, filterName, extension }),
    onDragDrop: async (cb) =>
      getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'leave') cb({ type: 'leave' });
        else if (p.type === 'drop') cb({ type: 'drop', paths: p.paths, position: p.position });
        else cb({ type: p.type, paths: p.type === 'enter' ? p.paths : [], position: p.position });
      }),
    window: {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      startDragging: () => win.startDragging(),
      setTitle: (t) => win.setTitle(t),
      onCloseRequested: (handler) =>
        win.onCloseRequested(async (e) => {
          if (!(await handler())) e.preventDefault();
        }),
    },
  };
}
