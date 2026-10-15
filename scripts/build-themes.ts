// Generates src/themes/builtin.json from Shiki's bundled VS Code themes.
// Hand-tuning lives in src/themes/overrides.json so regeneration keeps it.
// Run: npm run themes:build

import { readFileSync, writeFileSync } from 'node:fs';
import { bundledThemes, bundledThemesInfo } from 'shiki/themes';
import { completeTokens, fromVsCode, type VsCodeTheme } from '../src/themes/derive';
import type { ThemeDef, Tokens } from '../src/themes/types';

interface Override {
  name?: string;
  tokens?: Partial<Tokens>;
}

const overrides = JSON.parse(readFileSync('src/themes/overrides.json', 'utf8')) as Record<
  string,
  Override
>;

const themes: ThemeDef[] = [];
for (const info of bundledThemesInfo) {
  const mod = await bundledThemes[info.id as keyof typeof bundledThemes]();
  const vs = mod.default as unknown as VsCodeTheme;
  const derived = fromVsCode(vs, info.id, info.displayName);
  const o = overrides[info.id];
  const tokens = o?.tokens
    ? completeTokens({ ...derived.tokens, ...o.tokens }, derived.type)
    : derived.tokens;
  themes.push({
    id: info.id,
    name: o?.name ?? info.displayName,
    type: info.type === 'light' ? 'light' : 'dark',
    tokens,
    syntax: info.id,
  });
}
themes.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync('src/themes/builtin.json', JSON.stringify(themes, null, 0) + '\n');
console.log(`wrote ${themes.length} themes (${Object.keys(overrides).length} hand-tuned)`);
