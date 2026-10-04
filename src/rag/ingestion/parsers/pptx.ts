import path from 'node:path';

import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

import { toMarkdownTable } from '@/rag/ingestion/tables';
import type { Element } from '@/rag/types';

// parseTagValue off: the default turns text that looks numeric into numbers ("007" → 7, "1.50" → 1.5).
const xml = new XMLParser({
 ignoreAttributes: false,
 attributeNamePrefix: '@_',
 parseTagValue: false,
 trimValues: false,
});
const asArray = <T>(value: T | T[] | undefined): T[] => (value == null ? [] : Array.isArray(value) ? value : [value]);

const runText = (t: unknown): string =>
 t != null && typeof t === 'object' ? String((t as any)['#text'] ?? '') : String(t ?? '');

/** Every node stored under `key`, at any depth, without descending into a match or into `skip`. */
const findAll = (node: unknown, key: string, skip?: string): unknown[] => {
 if (node == null || typeof node !== 'object') return [];
 return Object.entries(node).flatMap(([k, value]) =>
  k === key ? asArray(value) : k === skip ? [] : findAll(value, key, skip)
 );
};

/** One line per paragraph (`a:p`); the runs inside a paragraph are joined without a break. */
const paragraphs = (node: unknown, skip?: string): string[] =>
 findAll(node, 'a:p', skip)
  .map((p) => findAll(p, 'a:t').map(runText).join('').trim())
  .filter(Boolean);

/** Slide text, `a:tbl` tables, and the images each slide references through its `_rels` file. */
export async function parsePptx(buffer: Buffer): Promise<Element[]> {
 const zip = await JSZip.loadAsync(buffer);
 const slidePaths = Object.keys(zip.files)
  .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

 const elements: Element[] = [];
 for (const [index, slidePath] of slidePaths.entries()) {
  const page = index + 1;
  const sectionPath = [`Slide ${page}`];
  const slide = xml.parse(await zip.file(slidePath)!.async('string'));

  // Body text skips table subtrees, so table cells are not indexed twice.
  const text = paragraphs(slide, 'a:tbl').join('\n');
  if (text) elements.push({ kind: 'text', content: text, page, sectionPath });

  for (const tbl of findAll(slide, 'a:tbl')) {
   const rows = asArray((tbl as any)['a:tr']).map((tr) => asArray(tr['a:tc']).map((tc) => paragraphs(tc).join(' ')));
   if (rows.length) elements.push({ kind: 'table', content: toMarkdownTable(rows), rows, page, sectionPath });
  }

  const relsFile = zip.file(slidePath.replace('slides/', 'slides/_rels/') + '.rels');
  if (!relsFile) continue;
  const rels = asArray(xml.parse(await relsFile.async('string'))?.Relationships?.Relationship);
  // A rels file can name the same media entry any number of times; read each once.
  const targets = new Set(
   rels.filter((rel) => String(rel['@_Type']).endsWith('/image')).map((rel) => String(rel['@_Target']))
  );
  for (const target of targets) {
   const media = zip.file(path.posix.join('ppt/slides', target));
   if (media) {
    elements.push({
     kind: 'image',
     content: '',
     image: await media.async('nodebuffer'),
     nearbyText: text,
     page,
     sectionPath,
    });
   }
  }
 }
 return elements;
}
