import { useSettings } from '../settings/store';
import { useReader } from './store';

export function ProgressBar({ visible }: { visible: boolean }) {
  const enabled = useSettings((s) => s.settings.reader.progressBar);
  const progress = useReader((s) => s.progress);
  if (!enabled || !visible) return null;
  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="reading-progress__bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
