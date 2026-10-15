// Line-ending handling: the buffer always uses \n; saving restores the file's style.

export type Eol = '\n' | '\r\n';

export interface TextFormat {
  eol: Eol;
  /** File ended with a newline when loaded. */
  trailingNewline: boolean;
  /** UTF-8 BOM present. */
  bom: boolean;
}

export function detectFormat(raw: string): TextFormat {
  const bom = raw.charCodeAt(0) === 0xfeff;
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lf = (raw.match(/(?<!\r)\n/g) ?? []).length;
  return { eol: crlf > lf ? '\r\n' : '\n', trailingNewline: /\n$/.test(raw), bom };
}

export function toBuffer(raw: string): string {
  return (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n?/g, '\n');
}

/** Converts the buffer back to the file's original line endings/BOM. */
export function toDisk(buffer: string, fmt: TextFormat): string {
  const body = fmt.eol === '\r\n' ? buffer.replace(/\n/g, '\r\n') : buffer;
  return (fmt.bom ? '﻿' : '') + body;
}
