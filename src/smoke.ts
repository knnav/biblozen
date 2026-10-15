// Self-test against the real Tauri backend. Runs only when the app is started with
// BIBLOZEN_SMOKE_DIR=<dir>; writes <dir>/smoke-report.json and exits.
// Catches capability/scope misconfigurations that the browser fake can't.

import { invoke } from '@tauri-apps/api/core';
import type { Platform } from './platform';
import { errorMessage } from './platform';
import { join } from './platform/path';

export interface SmokeStep {
  name: string;
  ok: boolean;
  detail?: string;
}

type Check = [string, () => Promise<string | void>];

export async function maybeRunSmoke(platform: Platform): Promise<boolean> {
  if (platform.kind !== 'tauri') return false;
  const dir = await invoke<string | null>('smoke_config');
  if (!dir) return false;
  const steps: SmokeStep[] = [];
  const startedAt = new Date().toISOString();
  await platform
    .writeFileAtomic(join(dir, `smoke-start-${Date.now()}.txt`), location.href)
    .catch(() => {});
  const f = (n: string) => join(dir, n);
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  const checks: Check[] = [
    ['getDataDir', async () => (await platform.getDataDir()).path],
    ['setWindowRoot', async () => platform.setWindowRoot(dir)],
    ['createFile', async () => platform.createFile(f('smoke.md'), '# Smoke\r\n\r\nbody\r\n')],
    [
      'createFile refuses existing',
      async () => {
        try {
          await platform.createFile(f('smoke.md'), 'x');
        } catch (e) {
          return errorMessage(e);
        }
        throw new Error('expected alreadyExists');
      },
    ],
    [
      'readTextFile keeps CRLF',
      async () => {
        const t = await platform.readTextFile(f('smoke.md'));
        assert(t === '# Smoke\r\n\r\nbody\r\n', JSON.stringify(t));
      },
    ],
    [
      'writeFileAtomic',
      async () => {
        await platform.writeFileAtomic(f('smoke.md'), '# Smoke 2\n');
        assert((await platform.readTextFile(f('smoke.md'))) === '# Smoke 2\n', 'content mismatch');
      },
    ],
    ['createDir', async () => platform.createDir(f('sub'))],
    ['rename', async () => platform.rename(f('smoke.md'), f('sub/moved.md'))],
    ['exists', async () => assert(await platform.exists(f('sub/moved.md')), 'moved file missing')],
    ['isDir', async () => assert(await platform.isDir(f('sub')), 'sub not a dir')],
    ['duplicate', async () => platform.duplicate(f('sub/moved.md'))],
    [
      'listTree',
      async () => {
        const t = await platform.listTree(dir, []);
        return JSON.stringify(t.root.children?.map((c) => c.name));
      },
    ],
    [
      'watch',
      async () => {
        let fired = false;
        const un = await platform.watch(dir, () => (fired = true), {
          recursive: true,
          delayMs: 50,
        });
        await platform.writeFileAtomic(f('watched.md'), 'w');
        for (let i = 0; i < 40 && !fired; i++) await new Promise((r) => setTimeout(r, 100));
        un();
        assert(fired, 'no watch event within 4s');
      },
    ],
    [
      'trash',
      async () => {
        await platform.trash(f('sub/moved copy.md'));
        assert(!(await platform.exists(f('sub/moved copy.md'))), 'still exists after trash');
      },
    ],
    [
      'index worker (module worker on the app protocol) + backlinks',
      async () => {
        await platform.writeFileAtomic(f('target.md'), '# Target\n');
        await platform.writeFileAtomic(f('linker.md'), 'see [[target]]\n');
        const { syncIndex, queryBacklinks } = await import('./index/client');
        const { useIndex } = await import('./index/store');
        await syncIndex(dir, [f('target.md'), f('linker.md')]);
        for (let i = 0; i < 40 && useIndex.getState().status !== 'ready'; i++) {
          await new Promise((r) => setTimeout(r, 50));
        }
        const links = await Promise.race([
          queryBacklinks(f('target.md')),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('worker did not answer')), 4000),
          ),
        ]);
        assert(links.length === 1 && links[0].source === f('linker.md'), JSON.stringify(links));
        await syncIndex(null, []);
      },
    ],
    [
      'folder search streams over a Channel',
      async () => {
        const seen: string[] = [];
        const summary = await platform.search(
          dir,
          'target',
          { caseSensitive: false, wholeWord: false, regex: false, markdownOnly: true },
          [],
          (fm) => seen.push(fm.path),
        );
        assert(summary.matches >= 2, JSON.stringify(summary));
        assert(
          seen.some((p) => p.endsWith('linker.md')),
          JSON.stringify(seen),
        );
        try {
          await platform.search(
            dir,
            '(',
            { caseSensitive: false, wholeWord: false, regex: true, markdownOnly: true },
            [],
            () => {},
          );
        } catch (e) {
          return `invalid regex rejected: ${errorMessage(e).slice(0, 40)}`;
        }
        throw new Error('invalid regex accepted');
      },
    ],
    [
      'paste image (raw IPC body) + import dropped image',
      async () => {
        const doc = f('Pasted Note é.md');
        await platform.writeFileAtomic(doc, '# x\n');
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
        const rel = await platform.savePastedImage(doc, bytes, 'png', 'assets', '20261015-101010');
        assert(rel === 'assets/Pasted Note é-20261015-101010.png', `unexpected path ${rel}`);
        assert(await platform.exists(f(rel)), 'pasted image missing');
        const rel2 = await platform.importImage(doc, f(rel), 'assets', '20261015-101010');
        assert(rel2 === 'assets/Pasted Note é-20261015-101010-2.png', `unexpected import ${rel2}`);
        try {
          await platform.savePastedImage(doc, bytes, 'exe', 'assets', '1');
        } catch {
          return rel;
        }
        throw new Error('non-image extension was accepted');
      },
    ],
    [
      'user themes folder (listDir + VS Code theme parse)',
      async () => {
        const themesDir = join((await platform.getDataDir()).path, 'themes');
        await platform.writeFileAtomic(
          join(themesDir, 'smoke-theme.json'),
          '{ // jsonc\n "name": "Smoke", "type": "dark", "colors": { "editor.background": "#101010" }, }',
        );
        const entries = await platform.listDir(themesDir);
        assert(
          entries.some((e) => e.name === 'smoke-theme.json'),
          'theme file not listed',
        );
        const { parseUserTheme } = await import('./themes/derive');
        const t = parseUserTheme(
          await platform.readTextFile(join(themesDir, 'smoke-theme.json')),
          'smoke',
        );
        assert(t.tokens['bg.base'] === '#101010', 'theme not parsed');
      },
    ],
    [
      'render pipeline + asset images (real webview + CSP)',
      async () => {
        await platform.writeFileAtomic(
          f('pic.svg'),
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>',
        );
        const { renderMarkdown } = await import('./render/markdown');
        const { postprocess } = await import('./render/postprocess');
        const src = [
          '# T',
          '![p](pic.svg)',
          '```ts\nconst a = 1;\n```',
          '$x^2$',
          '```mermaid\ngraph TD; A-->B\n```',
          '<img src=x onerror="window.__pwned=1">',
        ].join('\n\n');
        const host = document.createElement('div');
        // On screen, so lazy images load like they do in the preview.
        host.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:9999';
        document.body.appendChild(host);
        host.innerHTML = renderMarkdown(src).html;
        await postprocess(host, {
          docPath: f('doc.md'),
          root: dir,
          remoteImages: true,
          syntax: { id: 'github-dark' },
          mermaid: { key: 'smoke', dark: true, vars: {} },
          assetUrl: (p) => platform.assetUrl(p),
          resolveWikilink: () => ({ path: null, heading: null }),
          isStale: () => false,
        });
        const img = host.querySelector<HTMLImageElement>('img[alt="p"]')!;
        if (!img.complete || img.naturalWidth === 0) {
          await new Promise((r) => {
            img.onload = r;
            img.onerror = r;
            setTimeout(r, 3000);
          });
        }
        assert(img.naturalWidth === 20, `asset image did not load (${img.src})`);
        assert(!!host.querySelector('pre.shiki'), 'shiki did not highlight');
        assert(!!host.querySelector('.katex'), 'katex did not render');
        assert(!!host.querySelector('.mermaid-rendered svg'), 'mermaid did not render');
        assert(!(window as unknown as { __pwned?: number }).__pwned, 'XSS executed');
        host.remove();
      },
    ],
    [
      'multi-window routing (open_path → new windows, deepest root, focus)',
      async () => {
        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const a = f('multi/a');
        const inner = f('multi/a/inner');
        await platform.createDir(inner);
        await platform.writeFileAtomic(join(a, 'x.md'), '# X\n');
        await platform.writeFileAtomic(join(inner, 'y.md'), '# Y\n');
        const r1 = await platform.openPath(a);
        assert(r1.kind === 'new-window' && !!r1.label, `folder: ${JSON.stringify(r1)}`);
        const r2 = await platform.openPath(join(a, 'x.md'));
        assert(r2.kind === 'focused' && r2.label === r1.label, `file in A: ${JSON.stringify(r2)}`);
        const r3 = await platform.openPath(inner);
        assert(r3.kind === 'new-window' && r3.label !== r1.label, `nested: ${JSON.stringify(r3)}`);
        const r4 = await platform.openPath(join(inner, 'y.md'));
        assert(
          r4.kind === 'focused' && r4.label === r3.label,
          `deepest wins: ${JSON.stringify(r4)}`,
        );
        const r5 = await platform.openPath(a);
        assert(r5.kind === 'focused' && r5.label === r1.label, `exact root: ${JSON.stringify(r5)}`);
        if (platform.os === 'windows') {
          const r6 = await platform.openPath(join(a, 'X.MD'));
          assert(
            r6.kind === 'focused' && r6.label === r1.label,
            `case-insensitive: ${JSON.stringify(r6)}`,
          );
        }
        // The spawned windows really booted: they opened their folders/files and reported back.
        const sessionFile = join((await platform.getDataDir()).path, 'session.json');
        let session = '';
        for (let i = 0; i < 60; i++) {
          session = await platform.readTextFile(sessionFile).catch(() => '');
          if (session.includes('x.md') && session.includes('y.md')) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert(
          session.includes('x.md') && session.includes('y.md'),
          `windows did not report: ${session}`,
        );
        for (const w of await getAllWebviewWindows()) if (w.label !== 'main') await w.destroy();
        return `${r1.label} + ${r3.label}`;
      },
    ],
    [
      'HTML export embeds fonts and images (fetch under the app CSP)',
      async () => {
        await platform.writeFileAtomic(f('export.md'), '# Export\n\n![p](pic.svg) and $x^2$\n');
        const { useDocument } = await import('./app/document');
        const { buildExportHtml } = await import('./export/html');
        const text = '# Export\n\n![p](pic.svg) and $x^2$\n';
        useDocument.setState({ path: f('export.md'), text, savedText: text, status: 'ready' });
        // KaTeX CSS and fonts load lazily; render once so they're present.
        const { loadKatex } = await import('./render/katex');
        await loadKatex();
        const { html } = await buildExportHtml();
        assert(html.includes('data:image/svg+xml;base64,'), 'image not embedded');
        assert(/data:font\/woff2;base64,/.test(html), 'fonts not embedded');
        const ext = /.{0,80}url\((?!["']?(data:|#))[^)]{0,80}/i.exec(html);
        assert(!ext, `external url() left in export: ${ext?.[0]}`);
        useDocument.setState({ path: null, text: '', savedText: '', status: 'empty' });
        return `${Math.round(html.length / 1024)} KB`;
      },
    ],
    [
      'out-of-scope write rejected',
      async () => {
        try {
          await platform.writeFileAtomic('/definitely/not/allowed.md', 'x');
        } catch (e) {
          return errorMessage(e);
        }
        throw new Error('write outside scope was allowed');
      },
    ],
  ];

  for (const [name, fn] of checks) {
    // Progress breadcrumbs, so a hang shows which step it was in.
    await platform.writeFileAtomic(f('smoke-progress.txt'), name).catch(() => {});
    try {
      const detail = await fn();
      steps.push({ name, ok: true, detail: detail ?? undefined });
    } catch (e) {
      steps.push({ name, ok: false, detail: errorMessage(e) });
    }
  }
  const ok = steps.every((s) => s.ok);
  await platform
    .writeFileAtomic(
      f('smoke-report.json'),
      JSON.stringify(
        {
          ok,
          label: (await import('@tauri-apps/api/webviewWindow')).getCurrentWebviewWindow().label,
          startedAt,
          href: location.href,
          steps,
        },
        null,
        2,
      ),
    )
    .catch(() => {});
  await invoke('smoke_exit', { code: ok ? 0 : 1 });
  return true;
}
