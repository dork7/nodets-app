import type { BaseMessage } from '@langchain/core/messages';
import sharp from 'sharp';

vi.mock('@/rag/config', () => ({ config: { agentConcurrency: 2, tableRowGroup: 3, imageMaxEdge: 16 } }));
vi.mock('@/rag/llm', () => ({ invokeStructured: vi.fn() }));
vi.mock('@/rag/stores/blobs', () => ({ saveBlob: vi.fn() }));

import { RAG_TABLE_SUMMARY_PROMPT } from '@/config/prompt';
import { toDataUrl } from '@/rag/dataUrl';
import { describeImages, normaliseImage } from '@/rag/ingestion/imageAgent';
import { summariseTables } from '@/rag/ingestion/tableAgent';
import { toMarkdownTable } from '@/rag/ingestion/tables';
import { invokeStructured } from '@/rag/llm';
import { saveBlob } from '@/rag/stores/blobs';
import type { Element } from '@/rag/types';

const llm = vi.mocked(invokeStructured);
/** The messages of the n-th model call. */
const messages = (call = 0) => llm.mock.calls[call][2] as BaseMessage[];

const HEADER = ['Year', 'Revenue'];
const body = (n: number) => Array.from({ length: n }, (_, i) => [String(2000 + i), String(100 + i)]);
const table = (rows: string[][], extra: Partial<Element> = {}): Element => ({
 kind: 'table',
 content: toMarkdownTable(rows),
 page: 4,
 sectionPath: ['Financials', 'Revenue'],
 rows,
 ...extra,
});

const solidPng = (width: number, height: number) =>
 sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
  .png()
  .toBuffer();

beforeEach(() => {
 llm.mockReset();
 vi.mocked(saveBlob).mockReset().mockResolvedValue('blob_1');
});

describe('summariseTables', () => {
 it('stores a small table whole as one parent, with the summary as its one child', async () => {
  llm.mockResolvedValue({ summary: 'Revenue by year, 2000-2001.' });
  const el = table([HEADER, ...body(2)]);

  const { parents, children } = await summariseTables('doc_1', [
   { kind: 'text', content: 'ignored', page: 4, sectionPath: [] },
   el,
  ]);

  expect(llm).toHaveBeenCalledTimes(1);
  expect(llm.mock.calls[0][0]).toBe('utility');
  expect(messages()[0].content).toBe(RAG_TABLE_SUMMARY_PROMPT);
  expect(messages()[1].content).toBe(
   `Section: Financials > Revenue\n<table>\n${el.content}\n</table>\nThe table has 2 rows in total.`
  );

  expect(parents).toEqual([
   {
    _id: expect.stringMatching(/^par_/),
    docId: 'doc_1',
    modality: 'table',
    content: el.content,
    blobId: null,
    page: 4,
    sectionPath: ['Financials', 'Revenue'],
    createdAt: expect.any(Date),
   },
  ]);
  expect(children).toEqual([
   {
    chunkId: expect.stringMatching(/^chk_/),
    parentId: parents[0]._id,
    modality: 'table',
    content: 'Revenue by year, 2000-2001.',
    page: 4,
    sectionPath: ['Financials', 'Revenue'],
   },
  ]);
 });

 it('keeps a table of exactly tableRowGroup rows in one parent', async () => {
  llm.mockResolvedValue({ summary: 's' });
  const { parents, children } = await summariseTables('doc_1', [table([HEADER, ...body(3)])]);

  expect(parents).toHaveLength(1);
  expect(children[0].content).toBe('s');
 });

 it('splits a larger table into one parent per row group, repeating the header', async () => {
  llm.mockResolvedValue({ summary: 'Revenue by year.' });
  const rows = body(7);
  const { parents, children } = await summariseTables('doc_1', [table([HEADER, ...rows])]);

  // One summary for the whole table, not one per group.
  expect(llm).toHaveBeenCalledTimes(1);
  expect(parents.map((p) => p.content)).toEqual([
   toMarkdownTable([HEADER, ...rows.slice(0, 3)]),
   toMarkdownTable([HEADER, ...rows.slice(3, 6)]),
   toMarkdownTable([HEADER, ...rows.slice(6)]),
  ]);
  expect(parents.every((p) => p.content.startsWith('| Year | Revenue |\n| --- | --- |\n'))).toBe(true);
  expect(children.map((c) => c.content)).toEqual([
   'Revenue by year.\n\nRows 1-3.',
   'Revenue by year.\n\nRows 4-6.',
   'Revenue by year.\n\nRows 7-7.',
  ]);
  expect(children.map((c) => c.parentId)).toEqual(parents.map((p) => p._id));
  expect(new Set(parents.map((p) => p._id)).size).toBe(3);
 });

 it('stores a table that has no parsed rows as its raw content', async () => {
  llm.mockResolvedValue({ summary: 's' });
  const el: Element = { kind: 'table', content: '| a |\n| --- |\n| 1 |', page: null, sectionPath: [] };
  const { parents, children } = await summariseTables('doc_1', [el]);

  expect(messages()[1].content).toBe(`<table>\n${el.content}\n</table>`);
  expect(parents).toHaveLength(1);
  expect(parents[0]).toMatchObject({ content: el.content, page: null });
  expect(children[0].content).toBe('s');
 });

 it('shows the model only the first 60 rows of a long table but states the real total', async () => {
  llm.mockResolvedValue({ summary: 's' });
  const rows = [HEADER, ...body(100)];
  await summariseTables('doc_1', [table(rows, { sectionPath: [] })]);

  const prompt = messages()[1].content as string;
  expect(prompt).toBe(`<table>\n${toMarkdownTable(rows.slice(0, 61))}\n</table>\nThe table has 100 rows in total.`);
 });

 it('keeps tables in document order and makes no model call when there are none', async () => {
  expect(await summariseTables('doc_1', [{ kind: 'text', content: 'x', page: 1, sectionPath: [] }])).toEqual({
   parents: [],
   children: [],
  });
  expect(llm).not.toHaveBeenCalled();

  llm.mockImplementation(async (_role, _schema, msgs) => {
   const first = (msgs[1].content as string).includes('| A |');
   // The first table answers last; the output must still follow the input order.
   await new Promise((resolve) => setTimeout(resolve, first ? 15 : 0));
   return { summary: first ? 'first' : 'second' };
  });
  const { children } = await summariseTables('doc_1', [table([['A'], ['1']]), table([['B'], ['2']])]);
  expect(children.map((c) => c.content)).toEqual(['first', 'second']);
 });

 it('propagates a model failure', async () => {
  llm.mockRejectedValue(new Error('refused'));
  await expect(summariseTables('doc_1', [table([HEADER, ...body(1)])])).rejects.toThrow('refused');
 });
});

describe('describeImages', () => {
 const described = {
  imageType: 'chart' as const,
  description: 'A bar chart of revenue by year.',
  visibleText: 'Revenue (AED m)',
  dataPoints: ['2024: 380', '2025: 412'],
 };

 it('describes an image with bytes and keeps the normalised image as a blob on the parent', async () => {
  llm.mockResolvedValue(described);
  const image = await solidPng(8, 8);
  const el: Element = {
   kind: 'image',
   content: 'Figure 3',
   page: 9,
   sectionPath: ['Results'],
   image,
   nearbyText: 'Revenue grew.',
  };

  const { parents, children } = await describeImages('doc_1', [
   { kind: 'text', content: 'x', page: 9, sectionPath: [] },
   el,
  ]);

  expect(llm).toHaveBeenCalledTimes(1);
  expect(llm.mock.calls[0][0]).toBe('vision');
  const parts = messages()[0].content as { type: string; text?: string; image_url?: { url: string } }[];
  // An opaque image is sent as JPEG; only images with transparency stay PNG.
  expect(parts[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
  expect(parts[1].text).toContain('Figure 3\nRevenue grew.');

  const content = 'A bar chart of revenue by year.\n\nVisible text: Revenue (AED m)\n\nData: 2024: 380; 2025: 412';
  expect(parents).toEqual([
   {
    _id: expect.stringMatching(/^par_/),
    docId: 'doc_1',
    modality: 'image',
    content,
    blobId: 'blob_1',
    page: 9,
    sectionPath: ['Results'],
    createdAt: expect.any(Date),
   },
  ]);
  expect(children).toEqual([
   {
    chunkId: expect.stringMatching(/^chk_/),
    parentId: parents[0]._id,
    modality: 'image',
    content,
    page: 9,
    sectionPath: ['Results'],
   },
  ]);

  // The stored blob is the image that was sent to the model.
  const [source, filename, metadata] = vi.mocked(saveBlob).mock.calls[0];
  expect(filename).toBe('doc_1-image');
  expect(metadata).toEqual({ docId: 'doc_1', kind: 'image' });
  expect(toDataUrl((source as { buffer: Buffer }).buffer)).toBe(parts[0].image_url?.url);
 });

 it('leaves out the visible-text and data sections when the model returns none', async () => {
  llm.mockResolvedValue({ ...described, visibleText: '', dataPoints: [] });
  const { parents } = await describeImages('doc_1', [
   { kind: 'image', content: '', page: null, sectionPath: [], image: await solidPng(4, 4) },
  ]);

  expect(parents[0].content).toBe('A bar chart of revenue by year.');
  const parts = messages()[0].content as { text?: string }[];
  expect(parts[1].text).toContain('(none)');
 });

 it('passes an already-described figure through with no model call and no blob', async () => {
  const { parents, children } = await describeImages('doc_1', [
   { kind: 'image', content: 'Figure 2: org chart of the finance team.', page: 2, sectionPath: ['Org'] },
  ]);

  expect(llm).not.toHaveBeenCalled();
  expect(saveBlob).not.toHaveBeenCalled();
  expect(parents).toHaveLength(1);
  expect(parents[0]).toMatchObject({
   modality: 'image',
   content: 'Figure 2: org chart of the finance team.',
   blobId: null,
   page: 2,
   sectionPath: ['Org'],
  });
  expect(children).toEqual([expect.objectContaining({ parentId: parents[0]._id, content: parents[0].content })]);
 });

 it('returns nothing for a document without images', async () => {
  expect(await describeImages('doc_1', [{ kind: 'text', content: 'x', page: 1, sectionPath: [] }])).toEqual({
   parents: [],
   children: [],
  });
 });

 it('skips an image that cannot be decoded instead of failing the document', async () => {
  llm.mockResolvedValue(described);
  const { parents } = await describeImages('doc_1', [
   { kind: 'image', content: '', page: 1, sectionPath: [], image: Buffer.from('not an image') },
   { kind: 'image', content: '', page: 2, sectionPath: [], image: await solidPng(4, 4) },
  ]);

  expect(parents.map((p) => p.page)).toEqual([2]);
  expect(llm).toHaveBeenCalledTimes(1);
 });

 it('describes and stores an image that repeats in a document only once', async () => {
  llm.mockResolvedValue(described);
  const logo = await solidPng(4, 4);
  const { parents } = await describeImages(
   'doc_1',
   [1, 2, 3].map((page) => ({ kind: 'image' as const, content: '', page, sectionPath: [], image: logo }))
  );

  expect(parents.map((p) => p.page)).toEqual([1, 2, 3]);
  expect(new Set(parents.map((p) => p.blobId)).size).toBe(1);
  expect(llm).toHaveBeenCalledTimes(1);
  expect(saveBlob).toHaveBeenCalledTimes(1);
 });
});

describe('normaliseImage', () => {
 it('bounds the longest edge, keeps the aspect ratio and outputs JPEG for an opaque image', async () => {
  const jpeg = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#336699' } })
   .jpeg()
   .toBuffer();
  const meta = await sharp(await normaliseImage(jpeg)).metadata();
  expect(meta).toMatchObject({ format: 'jpeg', width: 16, height: 8 });
 });

 it('does not enlarge a small image', async () => {
  const meta = await sharp(await normaliseImage(await solidPng(4, 6))).metadata();
  expect(meta).toMatchObject({ width: 4, height: 6 });
 });

 it('keeps PNG for an image with transparency', async () => {
  const transparent = await sharp({
   create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
  })
   .png()
   .toBuffer();
  expect((await sharp(await normaliseImage(transparent)).metadata()).format).toBe('png');
 });
});
