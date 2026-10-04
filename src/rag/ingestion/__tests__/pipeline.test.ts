vi.mock('@/rag/stores/blobs', () => ({ saveBlob: vi.fn(), deleteBlobs: vi.fn(), readBlob: vi.fn() }));
vi.mock('@/rag/stores/docstore', () => ({}));

import { chunkText, groupSections } from '@/rag/ingestion/chunking';
import { sniffType } from '@/rag/ingestion/intake';
import { MIME } from '@/rag/ingestion/parsers';
import { applyFidelityCheck, textOverlap } from '@/rag/ingestion/parsers/pdf';
import { printableRatio, qualityProblems } from '@/rag/ingestion/quality';
import type { Child, Element } from '@/rag/types';

const text = (content: string, sectionPath: string[] = [], page: number | null = null): Element => ({
 kind: 'text',
 content,
 page,
 sectionPath,
});

describe('sniffType', () => {
 it('detects binary formats from their bytes, not the extension', () => {
  expect(sniffType(Buffer.from('%PDF-1.7 ...'), 'notes.txt')).toBe(MIME.pdf);
  expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), 'x.bin')).toBe('image/png');
  expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x')).toBe('image/jpeg');
 });

 it('uses the extension to tell ZIP-based office formats apart', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  expect(sniffType(zip, 'a.docx')).toBe(MIME.docx);
  expect(sniffType(zip, 'a.xlsx')).toBe(MIME.xlsx);
  expect(sniffType(zip, 'a.zip')).toBeNull();
 });

 it('accepts text formats only when the content is really text', () => {
  expect(sniffType(Buffer.from('# Title\nbody text here'), 'readme.md')).toBe(MIME.markdown);
  expect(sniffType(Buffer.from('a,b\n1,2\n'), 'data.csv')).toBe(MIME.csv);
  expect(sniffType(Buffer.from([0x4d, 0x5a, 0x00, 0x03, 0x00]), 'evil.txt')).toBeNull();
  expect(sniffType(Buffer.from('plain text'), 'program.exe')).toBeNull();
 });
});

describe('chunking', () => {
 it('merges consecutive text under the same heading into one section', () => {
  const sections = groupSections([text('a', ['H1']), text('b', ['H1']), text('c', ['H2']), text('d', ['H1'])]);
  expect(sections.map((s) => s.content)).toEqual(['a\n\nb', 'c', 'd']);
 });

 it('makes the section the parent and prefixes each chunk with its heading path', async () => {
  const long = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} about revenue.`).join(' ');
  const { parents, children } = await chunkText('doc_1', [
   text(long, ['Financials', 'Revenue'], 3),
   { kind: 'table', content: '| a |', page: 3, sectionPath: [] },
  ]);

  expect(parents).toHaveLength(1);
  expect(parents[0]).toMatchObject({ docId: 'doc_1', modality: 'text', content: long, page: 3 });
  expect(children.length).toBeGreaterThan(1);
  expect(children.every((c) => c.parentId === parents[0]._id)).toBe(true);
  expect(children.every((c) => c.content.startsWith('Financials > Revenue\n\n'))).toBe(true);
  expect(new Set(children.map((c) => c.chunkId)).size).toBe(children.length);
 });
});

describe('quality gate', () => {
 const child = (content: string, modality: Child['modality'] = 'text'): Child => ({
  chunkId: 'c',
  parentId: 'p',
  modality,
  content,
  page: null,
  sectionPath: [],
 });

 it('passes ordinary content', () => {
  expect(qualityProblems([text('hello world')], [child('hello world')])).toEqual([]);
 });

 it('flags empty documents, garbled text, oversized chunks and empty image descriptions', () => {
  expect(qualityProblems([], [])).toEqual(['no content could be extracted from the document']);
  const garbled = '\u0001\u0002��'.repeat(50);
  expect(printableRatio(garbled)).toBe(0);
  expect(qualityProblems([text(garbled)], [child('x')])).toContain('extracted text is mostly non-printable');
  expect(qualityProblems([text('ok')], [child('x'.repeat(30_001))])[0]).toMatch(/exceed the embedding input limit/);
  expect(qualityProblems([text('ok')], [child('  ', 'image')])[0]).toMatch(/empty description/);
 });
});

describe('PDF fidelity check', () => {
 const layer = 'The quarterly revenue reached four hundred twelve million dirhams in the reporting period.';

 it('measures how much of the text layer the agent reproduced', () => {
  expect(textOverlap(layer, layer.toUpperCase())).toBe(1);
  expect(textOverlap(layer, 'revenue reached')).toBeLessThan(0.5);
  expect(textOverlap('', 'anything')).toBe(1);
 });

 it('keeps the agent output when it matches the text layer', () => {
  const elements = [text(layer, ['Results'], 1)];
  expect(applyFidelityCheck(elements, new Map([[1, layer]]))).toEqual(elements);
 });

 it('falls back to the text layer for a diverging page but keeps its tables and figures', () => {
  const table: Element = { kind: 'table', content: '| a |', page: 1, sectionPath: ['Results'] };
  const result = applyFidelityCheck([text('A short, wrong summary.', ['Results'], 1), table], new Map([[1, layer]]));
  expect(result).toEqual([{ kind: 'text', content: layer, page: 1, sectionPath: ['Results'] }, table]);
 });

 it('leaves scanned pages (no text layer) to the agent', () => {
  const elements = [text('OCR-like reading', [], 2)];
  expect(applyFidelityCheck(elements, new Map([[2, '']]))).toEqual(elements);
 });
});
