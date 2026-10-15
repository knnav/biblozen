import { useEffect } from 'react';
import { getView } from './controller';
import { bindScrollSync } from './scrollSync';
import { previewScroller } from '../reader/scroll';

/** Mounted only in split layout: wires editor ⇄ preview scroll sync. */
export function SplitSync() {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {
      const view = getView();
      const scroller = previewScroller();
      if (view && scroller) dispose = bindScrollSync(view, scroller);
    });
    return () => {
      cancelAnimationFrame(raf);
      dispose?.();
    };
  }, []);
  return null;
}
