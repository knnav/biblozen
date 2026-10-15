import { countWords, readingMinutes } from './stats';

describe('stats', () => {
  it('counts prose words, not markup', () => {
    expect(countWords('# Hello world\n\nA [link](http://x.y/z) and `code`.')).toBe(6);
    expect(countWords('---\ntitle: x\n---\nOne two')).toBe(2);
    expect(countWords('```js\nconst a = 1;\n```\nword')).toBe(1);
    expect(countWords("it's — naïve café")).toBe(3);
  });
  it('estimates reading time', () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(2300)).toBe(10);
  });
});
