import * as cheerio from 'cheerio';

import { imageFromDataUri } from '@/rag/ingestion/parsers/dataUri';
import { createHeadingTracker } from '@/rag/ingestion/parsers/headings';
import { toMarkdownTable } from '@/rag/ingestion/tables';
import type { Element } from '@/rag/types';

const SKIP = new Set(['script', 'style', 'noscript', 'head', 'template', 'svg']);
const BLOCK = new Set([
 'p',
 'div',
 'li',
 'br',
 'tr',
 'section',
 'article',
 'blockquote',
 'pre',
 'ul',
 'ol',
 'dd',
 'dt',
]);

type Node = { type: string; name?: string; data?: string; children?: Node[]; attribs?: Record<string, string> };

/** Walks the DOM in document order: text grouped by heading, each `<table>` and data-URI `<img>` as its own element. */
export function parseHtml(html: string, page: number | null = null, basePath: string[] = []): Element[] {
 const $ = cheerio.load(html);
 const elements: Element[] = [];
 const headings = createHeadingTracker(basePath);
 let sectionPath = basePath;
 let buffer = '';

 const flush = () => {
  const content = buffer
   .split('\n')
   .map((line) => line.replace(/\s+/g, ' ').trim())
   .filter(Boolean)
   .join('\n');
  if (content) elements.push({ kind: 'text', content, page, sectionPath });
  buffer = '';
 };

 const visit = (node: Node) => {
  if (node.type === 'text') {
   buffer += node.data ?? '';
   return;
  }
  if (node.type !== 'tag' && node.type !== 'root') return;
  const name = node.name?.toLowerCase() ?? '';
  if (SKIP.has(name)) return;

  const heading = name.match(/^h([1-6])$/);
  if (heading) {
   flush();
   const title = $(node as never)
    .text()
    .replace(/\s+/g, ' ')
    .trim();
   if (title) sectionPath = headings.open(Number(heading[1]), title);
   return;
  }

  if (name === 'table') {
   flush();
   const rows = $(node as never)
    .find('tr')
    .toArray()
    .map((tr) =>
     $(tr)
      .children('th,td')
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, ' ').trim())
    )
    .filter((r) => r.length);
   if (rows.length) elements.push({ kind: 'table', content: toMarkdownTable(rows), rows, page, sectionPath });
   return;
  }

  if (name === 'img') {
   const image = imageFromDataUri(node.attribs?.src);
   if (image) {
    const nearbyText = buffer.trim().slice(-500);
    flush();
    elements.push({ kind: 'image', content: node.attribs?.alt ?? '', image, nearbyText, page, sectionPath });
   }
   return;
  }

  for (const child of node.children ?? []) visit(child);
  if (BLOCK.has(name)) buffer += '\n';
 };

 visit($.root()[0] as unknown as Node);
 flush();
 return elements;
}
