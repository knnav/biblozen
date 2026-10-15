// Generated fixtures for performance tests.

const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat'.split(
    ' ',
  );

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function sentence(r: () => number, n = 12): string {
  const w = Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]);
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w.join(' ') + '.';
}

/** A realistic markdown document of roughly `bytes` size. */
export function bigMarkdown(bytes = 1_000_000, seed = 1): string {
  const r = rng(seed);
  const parts: string[] = ['# Big document\n'];
  let size = 0;
  let section = 0;
  while (size < bytes) {
    section++;
    const chunk: string[] = [`## Section ${section}\n`];
    for (let i = 0; i < 4; i++) {
      chunk.push(
        `${sentence(r)} **${WORDS[i]}** and *${WORDS[i + 1]}* with \`code ${i}\` and a [link](other-${section}.md#part). ${sentence(r, 20)}\n`,
      );
    }
    chunk.push(
      `- ${sentence(r, 6)}\n- [ ] ${sentence(r, 5)}\n- [x] ${sentence(r, 5)}\n  - nested ${sentence(r, 4)}\n`,
    );
    if (section % 3 === 0)
      chunk.push(
        '```ts\nconst x: number = ' +
          section +
          ';\nfunction f(a: string) {\n  return a.repeat(2);\n}\n```\n',
      );
    if (section % 4 === 0)
      chunk.push('| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n');
    if (section % 5 === 0) chunk.push(`> [!NOTE]\n> ${sentence(r)}\n`);
    if (section % 7 === 0) chunk.push(`See [[note-${section}]] and $x^${section % 9}$.\n`);
    const text = chunk.join('\n');
    size += text.length;
    parts.push(text);
  }
  return parts.join('\n');
}

/** A folder of `count` markdown files that link to each other. */
export function bigFolder(count = 2000, seed = 2): Record<string, string> {
  const r = rng(seed);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const dir = `area-${i % 20}/topic-${i % 7}`;
    const links = Array.from({ length: 3 }, () => `[[note-${Math.floor(r() * count)}]]`).join(' ');
    files[`${dir}/note-${i}.md`] =
      `# Note ${i}\n\n${sentence(r, 30)}\n\n## Details\n\n${sentence(r, 40)} ${links}\n`;
  }
  return files;
}
