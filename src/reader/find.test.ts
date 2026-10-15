import { clearHighlights, highlightMatches, setCurrent } from './find';

function article(html: string) {
  const a = document.createElement('article');
  a.innerHTML = html;
  return a;
}

describe('find in document', () => {
  it('highlights case-insensitive matches across elements', () => {
    const a = article(
      '<p>Alpha beta ALPHA</p><ul><li>alphabet</li></ul><pre><code>x = alpha</code></pre>',
    );
    const marks = highlightMatches(a, 'alpha');
    expect(marks).toHaveLength(4);
    expect(marks.map((m) => m.textContent)).toEqual(['Alpha', 'ALPHA', 'alpha', 'alpha']);
    expect(a.querySelector('p')!.textContent).toBe('Alpha beta ALPHA');
  });

  it('skips svg, mathml, chrome and restores text on clear', () => {
    const a = article(
      '<div class="code-block__bar">alpha</div><svg><text>alpha</text></svg><span class="katex-mathml">alpha</span><p>alpha</p>',
    );
    expect(highlightMatches(a, 'alpha')).toHaveLength(1);
    const before = a.innerHTML;
    clearHighlights(a);
    expect(a.querySelectorAll('mark')).toHaveLength(0);
    expect(a.querySelector('p')!.childNodes).toHaveLength(1);
    expect(before).not.toBe(a.innerHTML);
  });

  it('marks the current match and handles empty queries', () => {
    const a = article('<p>one two one</p>');
    const marks = highlightMatches(a, 'one');
    setCurrent(marks, 1);
    expect(marks[1].dataset.current).toBe('true');
    expect(marks[0].dataset.current).toBeUndefined();
    expect(highlightMatches(a, '')).toEqual([]);
    expect(a.querySelectorAll('mark')).toHaveLength(0);
  });
});
