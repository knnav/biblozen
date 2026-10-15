import { FileText, Hash, Image, File } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openFile } from '../app/actions';
import { useWorkspace } from '../app/workspace';
import { Highlight, Picker } from '../commands/Picker';
import { useIndex } from '../index/store';
import { basename, dirname, isImage, isMarkdown, relative, samePath } from '../platform/path';
import { useHistory } from '../reader/history';
import { jumpToAnchor } from '../reader/nav';
import { useReader } from '../reader/store';

// Heading mode filters on the text after "#".
const stripHash = (q: string) => (q.startsWith('#') ? q.slice(1) : q);

type Item =
  | { kind: 'file'; id: string; path: string; rel: string; name: string }
  | { kind: 'heading'; id: string; slug: string; text: string; level: number };

export function QuickOpen({ onClose, initial = '' }: { onClose: () => void; initial?: string }) {
  const refs = useIndex((s) => s.refs);
  const root = useWorkspace((s) => s.root);
  const headings = useReader((s) => s.headings);
  const history = useHistory((s) => s.entries);
  const [query, setQuery] = useState(initial);
  const headingMode = query.startsWith('#');

  const items = useMemo<Item[]>(() => {
    if (headingMode) {
      return headings.map((h) => ({
        kind: 'heading',
        id: `h:${h.slug}`,
        slug: h.slug,
        text: h.text,
        level: h.level,
      }));
    }
    // Recently opened first, then markdown, then everything else.
    const recent = [...history].reverse().map((e) => e.path);
    const rank = (p: string) => {
      const i = recent.findIndex((r) => samePath(r, p));
      return i === -1 ? Infinity : i;
    };
    return refs
      .map((r) => ({
        kind: 'file' as const,
        id: r.path,
        path: r.path,
        rel: root ? relative(root, r.path) : r.path,
        name: basename(r.path),
      }))
      .sort(
        (a, b) =>
          rank(a.path) - rank(b.path) ||
          Number(isMarkdown(b.path)) - Number(isMarkdown(a.path)) ||
          a.rel.localeCompare(b.rel),
      );
  }, [refs, root, history, headings, headingMode]);

  return (
    <Picker<Item>
      label={headingMode ? 'Go to heading' : 'Quick open'}
      placeholder={headingMode ? 'Go to heading…' : 'Search files by name…   (# for headings)'}
      items={items}
      getId={(i) => i.id}
      getText={(i) => (i.kind === 'file' ? i.rel : i.text)}
      initialQuery={initial}
      onQueryChange={setQuery}
      filter
      limit={50}
      emptyText={
        headingMode
          ? 'No headings in this document'
          : refs.length
            ? 'No matching files'
            : 'Open a folder first'
      }
      onCancel={onClose}
      onAccept={(i) => {
        onClose();
        if (i.kind === 'file') void openFile(i.path);
        else requestAnimationFrame(() => jumpToAnchor(i.slug));
      }}
      queryForFilter={stripHash}
      renderItem={(i, m) =>
        i.kind === 'file' ? (
          <div className="picker-row">
            {isMarkdown(i.path) ? (
              <FileText size={14} className="picker-row__icon" aria-hidden />
            ) : isImage(i.path) ? (
              <Image size={14} className="picker-row__icon" aria-hidden />
            ) : (
              <File size={14} className="picker-row__icon" aria-hidden />
            )}
            <span className="picker-row__main">
              <Highlight text={i.name} indices={m.indices} offset={i.rel.length - i.name.length} />
            </span>
            <span className="picker-row__detail">
              <Highlight text={dirname(i.rel) === '.' ? '' : dirname(i.rel)} indices={m.indices} />
            </span>
          </div>
        ) : (
          <div className="picker-row" style={{ paddingLeft: (i.level - 1) * 12 }}>
            <Hash size={13} className="picker-row__icon" aria-hidden />
            <span className="picker-row__main">
              <Highlight text={i.text} indices={m.indices} />
            </span>
            <span className="picker-row__detail">H{i.level}</span>
          </div>
        )
      }
    />
  );
}
