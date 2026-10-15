// Paste / drop images into the editor (SPEC §7.4): saved to `assets/` beside the
// document as `<doc-name>-<timestamp>.<ext>`, then linked.

import type { EditorView } from '@codemirror/view';
import { useDocument } from '../app/document';
import { toastError } from '../app/toastStore';
import { getPlatform } from '../platform';
import { extname } from '../platform/path';
import { getSettings } from '../settings/store';

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

export function extFromMime(mime: string): string | null {
  const m = /^image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif)$/.exec(mime);
  if (!m) return null;
  return m[1] === 'jpeg' ? 'jpg' : m[1] === 'svg+xml' ? 'svg' : m[1];
}

/** Local time, file-name safe: 20261015-143012. */
export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Markdown image link with a URL-safe relative path. */
export function imageMarkdown(relPath: string, alt = ''): string {
  const url = relPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `![${alt}](${url})`;
}

function insertAt(view: EditorView, text: string, pos?: number | null) {
  const at = pos ?? view.state.selection.main.from;
  const to = pos ?? view.state.selection.main.to;
  view.dispatch({
    changes: { from: at, to, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.paste',
    scrollIntoView: true,
  });
  view.focus();
}

export function handleImageFiles(
  view: EditorView,
  files: FileList | undefined | null,
  event: Event,
  pos?: number | null,
): boolean {
  const images = [...(files ?? [])].filter((f) => extFromMime(f.type));
  const docPath = useDocument.getState().path;
  if (!images.length || !docPath) return false;
  event.preventDefault();
  void (async () => {
    const links: string[] = [];
    for (const f of images) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const rel = await getPlatform().savePastedImage(
          docPath,
          bytes,
          extFromMime(f.type)!,
          getSettings().editor.imageFolder,
          timestamp(),
        );
        links.push(
          imageMarkdown(
            rel,
            f.name && !/^image\.\w+$/.test(f.name) ? f.name.replace(/\.[^.]+$/, '') : '',
          ),
        );
      } catch (e) {
        toastError(e, 'Couldn’t save the image');
      }
    }
    if (links.length) insertAt(view, links.join('\n'), pos);
  })();
  return true;
}

/** OS file drops (Tauri gives paths, not File objects). */
export async function importImagePaths(
  view: EditorView,
  paths: string[],
  pos?: number | null,
): Promise<boolean> {
  const docPath = useDocument.getState().path;
  const images = paths.filter((p) => IMAGE_EXTS.includes(extname(p).slice(1).toLowerCase()));
  if (!images.length || !docPath) return false;
  const links: string[] = [];
  for (const p of images) {
    try {
      const rel = await getPlatform().importImage(
        docPath,
        p,
        getSettings().editor.imageFolder,
        timestamp(),
      );
      links.push(imageMarkdown(rel));
    } catch (e) {
      toastError(e, 'Couldn’t import the image');
    }
  }
  if (links.length) insertAt(view, links.join('\n'), pos);
  return true;
}
