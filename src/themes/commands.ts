import { useWorkspace } from '../app/workspace';
import type { Command } from '../commands/registry';
import { useSettings } from '../settings/store';
import { activeScheme } from './engine';
import { READING_STYLES } from './readingStyles';

const readNoText = (c: { mode: string; textFocus: boolean }) => c.mode === 'read' && !c.textFocus;

export function themeCommands(): Command[] {
  const settings = () => useSettings.getState();
  return [
    {
      id: 'theme.pick',
      title: 'Color Theme…',
      category: 'Appearance',
      keys: ['Mod+K Mod+T', { keys: 't', when: readNoText }],
      run: () => useWorkspace.getState().openOverlay('theme'),
    },
    {
      id: 'readingStyle.pick',
      title: 'Reading Style…',
      category: 'Appearance',
      run: () => useWorkspace.getState().openOverlay('readingStyle'),
    },
    {
      id: 'theme.toggleFollowOS',
      title: 'Toggle Follow System Appearance',
      category: 'Appearance',
      run: () => {
        const t = settings().settings.theme;
        // Keep what's on screen when switching off.
        settings().set('theme', { ...t, followOS: !t.followOS, manual: activeScheme(t) });
      },
    },
    {
      id: 'theme.toggleScheme',
      title: 'Switch Between Light and Dark Theme',
      category: 'Appearance',
      run: () => {
        const t = settings().settings.theme;
        const next = activeScheme(t) === 'dark' ? 'light' : 'dark';
        settings().set('theme', { ...t, followOS: false, manual: next });
      },
    },
    ...READING_STYLES.map<Command>((r) => ({
      id: `readingStyle.${r.id}`,
      title: `Reading Style: ${r.name}`,
      category: 'Appearance',
      run: () => settings().set('readingStyle', r.id),
    })),
    {
      id: 'reader.toggleDropCap',
      title: 'Toggle Drop Cap (Book style)',
      category: 'Appearance',
      run: () => settings().set('reader.dropCap', !settings().settings.reader.dropCap),
    },
  ];
}
