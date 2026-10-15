import { lineToY, normalizeAnchors, yToLine } from './scrollMap';

const anchors = normalizeAnchors([
  { line: 0, y: 0 },
  { line: 4, y: 100 },
  { line: 4, y: 120 }, // nested element on the same line
  { line: 10, y: 400 },
]);
const end = { line: 20, y: 600 };

describe('scroll map', () => {
  it('keeps one anchor per line, monotonic', () => {
    expect(anchors).toEqual([
      { line: 0, y: 0 },
      { line: 4, y: 100 },
      { line: 10, y: 400 },
    ]);
  });

  it('interpolates lines to y and back', () => {
    expect(lineToY(anchors, 4, end)).toBe(100);
    expect(lineToY(anchors, 7, end)).toBe(250);
    expect(lineToY(anchors, 15, end)).toBe(500);
    expect(yToLine(anchors, 250, end)).toBe(7);
    expect(yToLine(anchors, 500, end)).toBe(15);
    for (const l of [0, 1.5, 4, 8.25, 12, 19])
      expect(yToLine(anchors, lineToY(anchors, l, end), end)).toBeCloseTo(l);
  });

  it('clamps beyond the ends', () => {
    expect(lineToY(anchors, 50, end)).toBe(600);
    expect(yToLine(anchors, 9999, end)).toBe(20);
    expect(lineToY([], 3, end)).toBe(0);
  });
});
