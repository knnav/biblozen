import { useMemo, useSyncExternalStore } from 'react';
import { getPlatform } from '../platform';
import { useAppState } from '../settings/appState';
import { formatBinding } from './keys';
import { Highlight, Picker } from './Picker';
import {
  allCommands,
  commandsVersion,
  displayKeys,
  getCommandContext,
  isAvailable,
  runCommand,
  subscribeCommands,
  type Command,
} from './registry';

export function Keys({ binding }: { binding: string }) {
  const os = getPlatform().os;
  return (
    <span className="picker-row__keys">
      {formatBinding(binding, os).map((stroke, i) => (
        <span key={i} className="picker-row__keys">
          {stroke.map((k, j) => (
            <kbd key={j}>{k}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

function label(c: Command): string {
  return c.category ? `${c.category}: ${c.title}` : c.title;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const version = useSyncExternalStore(subscribeCommands, commandsVersion);
  const recent = useAppState((s) => s.state.recentCommands);
  const items = useMemo(() => {
    void version;
    const ctx = getCommandContext();
    const cmds = allCommands().filter(
      (c) => !c.hidden && c.id !== 'palette.open' && isAvailable(c, { ...ctx, overlay: false }),
    );
    const rank = new Map(recent.map((id, i) => [id, i]));
    return cmds.sort((a, b) => {
      const ra = rank.get(a.id) ?? Infinity;
      const rb = rank.get(b.id) ?? Infinity;
      return ra !== rb ? ra - rb : label(a).localeCompare(label(b));
    });
  }, [version, recent]);

  return (
    <Picker
      label="Command palette"
      placeholder="Type a command…"
      items={items}
      getId={(c) => c.id}
      getText={label}
      onCancel={onClose}
      onAccept={(c) => {
        onClose();
        // Let the overlay unmount (and focus return) before running.
        requestAnimationFrame(() => void runCommand(c.id));
      }}
      renderItem={(c, m) => {
        const keys = displayKeys(c, { ...getCommandContext(), overlay: false });
        return (
          <div className="picker-row">
            <span className="picker-row__main">
              {c.category && (
                <span className="picker-row__category">
                  <Highlight text={`${c.category}: `} indices={m.indices} />
                </span>
              )}
              <Highlight
                text={c.title}
                indices={m.indices}
                offset={c.category ? c.category.length + 2 : 0}
              />
            </span>
            {keys.map((k) => (
              <Keys key={k} binding={k} />
            ))}
          </div>
        );
      }}
      footer={
        <>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </>
      }
    />
  );
}
