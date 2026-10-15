import { extFromMime, imageMarkdown, timestamp } from './images';

describe('image paste helpers', () => {
  it('maps mime types', () => {
    expect(extFromMime('image/png')).toBe('png');
    expect(extFromMime('image/jpeg')).toBe('jpg');
    expect(extFromMime('image/svg+xml')).toBe('svg');
    expect(extFromMime('text/plain')).toBeNull();
  });
  it('builds URL-safe links and timestamps', () => {
    expect(imageMarkdown('assets/My Note-20261015-101010.png')).toBe(
      '![](assets/My%20Note-20261015-101010.png)',
    );
    expect(timestamp(new Date(2026, 9, 5, 7, 8, 9))).toBe('20261005-070809');
  });
});
