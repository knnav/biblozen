import { detectFormat, toBuffer, toDisk } from './textfile';

describe('line endings', () => {
  it('round-trips CRLF files byte for byte', () => {
    const raw = '# Title\r\n\r\nBody\r\n';
    const fmt = detectFormat(raw);
    expect(fmt).toEqual({ eol: '\r\n', trailingNewline: true, bom: false });
    const buf = toBuffer(raw);
    expect(buf).toBe('# Title\n\nBody\n');
    expect(toDisk(buf, fmt)).toBe(raw);
  });

  it('round-trips LF without trailing newline and BOM files', () => {
    const raw = 'a\nb';
    expect(toDisk(toBuffer(raw), detectFormat(raw))).toBe(raw);
    const bom = '﻿x\r\ny\r\n';
    expect(toDisk(toBuffer(bom), detectFormat(bom))).toBe(bom);
  });

  it('applies the original EOL to edited lines', () => {
    const fmt = detectFormat('a\r\nb\r\n');
    expect(toDisk('a\nnew\nb\n', fmt)).toBe('a\r\nnew\r\nb\r\n');
  });
});
