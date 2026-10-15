import { useWorkspace } from '../app/workspace';
import { BacklinksPanel } from './Backlinks';
import { OutlinePanel } from './Outline';
import './Panels.css';

export function SidePanels() {
  const panels = useWorkspace((s) => s.panels);
  const focus = useWorkspace((s) => s.focusMode);
  if (focus || (!panels.outline && !panels.backlinks)) return null;
  return (
    <aside className="side-panels" aria-label="Document panels">
      {panels.outline && <OutlinePanel />}
      {panels.backlinks && <BacklinksPanel />}
    </aside>
  );
}
