import { useWorkspace } from '../app/workspace';
import type { Command } from '../commands/registry';

const hasRoot = () => useWorkspace.getState().root !== null;

export function searchCommands(): Command[] {
  return [
    {
      id: 'file.quickOpen',
      title: 'Quick Open…',
      category: 'Go',
      keys: ['Mod+P'],
      when: hasRoot,
      run: () => useWorkspace.getState().openOverlay('quickOpen'),
    },
    {
      id: 'file.goToHeading',
      title: 'Go to Heading…',
      category: 'Go',
      when: (c) => c.mode !== 'none',
      run: () => useWorkspace.getState().openOverlay('quickOpen', '#'),
    },
    {
      id: 'search.open',
      title: 'Search in Folder…',
      category: 'Go',
      keys: ['Mod+Shift+S'],
      when: hasRoot,
      run: () => useWorkspace.getState().openOverlay('search'),
    },
  ];
}
