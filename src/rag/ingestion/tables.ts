// Each pattern is linear: `\s*\n\s*` backtracks quadratically on a long run of spaces with no newline.
const cell = (value: string) =>
 value
  .replace(/\|/g, '\\|')
  .replace(/[\r\n]+/g, ' ')
  .replace(/ {2,}/g, ' ')
  .trim();

/** Serialises rows (header first) as a GitHub-flavoured Markdown table. */
export function toMarkdownTable(rows: string[][]): string {
 if (!rows.length) return '';
 // Not Math.max(...rows): spreading a very long table overflows the call stack.
 const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
 const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i] ?? '')).join(' | ')} |`;
 const [header, ...body] = rows;
 return [line(header), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(line)].join('\n');
}

/** Splits body rows into groups of `size`, repeating the header in each, so no table is cut mid-row. */
export function rowGroups(rows: string[][], size: number): { rows: string[][]; from: number; to: number }[] {
 const [header, ...body] = rows;
 if (body.length <= size) return [{ rows, from: 1, to: body.length }];
 const groups: { rows: string[][]; from: number; to: number }[] = [];
 for (let i = 0; i < body.length; i += size) {
  const slice = body.slice(i, i + size);
  groups.push({ rows: [header, ...slice], from: i + 1, to: i + slice.length });
 }
 return groups;
}

/** Parses the lines of a GFM table (header, separator, rows) back into cells. */
export function parseMarkdownTable(lines: string[]): string[][] {
 const split = (line: string) =>
  line
   .trim()
   .replace(/^\||\|$/g, '')
   .split(/(?<!\\)\|/)
   .map((c) => c.replace(/\\\|/g, '|').trim());
 // Drop the separator row only if it is one; a table written without it has data on line 2.
 const isSeparator = (line: string) => line.length < 10_000 && /^[\s|:-]+$/.test(line) && line.includes('-');
 return lines.filter((line, i) => !(i === 1 && isSeparator(line))).map(split);
}
