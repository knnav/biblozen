import { create } from 'zustand';
import { defaultSettings, getPath, sanitize, setPath, type Settings } from './schema';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  set: (path: string, value: unknown) => void;
  replace: (s: Settings) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: defaultSettings,
  loaded: false,
  set: (path, value) =>
    set((st) => {
      const next = sanitize(setPath(st.settings, path, value), defaultSettings);
      return getPath(next, path) === getPath(st.settings, path) ? st : { settings: next };
    }),
  replace: (s) => set({ settings: s, loaded: true }),
}));

export function getSettings(): Settings {
  return useSettings.getState().settings;
}
