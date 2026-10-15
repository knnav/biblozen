import { Slugger, slugify } from './slug';

describe('slugify (GitHub)', () => {
  it('matches GitHub output', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('What’s new in v2.0?')).toBe('whats-new-in-v20');
    expect(slugify('C++ & Rust')).toBe('c--rust');
    expect(slugify('Ünïcödé Héading')).toBe('ünïcödé-héading');
    expect(slugify('  spaced  ')).toBe('spaced');
    expect(slugify('snake_case-and-dash')).toBe('snake_case-and-dash');
  });

  it('dedupes like GitHub', () => {
    const s = new Slugger();
    expect(['Intro', 'Intro', 'Intro', 'Intro-1'].map((t) => s.slug(t))).toEqual([
      'intro',
      'intro-1',
      'intro-2',
      'intro-1-1',
    ]);
  });
});
