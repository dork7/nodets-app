import JSZip from 'jszip';

vi.mock('@/rag/llm', () => ({ invokeStructured: vi.fn() }));

import { QualityGateError } from '@/rag/graphUtils';
import { assertElementBudget, assertZipBudget, MIME, parseDocument } from '@/rag/ingestion/parsers';
import { parseHtml } from '@/rag/ingestion/parsers/html';
import { extractImages, parseMarkdown } from '@/rag/ingestion/parsers/markdown';
import { parsePptx } from '@/rag/ingestion/parsers/pptx';
import { parseMarkdownTable, toMarkdownTable } from '@/rag/ingestion/tables';
import type { Element } from '@/rag/types';

const paths = (elements: Element[]) => elements.filter((el) => el.kind === 'text').map((el) => el.sectionPath);

describe('heading paths', () => {
 it('replaces a sibling heading instead of nesting under it (Markdown starting at h2)', () => {
  expect(paths(parseMarkdown('## X\nx\n## Y\ny\n### Z\nz\n## W\nw'))).toEqual([['X'], ['Y'], ['Y', 'Z'], ['W']]);
 });

 it('handles skipped levels (Markdown h1 then h3)', () => {
  expect(paths(parseMarkdown('# A\na\n### C\nc\n### D\nd\n# B\nb'))).toEqual([['A'], ['A', 'C'], ['A', 'D'], ['B']]);
 });

 it('does the same for HTML, keeping the base path', () => {
  const html = '<h2>X</h2><p>x</p><h2>Y</h2><p>y</p><h4>Z</h4><p>z</p>';
  expect(paths(parseHtml(html, null, ['Doc']))).toEqual([
   ['Doc', 'X'],
   ['Doc', 'Y'],
   ['Doc', 'Y', 'Z'],
  ]);
 });
});

describe('pptx text fidelity', () => {
 const slide = (body: string) => `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
 const p = (...runs: string[]) => `<a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p>`;

 it('keeps numeric-looking text exactly and joins the runs of a paragraph on one line', async () => {
  const zip = new JSZip();
  zip.file(
   'ppt/slides/slide1.xml',
   slide(
    `<p:sp><p:txBody>${p('Code ', '007')}${p('Rate 1.50')}</p:txBody></p:sp>` +
     `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${p('2.0')}</a:txBody></a:tc>` +
     `<a:tc><a:txBody>${p('0x1A')}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
   )
  );
  const elements = await parsePptx(await zip.generateAsync({ type: 'nodebuffer' }));

  expect(elements[0]).toMatchObject({ kind: 'text', content: 'Code 007\nRate 1.50' });
  expect(elements[1].rows).toEqual([['2.0', '0x1A']]);
 });

 it('reads a media file once even when the slide references it many times', async () => {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', slide(`<p:sp><p:txBody>${p('Title')}</p:txBody></p:sp>`));
  const rel = '<Relationship Type="http://x/relationships/image" Target="../media/logo.png"/>';
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships>${rel.repeat(50)}</Relationships>`);
  zip.file('ppt/media/logo.png', Buffer.from([1, 2, 3]));

  const elements = await parsePptx(await zip.generateAsync({ type: 'nodebuffer' }));
  expect(elements.filter((el) => el.kind === 'image')).toHaveLength(1);
 });
});

describe('table helpers on hostile input', () => {
 it('keeps the second line of a table that has no separator row', () => {
  expect(parseMarkdownTable(['| a | b |', '| 1 | 2 |', '| 3 | 4 |'])).toEqual([
   ['a', 'b'],
   ['1', '2'],
   ['3', '4'],
  ]);
  expect(parseMarkdownTable(['| a | b |', '| :-- | --: |', '| 1 | 2 |'])).toEqual([
   ['a', 'b'],
   ['1', '2'],
  ]);
 });

 it('serialises a very long table without overflowing the stack', () => {
  const rows = Array.from({ length: 250_000 }, (_, i) => [String(i)]);
  expect(toMarkdownTable(rows).split('\n')).toHaveLength(250_001);
 });

 it.each([
  ['a cell that is one long run of spaces', () => toMarkdownTable([['h'], [' '.repeat(200_000)]])],
  ['a line of repeated image openers', () => parseMarkdown('![]('.repeat(60_000))],
  ['a long line of spaces after a table row', () => parseMarkdown(`| a |\n${' '.repeat(200_000)}`)],
 ])('stays fast on %s', (_label, run) => {
  const started = Date.now();
  run();
  expect(Date.now() - started).toBeLessThan(2000);
 });
});

describe('extractImages', () => {
 it('replaces images with their alt text and returns their targets', () => {
  expect(extractImages('See ![a chart](data:image/png;base64,AAAA "Title") and ![](x.png).')).toEqual({
   text: 'See a chart and .',
   images: [
    { alt: 'a chart', src: 'data:image/png;base64,AAAA' },
    { alt: '', src: 'x.png' },
   ],
  });
 });

 it('leaves text that only looks like an image untouched', () => {
  for (const line of ['![no target]', '![a](b c)', '![unclosed](x', 'plain [link](x) text', '![]()']) {
   expect(extractImages(line)).toEqual({ text: line, images: [] });
  }
 });

 it.each([
  ['openers with no close', '![]('.repeat(60_000)],
  ['openers with spaces and one close at the end', `${'![]( '.repeat(60_000)})`],
  ['open brackets and one late close bracket', `${'!['.repeat(60_000)}]x`],
 ])('is linear on %s', (_label, line) => {
  const started = Date.now();
  extractImages(line);
  expect(Date.now() - started).toBeLessThan(1000);
 });
});

describe('ingestion budgets', () => {
 const many = (kind: Element['kind'], n: number): Element[] =>
  Array.from({ length: n }, () => ({ kind, content: 'x', page: null, sectionPath: [] }));

 it('refuses a document with more images or tables than one job may spend model calls on', () => {
  expect(() => assertElementBudget(many('image', 201))).toThrow(QualityGateError);
  expect(() => assertElementBudget(many('table', 201))).toThrow(QualityGateError);
  expect(() =>
   assertElementBudget([...many('image', 200), ...many('table', 200), ...many('text', 5000)])
  ).not.toThrow();
 });

 it('applies the budget to parsed documents', async () => {
  const markdown = Array.from({ length: 201 }, (_, i) => `| h${i} |\n| --- |\n| v |\n`).join('\n');
  await expect(parseDocument(Buffer.from(markdown), MIME.markdown)).rejects.toThrow(/201 tables/);
 });

 it('refuses a zip container that declares more data than the budget before inflating it', async () => {
  const zip = new JSZip();
  // Highly compressible: small on disk, 210 MB declared.
  for (let i = 0; i < 3; i++) zip.file(`word/part${i}.xml`, Buffer.alloc(70 * 1024 * 1024));
  const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  expect(bomb.length).toBeLessThan(2 * 1024 * 1024);

  await expect(assertZipBudget(bomb)).rejects.toThrow(QualityGateError);
  await expect(parseDocument(bomb, MIME.docx)).rejects.toThrow(/over the limit/);
 }, 30_000);

 it('accepts an ordinary container', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document/>');
  await expect(assertZipBudget(await zip.generateAsync({ type: 'nodebuffer' }))).resolves.toBeUndefined();
 });
});
