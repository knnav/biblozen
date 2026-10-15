import { getPlatform } from '../platform';
import { basename } from '../platform/path';
import { currentFormat, noteOwnWrite } from './actions';
import { useDocument } from './document';
import { toDisk } from './textfile';
import { toastError } from './toasts';

/** Saves the buffer with the file's original line endings. Atomic on disk. */
export async function saveDocument(): Promise<boolean> {
  const doc = useDocument.getState();
  if (!doc.path || doc.status !== 'ready') return false;
  const path = doc.path;
  const text = doc.text;
  const disk = toDisk(text, currentFormat());
  useDocument.setState({ saving: true });
  try {
    noteOwnWrite(path, disk);
    await getPlatform().writeFileAtomic(path, disk);
    if (useDocument.getState().path === path) {
      useDocument.setState({
        savedText: text,
        saving: false,
        lastSavedAt: Date.now(),
        conflict: null,
      });
    }
    return true;
  } catch (e) {
    useDocument.setState({ saving: false });
    toastError(e, `Couldn’t save “${basename(path)}”`);
    return false;
  }
}
