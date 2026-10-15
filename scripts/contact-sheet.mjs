// Dev helper: tiles screenshots into one image for review.
// Usage: node scripts/contact-sheet.mjs out.png <columns> a.png b.png …
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [, , out, cols, ...files] = process.argv;
const imgs = files
  .map(
    (f) =>
      `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()}</figcaption></figure>`,
  )
  .join('');
const html = `<html><body style="margin:0;background:#888;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">${imgs}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{background:#000;color:#fff;padding:2px}</style></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1800, height: 1000 } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
