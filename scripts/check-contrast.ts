// Fails if any built-in theme breaks a legibility rule (body text ≥ 4.5:1, …).
// Run: npm run check:contrast

import { readFileSync } from 'node:fs';
import { contrast } from '../src/themes/color';
import { LEGIBILITY } from '../src/themes/derive';
import type { ThemeDef } from '../src/themes/types';

export function checkThemes(themes: ThemeDef[]): string[] {
  const failures: string[] = [];
  for (const t of themes) {
    for (const r of LEGIBILITY) {
      const c = contrast(t.tokens[r.fg], t.tokens[r.bg]);
      if (c < r.min)
        failures.push(
          `${t.name}: ${r.label} ${t.tokens[r.fg]} on ${t.tokens[r.bg]} = ${c.toFixed(2)} (< ${r.min})`,
        );
    }
  }
  return failures;
}

if (process.argv[1]?.endsWith('check-contrast.ts')) {
  const themes = JSON.parse(readFileSync('src/themes/builtin.json', 'utf8')) as ThemeDef[];
  const failures = checkThemes(themes);
  const body = themes.map((t) => contrast(t.tokens['fg.base'], t.tokens['bg.base']));
  console.log(
    `${themes.length} themes · body text contrast min ${Math.min(...body).toFixed(2)}:1, median ${body.sort((a, b) => a - b)[Math.floor(body.length / 2)].toFixed(2)}:1`,
  );
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('all legibility rules pass');
}
