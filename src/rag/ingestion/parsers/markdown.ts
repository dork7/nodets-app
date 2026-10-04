import { imageFromDataUri } from '@/rag/ingestion/parsers/dataUri';
import { createHeadingTracker } from '@/rag/ingestion/parsers/headings';
import { parseMarkdownTable } from '@/rag/ingestion/tables';
import type { Element } from '@/rag/types';

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const MAX_ALT_CHARS = 1000;

/**
 * Finds `![alt](target "title")` images in one line and returns the line with each
 * replaced by its alt text. A hand-written single pass, because every regex form of this
 * pattern backtracks quadratically on a crafted line such as `![](` repeated thousands of times.
 */
export function extractImages(line: string): { text: string; images: { alt: string; src: string }[] } {
 const images: { alt: string; src: string }[] = [];
 let text = '';
 let pos = 0;
 while (pos < line.length) {
  const start = line.indexOf('![', pos);
  if (start === -1) break;
  const altEnd = line.indexOf(']', start + 2);
  // No closing bracket anywhere ahead means no later image can close either.
  if (altEnd === -1) break;
  const close = line[altEnd + 1] === '(' ? line.indexOf(')', altEnd + 2) : -1;
  const inner = close === -1 ? '' : line.slice(altEnd + 2, close).trim();
  // The target is one run of non-space characters, optionally followed by a quoted title.
  const space = inner.search(/\s/);
  const title = space === -1 ? '' : inner.slice(space).trim();
  const valid =
   close !== -1 &&
   altEnd - start - 2 <= MAX_ALT_CHARS &&
   inner.length > 0 &&
   (space === -1 || (title.length <= MAX_ALT_CHARS && /^"[^"]*"$/.test(title)));
  if (!valid) {
   // Not an image: keep the two characters and look again just after them.
   text += line.slice(pos, start + 2);
   pos = start + 2;
   // Without a ")" ahead nothing later can be an image, so the rest is plain text.
   if (line[altEnd + 1] === '(' && close === -1) break;
   continue;
  }
  const alt = line.slice(start + 2, altEnd);
  images.push({ alt, src: space === -1 ? inner : inner.slice(0, space) });
  text += line.slice(pos, start) + alt;
  pos = close + 1;
 }
 return { text: text + line.slice(pos), images };
}

/** A separator row is short; testing the pattern on a very long line is where it turns quadratic. */
const MAX_SEPARATOR_CHARS = 10_000;
const isSeparator = (line: string | undefined) =>
 !!line && line.length <= MAX_SEPARATOR_CHARS && TABLE_SEPARATOR.test(line);
const FENCE = /^\s*(```|~~~)/;

/**
 * Splits Markdown into sections by heading, lifting GFM tables and data-URI images out
 * as their own elements. Hand-rolled because `unified`/`remark` are ESM-only and this
 * project compiles to CommonJS.
 */
export function parseMarkdown(markdown: string): Element[] {
 const elements: Element[] = [];
 const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
 const headings = createHeadingTracker();
 let sectionPath: string[] = [];
 let buffer: string[] = [];
 let inFence = false;

 const flush = () => {
  const content = buffer.join('\n').trim();
  if (content) elements.push({ kind: 'text', content, page: null, sectionPath });
  buffer = [];
 };

 for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (FENCE.test(line)) inFence = !inFence;
  if (inFence) {
   buffer.push(line);
   continue;
  }

  const heading = line.match(HEADING);
  if (heading) {
   flush();
   sectionPath = headings.open(heading[1].length, heading[2]);
   continue;
  }

  if (TABLE_ROW.test(line) && isSeparator(lines[i + 1])) {
   flush();
   const tableLines = [line, lines[i + 1]];
   i += 2;
   while (i < lines.length && TABLE_ROW.test(lines[i])) tableLines.push(lines[i++]);
   i--;
   elements.push({
    kind: 'table',
    content: tableLines.join('\n'),
    rows: parseMarkdownTable(tableLines),
    page: null,
    sectionPath,
   });
   continue;
  }

  // Keep the alt text in the prose either way; the (possibly huge) data URI is dropped.
  const { text, images } = extractImages(line);
  for (const { alt, src } of images) {
   const image = imageFromDataUri(src);
   if (image) {
    flush();
    elements.push({ kind: 'image', content: alt, image, nearbyText: lines[i - 1] ?? '', page: null, sectionPath });
   }
  }
  buffer.push(text);
 }
 flush();
 return elements;
}
