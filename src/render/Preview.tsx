import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { openFile, openPath } from '../app/actions';
import { useDocument } from '../app/document';
import { saveDocument } from '../app/save';
import { toast, toastError } from '../app/toastStore';
import { useWorkspace } from '../app/workspace';
import { resolveWikilinkRef, useIndex } from '../index/store';
import { getPlatform } from '../platform';
import { basename, dirname, isInside, join, relative } from '../platform/path';
import { FindBar } from '../reader/FindBar';
import { highlightMatches, setCurrent } from '../reader/find';
import { jumpToElement } from '../reader/nav';
import {
  elementForLine,
  findAnchor,
  scrollProgress,
  scrollToElement,
  scrollToLine,
  topVisibleLine,
} from '../reader/scroll';
import { useReader } from '../reader/store';
import { applyState, getAppState, patchFile } from '../settings/appState';
import { useSettings } from '../settings/store';
import { useTheme } from '../themes/store';
import { takePendingTopLine } from '../editor/position';
import { syncPreviewToEditor } from '../editor/scrollSync';
import { classifyLink } from './links';
import { renderMarkdown } from './markdown';
import { mermaidThemeFrom } from './mermaidTheme';
import { postprocess } from './postprocess';
import { slugify } from './slug';
import { toggleTaskAt } from './tasks';
import './preview.css';

async function createAndOpen(name: string) {
  const doc = useDocument.getState().path;
  const root = useWorkspace.getState().root;
  if (!doc || !root) return;
  const rel = name.replace(/\\/g, '/');
  const path = join(dirname(doc), rel.endsWith('.md') ? rel : `${rel}.md`);
  if (!isInside(root, path)) {
    toast('That note would be outside this folder', 'warning');
    return;
  }
  try {
    await getPlatform().createFile(path, `# ${basename(rel).replace(/\.md$/i, '')}\n\n`);
  } catch (e) {
    toastError(e, 'Couldn’t create note');
    return;
  }
  await openFile(path, { mode: 'edit' });
}

/** Heading the reader is in: the last one whose top is above ~a third of the view. */
function activeHeading(scroller: HTMLElement, article: HTMLElement): string | null {
  const hs = article.querySelectorAll<HTMLElement>(
    'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]',
  );
  if (!hs.length) return null;
  const limit = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.3;
  let lo = 0;
  let hi = hs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hs[mid].getBoundingClientRect().top <= limit) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans === -1 ? hs[0].id : hs[ans].id;
}

export function Preview({ text: textProp }: { text?: string }) {
  const docText = useDocument((s) => s.text);
  const text = textProp ?? docText;
  const docPath = useDocument((s) => s.path);
  const nav = useDocument((s) => s.nav);
  const handledNav = useRef(-1);
  const root = useWorkspace((s) => s.root);
  const remoteImages = useSettings((s) => s.settings.reader.remoteImages);
  const readingStyle = useSettings((s) => s.settings.readingStyle);
  const readingWidth = useSettings((s) => s.settings.appearance.readingWidth);
  const zoom = useSettings((s) => s.settings.appearance.previewZoom);
  const dropCap = useSettings((s) => s.settings.reader.dropCap);
  const scrollMemory = useSettings((s) => s.settings.reader.scrollMemory);
  const find = useReader((s) => s.find);
  const theme = useTheme();
  const refs = useIndex((s) => s.refs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const renderSeq = useRef(0);
  const [settledSeq, setSettledSeq] = useState(0);
  const marks = useRef<HTMLElement[]>([]);

  const result = useMemo(() => {
    const t0 = performance.now();
    const r = renderMarkdown(text);
    return { ...r, t0, parseMs: performance.now() - t0 };
  }, [text]);

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    article.innerHTML = result.html;
    // Exposed for the perf benchmark (e2e/prod.perf.spec.ts): markdown → sanitized HTML in the DOM.
    article.dataset.renderMs = (performance.now() - result.t0).toFixed(1);
    article.dataset.parseMs = result.parseMs.toFixed(1);
    useReader.setState({ headings: result.headings });
  }, [result]);

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article || !docPath) return;
    const seq = ++renderSeq.current;
    delete article.dataset.settled;
    void postprocess(article, {
      docPath,
      root,
      remoteImages,
      syntax: theme.syntax,
      mermaid: mermaidThemeFrom(theme),
      assetUrl: (p) => getPlatform().assetUrl(p),
      resolveWikilink: (ref) => resolveWikilinkRef(ref, docPath),
      isStale: () => renderSeq.current !== seq,
    }).then(() => {
      if (renderSeq.current !== seq) return;
      article.dataset.settled = 'true';
      setSettledSeq(seq);
      // While typing in split view, keep the preview at the editor's position.
      if (
        document.activeElement?.closest('.cm-editor') &&
        useSettings.getState().settings.editor.scrollSync
      ) {
        syncPreviewToEditor();
      }
    });
  }, [result, docPath, root, remoteImages, theme, refs]);

  // Navigation targets (anchor / line / remembered position) after open.
  useEffect(() => {
    const scroller = scrollRef.current;
    const article = articleRef.current;
    if (!scroller || !article || handledNav.current === nav.seq || !docPath) return;
    const firstRun = handledNav.current === -1;
    handledNav.current = nav.seq;
    const pending = firstRun ? takePendingTopLine('preview') : null;
    if (pending !== null) {
      scrollToLine(scroller, article, pending);
      return;
    }
    const { anchor, line } = nav;
    if (anchor) {
      const el = findAnchor(article, anchor);
      if (el) scrollToElement(scroller, el, false);
    } else if (line !== undefined) {
      const el = elementForLine(article, line);
      if (el) scrollToElement(scroller, el, false);
    } else {
      const remembered = scrollMemory ? getAppState().files[docPath]?.line : undefined;
      if (remembered) scrollToLine(scroller, article, remembered);
      else scroller.scrollTop = 0;
    }
  }, [nav, docPath, scrollMemory]);

  // Progress, scroll-spy and scroll memory.
  useEffect(() => {
    const scroller = scrollRef.current;
    const article = articleRef.current;
    if (!scroller || !article) return;
    let raf = 0;
    let memTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      raf = 0;
      useReader.setState({
        progress: scrollProgress(scroller),
        activeSlug: activeHeading(scroller, article),
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
      clearTimeout(memTimer);
      memTimer = setTimeout(() => {
        const path = useDocument.getState().path;
        if (!path || !useSettings.getState().settings.reader.scrollMemory) return;
        const line = topVisibleLine(scroller, article);
        if (line !== null) applyState(patchFile(path, line));
      }, 400);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(memTimer);
    };
  }, [docPath, settledSeq]);

  // Find: (re)highlight after each render and whenever the query changes.
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    marks.current = highlightMatches(article, find.open ? find.query : '');
    const count = marks.current.length;
    const s = useReader.getState().find;
    if (s.count !== count || s.index >= Math.max(count, 1)) {
      useReader.setState({
        find: { ...s, count, index: Math.min(s.index, Math.max(0, count - 1)) },
      });
    }
  }, [find.open, find.query, settledSeq, result]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const cur = setCurrent(marks.current, find.index);
    if (cur && scroller && find.open) {
      const r = cur.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) {
        scroller.scrollTo({ top: scroller.scrollTop + r.top - sr.top - sr.height / 3 });
      }
    }
  }, [find.index, find.count, find.open]);

  const onClick = async (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    const box = target.closest<HTMLInputElement>('input.task-list-item-checkbox');
    if (box) {
      e.preventDefault();
      const line = Number(box.dataset.taskLine);
      const doc = useDocument.getState();
      const next = toggleTaskAt(doc.text, line);
      if (next === null) return;
      const clean = doc.text === doc.savedText;
      useDocument.setState({ text: next });
      // Spec §6.4: save immediately unless the buffer already had unsaved edits.
      if (clean) await saveDocument();
      return;
    }

    const copy = target.closest<HTMLButtonElement>('button[data-copy]');
    if (copy) {
      const code = copy.closest('.code-block')?.querySelector('code')?.textContent ?? '';
      try {
        await getPlatform().copyText(code);
        copy.dataset.copied = 'true';
        setTimeout(() => delete copy.dataset.copied, 1500);
      } catch (err) {
        toastError(err, 'Couldn’t copy');
      }
      return;
    }

    const a = target.closest<HTMLAnchorElement>('a');
    if (!a || !docPath) return;
    e.preventDefault();
    const article = articleRef.current!;

    if (a.classList.contains('wikilink')) {
      const ref = a.dataset.wikilink ?? '';
      const r = resolveWikilinkRef(ref, docPath);
      if (!r.path) {
        await createAndOpen(ref.split('#')[0]);
        return;
      }
      if (r.path === docPath && r.heading) {
        const el = findAnchor(article, r.heading) ?? findAnchor(article, slugify(r.heading));
        if (el) jumpToElement(el);
        return;
      }
      await openFile(r.path, { anchor: r.heading ? slugify(r.heading) : undefined });
      return;
    }

    const href = a.getAttribute('href') ?? '';
    const link = classifyLink(href, docPath, root);
    switch (link.kind) {
      case 'anchor': {
        const el = findAnchor(article, link.id);
        if (el) jumpToElement(el);
        break;
      }
      case 'external':
        await getPlatform().openExternal(link.url);
        break;
      case 'file':
        if (link.markdown) {
          if (root && isInside(root, link.path))
            await openFile(link.path, { anchor: link.anchor ?? undefined });
          else await openPath(link.path);
        } else {
          await getPlatform()
            .reveal(link.path)
            .catch((err) => toastError(err, 'Couldn’t open link'));
        }
        break;
      case 'invalid':
        toast('That link can’t be opened', 'warning');
    }
  };

  const onMouseOver = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
    const ws = useWorkspace.getState();
    if (!a || !docPath) {
      if (ws.hoverHint) ws.setHoverHint(null);
      return;
    }
    let hint: string | null = null;
    if (a.classList.contains('wikilink')) {
      const resolved = a.dataset.resolved;
      hint = resolved
        ? root
          ? relative(root, resolved)
          : resolved
        : `Create “${a.dataset.wikilink}”`;
    } else if (!a.classList.contains('heading-anchor')) {
      const link = classifyLink(a.getAttribute('href') ?? '', docPath, root);
      if (link.kind === 'external') hint = link.url;
      else if (link.kind === 'file')
        hint =
          (root && isInside(root, link.path) ? relative(root, link.path) : link.path) +
          (link.anchor ? `#${link.anchor}` : '');
      else if (link.kind === 'anchor') hint = `#${link.id}`;
    }
    if (hint !== ws.hoverHint) ws.setHoverHint(hint);
  };

  return (
    <>
      <FindBar />
      <div
        ref={scrollRef}
        className="preview-scroll"
        data-scroll
        tabIndex={-1}
        onClick={(e) => void onClick(e)}
        onMouseOver={onMouseOver}
        onMouseLeave={() => useWorkspace.getState().setHoverHint(null)}
        style={{
          ['--reading-width' as string]: `${readingWidth}ch`,
          ['--preview-zoom' as string]: zoom,
        }}
      >
        <article
          ref={articleRef}
          className="markdown-body"
          data-reading-style={readingStyle}
          data-drop-cap={dropCap || undefined}
        />
      </div>
    </>
  );
}
