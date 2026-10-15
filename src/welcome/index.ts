// The bundled Welcome folder (SPEC §15): copied into the data dir on first run.

import { getPlatform } from '../platform';
import { dirname, join } from '../platform/path';

const files = import.meta.glob('./files/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const WELCOME_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([k, v]) => [k.replace('./files/', ''), v]),
);

/** Copies missing Welcome files into `<data>/Welcome`. Never overwrites. Returns the folder. */
export async function ensureWelcomeFolder(): Promise<string> {
  const platform = getPlatform();
  const { path: dataDir } = await platform.getDataDir();
  const root = join(dataDir, 'Welcome');
  const dirs = new Set<string>([root]);
  for (const rel of Object.keys(WELCOME_FILES)) dirs.add(dirname(join(root, rel)));
  for (const d of [...dirs].sort((a, b) => a.length - b.length)) {
    if (!(await platform.exists(d))) await platform.createDir(d).catch(() => {});
  }
  for (const [rel, content] of Object.entries(WELCOME_FILES)) {
    const p = join(root, rel);
    if (!(await platform.exists(p))) await platform.createFile(p, content).catch(() => {});
  }
  return root;
}
