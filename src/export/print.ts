// PDF export through the system print dialog with a print stylesheet (SPEC §13).

import { getPlatform } from '../platform';
import { previewArticle } from '../reader/scroll';
import { getSettings } from '../settings/store';
import { findTheme, previewTheme, useThemes } from '../themes/engine';
import { useTheme } from '../themes/store';
import { useWorkspace } from '../app/workspace';
import { switchMode } from '../app/appCommands';

async function loadAllImages(root: HTMLElement) {
  const imgs = [...root.querySelectorAll<HTMLImageElement>('img')];
  for (const img of imgs) img.loading = 'eager';
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((r) => {
            img.addEventListener('load', r, { once: true });
            img.addEventListener('error', r, { once: true });
            setTimeout(r, 3000);
          }),
    ),
  );
}

export async function printDocument(): Promise<void> {
  const s = getSettings();
  // The preview is what prints; make sure it's on screen.
  if (useWorkspace.getState().mode === 'edit' && useWorkspace.getState().editLayout === 'editor') {
    switchMode({ type: 'enterRead' });
    await new Promise((r) => setTimeout(r, 300));
  }
  const body = document.body;
  if (s.export.pdfBreakBeforeH1) body.dataset.printBreakH1 = 'true';
  const wasPreview = useThemes.getState().previewId;
  const lightId = s.theme.light;
  const forceLight =
    s.export.pdfForceLight && useTheme.getState().type === 'dark' && findTheme(lightId);
  if (forceLight) previewTheme(lightId);
  const article = previewArticle();
  if (article) await loadAllImages(article);
  const restore = () => {
    delete body.dataset.printBreakH1;
    if (forceLight) previewTheme(wasPreview);
  };
  window.addEventListener('afterprint', restore, { once: true });
  try {
    await getPlatform().printPage();
  } finally {
    // Some webviews return before the dialog closes and never fire afterprint.
    setTimeout(restore, 1500);
  }
}
