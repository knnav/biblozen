import { FolderOpen } from 'lucide-react';
import { Highlight, Picker } from '../commands/Picker';
import { basename, dirname } from '../platform/path';
import { useAppState } from '../settings/appState';
import { openPath } from './actions';

export function RecentFoldersPicker({ onClose }: { onClose: () => void }) {
  const recent = useAppState((s) => s.state.recentFolders);
  return (
    <Picker
      label="Open recent folder"
      placeholder="Search recent folders…"
      items={recent}
      getId={(r) => r}
      getText={(r) => r}
      emptyText="No recent folders yet"
      onCancel={onClose}
      onAccept={(r) => {
        onClose();
        void openPath(r);
      }}
      renderItem={(r, m) => (
        <div className="picker-row">
          <FolderOpen size={14} aria-hidden style={{ color: 'var(--accent)', flex: '0 0 auto' }} />
          <span className="picker-row__main">
            <Highlight
              text={basename(r)}
              indices={m.indices}
              offset={r.length - basename(r).length}
            />
          </span>
          <span className="picker-row__detail">{dirname(r)}</span>
        </div>
      )}
    />
  );
}
