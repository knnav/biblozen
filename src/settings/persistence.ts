import type { Platform } from '../platform';
import { errorMessage } from '../platform';
import { join } from '../platform/path';
import { changedPaths, defaultSettings, getPath, sanitize, setPath, type Settings } from './schema';
import { useSettings } from './store';

export function serialize(s: Settings): string {
  return JSON.stringify(s, null, 2) + '\n';
}

/**
 * Loads settings.json, saves changes back (debounced) and hot-reloads edits made by
 * hand or by other windows. Returns a disposer.
 */
export async function bindSettings(
  platform: Platform,
  onError: (msg: string) => void = console.error,
): Promise<() => void> {
  const { path: dataDir } = await platform.getDataDir();
  const file = join(dataDir, 'settings.json');
  // What we last read from / wrote to disk, as text and as parsed settings.
  let syncedText = '';
  let synced: Settings = defaultSettings;

  const parse = (text: string): Settings => sanitize(JSON.parse(text), defaultSettings);

  const load = async (initial: boolean) => {
    let text: string;
    try {
      text = await platform.readTextFile(file);
    } catch {
      if (initial) {
        synced = defaultSettings;
        syncedText = serialize(defaultSettings);
        useSettings.getState().replace(defaultSettings);
        await platform.writeFileAtomic(file, syncedText).catch((e) => onError(errorMessage(e)));
      }
      return;
    }
    if (text === syncedText) return; // our own write echoing back
    try {
      const parsed = parse(text);
      syncedText = text;
      synced = parsed;
      useSettings.getState().replace(parsed);
    } catch (e) {
      onError(`settings.json is not valid JSON — keeping current settings (${errorMessage(e)})`);
      if (initial) useSettings.getState().replace(defaultSettings);
    }
  };

  await load(true);

  /**
   * Writes in-app changes. If the file changed on disk since we last synced (a hand
   * edit or another window), only our own changed keys are applied on top of it, so
   * neither side's edits are lost.
   */
  const save = async () => {
    const current = useSettings.getState().settings;
    const mine = changedPaths(synced, current);
    if (!mine.length) return;
    let next = current;
    const disk = await platform.readTextFile(file).catch(() => null);
    if (disk !== null && disk !== syncedText) {
      try {
        let merged = parse(disk);
        for (const p of mine) merged = setPath(merged, p, getPath(current, p));
        next = sanitize(merged, defaultSettings);
      } catch {
        // Disk copy is invalid JSON: our in-memory settings win.
      }
    }
    const text = serialize(next);
    synced = next;
    syncedText = text;
    if (next !== current) useSettings.getState().replace(next);
    await platform
      .writeFileAtomic(file, text)
      .catch((e) => onError(`Could not save settings: ${errorMessage(e)}`));
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useSettings.subscribe((st, prev) => {
    if (st.settings === prev.settings || st.settings === synced) return;
    clearTimeout(timer);
    timer = setTimeout(() => void save(), 200);
  });

  let unwatch: (() => void) | undefined;
  try {
    unwatch = await platform.watch(
      dataDir,
      (events) => {
        if (events.some((e) => e.paths.some((p) => p.endsWith('settings.json')))) void load(false);
      },
      { recursive: false, delayMs: 100 },
    );
  } catch (e) {
    onError(`Settings hot-reload unavailable: ${errorMessage(e)}`);
  }

  return () => {
    clearTimeout(timer);
    unsub();
    unwatch?.();
  };
}
