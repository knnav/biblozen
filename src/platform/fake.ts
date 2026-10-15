import { FakeFs } from './fakefs';
import { detectOS } from './os';
import { basename, dirname, extname, isInside, join, stem } from './path';
import type {
  DragDropEvent,
  FileMatches,
  Platform,
  SearchOpts,
  SearchSummary,
  TreeNode,
} from './types';

export const FAKE_DATA_DIR = '/data';

export interface FakeControls {
  fs: FakeFs;
  platform: Platform;
  /** URLs passed to openExternal. */
  opened: string[];
  /** Paths passed to reveal. */
  revealed: string[];
  clipboard: string[];
  /** Next result for pickFolder/pickFile (consumed once). */
  nextPick: string | null;
  dropListeners: Set<(e: DragDropEvent) => void>;
  printed: number;
  exports: { name: string; contents: string }[];
  /** Paths passed to openPath (routing). */
  routed: string[];
  newWindows: number;
  openFileListeners: Set<(p: string) => void>;
  drop(paths: string[]): void;
  requestClose(): Promise<boolean>;
}

declare global {
  interface Window {
    /** Exposed in browser mode so Playwright can poke the fake filesystem. */
    __biblozenFake?: FakeControls;
  }
}

function listTree(fs: FakeFs, dir: string, ignored: string[]): TreeNode[] {
  return fs
    .list(dir)
    .filter(
      (e) => !e.name.startsWith('.') && e.name !== 'node_modules' && !ignored.includes(e.name),
    )
    .map((e) =>
      e.kind === 'dir'
        ? {
            name: e.name,
            path: e.path,
            kind: 'dir' as const,
            children: listTree(fs, e.path, ignored),
          }
        : { name: e.name, path: e.path, kind: 'file' as const },
    );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** JS mirror of src-tauri/src/search.rs for browser mode. */
async function fakeSearch(
  fs: FakeFs,
  root: string,
  query: string,
  opts: SearchOpts,
  ignored: string[],
  onFile: (f: FileMatches) => void,
  cancelled: () => boolean,
): Promise<SearchSummary> {
  let src = opts.regex ? query : escapeRe(query);
  if (opts.wholeWord) src = `\\b(?:${src})\\b`;
  const re = new RegExp(src, opts.caseSensitive ? 'gu' : 'giu');
  const summary: SearchSummary = { files: 0, matches: 0, truncated: false, cancelled: false };
  const paths = fs
    .allPaths()
    .filter((p) => isInside(root, p, false, false) && !fs.isDir(p))
    .filter(
      (p) =>
        !p
          .split('/')
          .some((seg) => seg.startsWith('.') || seg === 'node_modules' || ignored.includes(seg)),
    )
    .filter((p) => !opts.markdownOnly || /\.(md|markdown|mdown|mkd|mdx)$/i.test(p))
    .sort();
  for (const path of paths) {
    await Promise.resolve();
    if (cancelled()) return { ...summary, cancelled: true };
    const lines = fs.read(path).split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length && matches.length < 100; i++) {
      const ranges: [number, number][] = [];
      for (const m of lines[i].matchAll(re))
        if (m[0]) ranges.push([m.index!, m.index! + m[0].length]);
      if (ranges.length) matches.push({ line: i, text: lines[i].trimEnd(), ranges });
    }
    if (!matches.length) continue;
    summary.files++;
    summary.matches += matches.reduce((n, m) => n + m.ranges.length, 0);
    onFile({ path, matches });
    if (summary.matches >= (opts.maxResults ?? 2000)) return { ...summary, truncated: true };
  }
  return summary;
}

const blobUrls = new Map<string, { bytes: Uint8Array; url: string }>();

function mimeOf(p: string): string {
  const ext = extname(p).toLowerCase();
  const map: Record<string, string> = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return map[ext] ?? 'application/octet-stream';
}

function duplicateTarget(fs: FakeFs, path: string): string {
  const dir = dirname(path);
  const ext = fs.isDir(path) ? '' : extname(path);
  const base = fs.isDir(path) ? basename(path) : stem(path);
  for (let n = 1; ; n++) {
    const candidate = join(dir, `${base} copy${n === 1 ? '' : ` ${n}`}${ext}`);
    if (!fs.has(candidate)) return candidate;
  }
}

const STORAGE_KEY = 'biblozen-fake-data';

/**
 * In browser mode the data dir survives page reloads (via localStorage) so that
 * "restart" behaviour can be tested. Everything else is in-memory.
 */
function persistDataDir(fs: FakeFs): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>;
    for (const [p, text] of Object.entries(saved)) fs.write(p, text, false);
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  fs.watch(FAKE_DATA_DIR, true, () => {
    const out: Record<string, string> = {};
    for (const p of fs.allPaths()) {
      if (p.startsWith(`${FAKE_DATA_DIR}/`) && !fs.isDir(p)) out[p] = fs.read(p);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch {
      // Ignore quota errors in the fake.
    }
  });
}

export async function createFakePlatform(fs = new FakeFs(), persist = false): Promise<Platform> {
  fs.mkdirp(FAKE_DATA_DIR, false);
  fs.mkdirp(`${FAKE_DATA_DIR}/themes`, false);
  if (persist) persistDataDir(fs);
  const controls = {
    opened: [] as string[],
    revealed: [] as string[],
    clipboard: [] as string[],
    nextPick: null as string | null,
    dropListeners: new Set<(e: DragDropEvent) => void>(),
    routed: [] as string[],
    printed: 0,
    exports: [] as { name: string; contents: string }[],
    newWindows: 0,
    openFileListeners: new Set<(p: string) => void>(),
  };
  const roots: string[] = [FAKE_DATA_DIR];
  const closeHandlers = new Set<() => Promise<boolean>>();
  let searchGen = 0;
  const inScope = (p: string) => {
    if (!roots.some((r) => isInside(r, p, true, false)))
      throw { kind: 'outOfScope', message: `Path is outside any open folder: ${p}` };
  };
  const saveImage = (
    docPath: string,
    bytes: Uint8Array,
    ext: string,
    folder: string,
    ts: string,
  ) => {
    const dir = join(dirname(docPath), folder);
    fs.mkdirp(dir);
    let name = `${stem(docPath)}-${ts}.${ext}`;
    for (let n = 2; fs.has(join(dir, name)); n++) name = `${stem(docPath)}-${ts}-${n}.${ext}`;
    fs.write(join(dir, name), bytes);
    return `${folder}/${name}`;
  };
  const pick = async () => {
    const r = controls.nextPick;
    controls.nextPick = null;
    return r;
  };
  const platform: Platform = {
    kind: 'browser',
    os: detectOS(),
    getDataDir: async () => ({ path: FAKE_DATA_DIR, portable: false, fellBack: false }),
    readTextFile: async (p) => fs.read(p),
    readBinaryFile: async (p) => fs.readBytes(p),
    assetUrl: (p) => {
      if (!fs.has(p)) return `fake-missing://${encodeURIComponent(p)}`;
      const bytes = fs.readBytes(p);
      const cached = blobUrls.get(p);
      if (cached && cached.bytes === bytes) return cached.url;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(p) }));
      blobUrls.set(p, { bytes, url });
      return url;
    },
    writeFileAtomic: async (p, c) => {
      inScope(p);
      fs.write(p, c);
    },
    exists: async (p) => fs.has(p),
    watch: async (p, cb, opts) => fs.watch(p, opts.recursive, cb),
    openExternal: async (url) => {
      controls.opened.push(url);
    },
    // Browser mode is a single window; the "session" lives in the fake data dir.
    windowInit: async () => {
      try {
        const s = JSON.parse(fs.read(`${FAKE_DATA_DIR}/session.json`)) as {
          windows: { root: string | null; file: string | null }[];
        };
        const w = s.windows.find((x) => x.root && fs.isDir(x.root));
        return w
          ? { root: w.root, file: w.file && fs.has(w.file) ? w.file : null }
          : { root: null, file: null };
      } catch {
        return { root: null, file: null };
      }
    },
    openPath: async (path) => {
      if (!fs.has(path)) throw { kind: 'notFound', message: `Not found: ${path}` };
      const dir = fs.isDir(path);
      controls.routed.push(path);
      return {
        kind: 'this-window',
        label: 'main',
        root: dir ? path : dirname(path),
        file: dir ? null : path,
      };
    },
    newWindow: async () => {
      controls.newWindows++;
    },
    reportSession: async (root, file) => {
      fs.write(`${FAKE_DATA_DIR}/session.json`, JSON.stringify({ windows: [{ root, file }] }));
    },
    onOpenFile: async (cb) => {
      controls.openFileListeners.add(cb);
      return () => controls.openFileListeners.delete(cb);
    },
    setWindowRoot: async (root) => {
      if (!fs.isDir(root)) throw { kind: 'invalidPath', message: `Not a folder: ${root}` };
      if (!roots.includes(root)) roots.push(root);
      return root;
    },
    listTree: async (root, ignored) => {
      inScope(root);
      const children = listTree(fs, root, ignored);
      const count = fs.allPaths().filter((p) => isInside(root, p)).length;
      return {
        root: { name: basename(root), path: root, kind: 'dir', children },
        truncated: false,
        count,
      };
    },
    createFile: async (p, c) => {
      inScope(p);
      if (fs.has(p)) throw { kind: 'alreadyExists', message: `Already exists: ${p}` };
      if (!fs.isDir(dirname(p))) throw { kind: 'notFound', message: `Not found: ${dirname(p)}` };
      fs.write(p, c);
    },
    createDir: async (p) => {
      inScope(p);
      if (fs.has(p)) throw { kind: 'alreadyExists', message: `Already exists: ${p}` };
      fs.mkdirp(p);
    },
    rename: async (a, b) => {
      inScope(a);
      inScope(b);
      if (isInside(a, b)) throw { kind: 'invalidPath', message: "Can't move a folder into itself" };
      fs.rename(a, b);
    },
    duplicate: async (p) => {
      inScope(p);
      const target = duplicateTarget(fs, p);
      if (fs.isDir(p)) {
        for (const q of fs.allPaths().filter((x) => isInside(p, x, true, false))) {
          const dest = target + q.slice(p.length);
          if (fs.isDir(q)) fs.mkdirp(dest);
          else fs.write(dest, fs.readBytes(q));
        }
      } else fs.write(target, fs.readBytes(p));
      return target;
    },
    trash: async (p) => {
      inScope(p);
      fs.remove(p);
      fs.trashed.push(p);
    },
    reveal: async (p) => {
      controls.revealed.push(p);
    },
    isDir: async (p) => fs.isDir(p),
    search: async (root, query, opts, ignored, onFile) => {
      inScope(root);
      const gen = ++searchGen;
      return fakeSearch(fs, root, query, opts, ignored, onFile, () => gen !== searchGen);
    },
    savePastedImage: async (docPath, bytes, ext, folder, ts) => {
      inScope(docPath);
      return saveImage(docPath, bytes, ext, folder, ts);
    },
    importImage: async (docPath, src, folder, ts) => {
      inScope(docPath);
      return saveImage(docPath, fs.readBytes(src), extname(src).slice(1).toLowerCase(), folder, ts);
    },
    listDir: async (p) => {
      inScope(p);
      return fs.list(p).map((e) => ({ name: e.name, isDir: e.kind === 'dir' }));
    },
    pickFolder: pick,
    pickFile: pick,
    copyText: async (t) => {
      controls.clipboard.push(t);
    },
    copyHtml: async (html) => {
      controls.clipboard.push(html);
    },
    printPage: async () => {
      controls.printed++;
    },
    saveExport: async (name, contents) => {
      controls.exports.push({ name, contents });
      return `/exports/${name}`;
    },
    onDragDrop: async (cb) => {
      controls.dropListeners.add(cb);
      return () => controls.dropListeners.delete(cb);
    },
    window: {
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      startDragging: async () => {},
      setTitle: async (t) => {
        if (typeof document !== 'undefined') document.title = t;
      },
      onCloseRequested: async (handler) => {
        closeHandlers.add(handler);
        return () => closeHandlers.delete(handler);
      },
    },
  };
  if (typeof window !== 'undefined') {
    window.__biblozenFake = Object.assign(controls, {
      fs,
      platform,
      /** Simulates the window's close button; resolves true if the window would close. */
      async requestClose() {
        for (const h of closeHandlers) if (!(await h())) return false;
        return true;
      },
      drop(paths: string[]) {
        for (const l of controls.dropListeners)
          l({ type: 'drop', paths, position: { x: 0, y: 0 } });
      },
    });
  }
  return platform;
}
