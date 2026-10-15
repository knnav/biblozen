// GitHub-compatible heading slugs (same algorithm as github-slugger).

// eslint-disable-next-line no-control-regex -- matches github-slugger's character class
const STRIP = /[\0-\x1F!-,./:-@[-^`{-~\u00A0-\u00BF\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F]/g;

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(STRIP, '').replace(/ /g, '-');
}

/** Tracks duplicates within one document: "a", "a-1", "a-2", … */
export class Slugger {
  private seen = new Map<string, number>();

  slug(text: string): string {
    const base = slugify(text);
    let slug = base;
    let n = this.seen.get(base) ?? 0;
    while (this.seen.has(slug)) {
      n++;
      slug = `${base}-${n}`;
    }
    this.seen.set(base, n);
    this.seen.set(slug, 0);
    return slug;
  }
}
