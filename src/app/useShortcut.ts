import { useSyncExternalStore } from 'react';
import { commandsVersion, displayKeys, getCommand, subscribeCommands } from '../commands/registry';
import { formatBindingText } from '../commands/keys';
import { getPlatform } from '../platform';

/** Formatted first shortcut of a command, for tooltips. */
export function useShortcutLabel(id: string): string {
  useSyncExternalStore(subscribeCommands, commandsVersion);
  const cmd = getCommand(id);
  const keys = cmd ? displayKeys(cmd) : [];
  return keys[0] ? formatBindingText(keys[0], getPlatform().os) : '';
}
