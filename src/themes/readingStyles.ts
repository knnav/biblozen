import './reading/fonts';
import './reading/reading.css';

export interface ReadingStyle {
  id: string;
  name: string;
  description: string;
  /** Font for the picker sample. */
  sampleFont: string;
}

export const READING_STYLES: ReadingStyle[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Familiar sans-serif, GitHub spacing',
    sampleFont: "'Inter Variable', sans-serif",
  },
  {
    id: 'book',
    name: 'Book',
    description: 'Literata at a book measure, generous leading',
    sampleFont: "'Literata Variable', serif",
  },
  {
    id: 'academic',
    name: 'Academic',
    description: 'Source Serif, numbered headings, prominent footnotes',
    sampleFont: "'Source Serif 4 Variable', serif",
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Dense and small, for reference docs',
    sampleFont: "'Inter Variable', sans-serif",
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Monospace everything, terminal feel',
    sampleFont: "'JetBrains Mono Variable', monospace",
  },
];

export function readingStyleName(id: string): string {
  return READING_STYLES.find((r) => r.id === id)?.name ?? id;
}
