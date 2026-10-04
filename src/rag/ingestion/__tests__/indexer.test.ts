const addDocuments = vi.fn();
const order: string[] = [];
vi.mock('@/rag/embeddings', () => ({ documentEmbeddings: { marker: 'embeddings' } }));
vi.mock('@/rag/stores/docstore', () => ({ replaceParents: vi.fn(), getDocument: vi.fn(), deleteParents: vi.fn() }));
vi.mock('@/rag/stores/blobs', () => ({ deleteBlobsForDocument: vi.fn() }));
vi.mock('@/rag/stores/qdrant', () => ({
 ensureCollection: vi.fn(),
 deleteDocumentPoints: vi.fn(),
 vectorStore: vi.fn(),
}));

import { documentEmbeddings } from '@/rag/embeddings';
import { DocumentGoneError, indexDocument, LostLockError } from '@/rag/ingestion/indexer';
import { deleteBlobsForDocument } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';
import { deleteDocumentPoints, ensureCollection, vectorStore } from '@/rag/stores/qdrant';
import type { Child, Parent, RagDocument } from '@/rag/types';

const doc = (metadata: Record<string, unknown> = {}): RagDocument => ({
 _id: 'doc_1',
 collection: 'finance',
 filename: 'report.pdf',
 mimeType: 'application/pdf',
 sha256: 'abc',
 sizeBytes: 10,
 blobId: 'blob_1',
 status: 'indexing',
 chunkCount: 0,
 metadata,
 acl: ['user:u1'],
 uploadedBy: 'u1',
 createdAt: new Date(0),
 updatedAt: new Date(0),
});

const child = (i: number, extra: Partial<Child> = {}): Child => ({
 chunkId: `chk_${i}`,
 parentId: `par_${i}`,
 modality: 'text',
 content: `chunk ${i}`,
 page: 2,
 sectionPath: ['Intro'],
 ...extra,
});

const parents = [{ _id: 'par_0' } as Parent];

beforeEach(() => {
 order.length = 0;
 vi
  .mocked(docstore.getDocument)
  .mockReset()
  .mockResolvedValue({ _id: 'doc_1' } as never);
 vi.mocked(docstore.deleteParents).mockReset();
 vi.mocked(deleteBlobsForDocument).mockReset();
 addDocuments.mockReset().mockImplementation(async () => void order.push('addDocuments'));
 vi
  .mocked(ensureCollection)
  .mockReset()
  .mockImplementation(async () => void order.push('ensureCollection'));
 vi
  .mocked(deleteDocumentPoints)
  .mockReset()
  .mockImplementation(async () => void order.push('deletePoints'));
 vi
  .mocked(docstore.replaceParents)
  .mockReset()
  .mockImplementation(async () => void order.push('replaceParents'));
 vi
  .mocked(vectorStore)
  .mockReset()
  .mockReturnValue({ addDocuments } as never);
});

describe('indexDocument', () => {
 it('clears the old points and parents before writing any vector', async () => {
  expect(await indexDocument(doc(), parents, [child(0)])).toBe(1);

  expect(order).toEqual(['ensureCollection', 'deletePoints', 'replaceParents', 'addDocuments']);
  expect(deleteDocumentPoints).toHaveBeenCalledWith('doc_1');
  expect(docstore.replaceParents).toHaveBeenCalledWith('doc_1', parents);
  expect(vectorStore).toHaveBeenCalledWith(documentEmbeddings);
 });

 it('writes the child content with the fields retrieval filters on', async () => {
  await indexDocument(doc({ team: 'fp&a', year: 2025 }), parents, [child(0, { modality: 'table', page: null })]);

  expect(addDocuments).toHaveBeenCalledWith([
   {
    pageContent: 'chunk 0',
    metadata: {
     team: 'fp&a',
     year: 2025,
     chunkId: 'chk_0',
     docId: 'doc_1',
     parentId: 'par_0',
     modality: 'table',
     collection: 'finance',
     filename: 'report.pdf',
     page: null,
     sectionPath: ['Intro'],
     acl: ['user:u1'],
     createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    },
   },
  ]);
 });

 it('never lets free-form document metadata overwrite a protected field', async () => {
  const hostile = {
   acl: ['*'],
   collection: 'public',
   docId: 'doc_other',
   parentId: 'par_other',
   chunkId: 'chk_other',
   modality: 'image',
   filename: 'other.pdf',
   page: 99,
   sectionPath: ['x'],
   createdAt: 'yesterday',
   note: 'kept',
  };
  await indexDocument(doc(hostile), parents, [child(0)]);

  const { metadata } = addDocuments.mock.calls[0][0][0];
  expect(metadata).toMatchObject({
   acl: ['user:u1'],
   collection: 'finance',
   docId: 'doc_1',
   parentId: 'par_0',
   chunkId: 'chk_0',
   modality: 'text',
   filename: 'report.pdf',
   page: 2,
   sectionPath: ['Intro'],
   note: 'kept',
  });
  expect(metadata.createdAt).not.toBe('yesterday');
 });

 it('embeds in batches of 64, in order, and returns the number of chunks', async () => {
  const children = Array.from({ length: 130 }, (_, i) => child(i));
  expect(await indexDocument(doc(), parents, children)).toBe(130);

  expect(addDocuments.mock.calls.map(([batch]) => batch.length)).toEqual([64, 64, 2]);
  const written = addDocuments.mock.calls.flatMap(([batch]) => batch.map((d: any) => d.metadata.chunkId));
  expect(written).toEqual(children.map((c) => c.chunkId));
 });

 it('still clears the previous index when the document now produces no chunks', async () => {
  expect(await indexDocument(doc(), [], [])).toBe(0);

  expect(deleteDocumentPoints).toHaveBeenCalledWith('doc_1');
  expect(docstore.replaceParents).toHaveBeenCalledWith('doc_1', []);
  expect(addDocuments).not.toHaveBeenCalled();
 });

 it('writes nothing when the old points could not be cleared', async () => {
  vi.mocked(deleteDocumentPoints).mockRejectedValue(new Error('qdrant down'));

  await expect(indexDocument(doc(), parents, [child(0)])).rejects.toThrow('qdrant down');
  expect(docstore.replaceParents).not.toHaveBeenCalled();
  expect(addDocuments).not.toHaveBeenCalled();
 });

 it('removes image blobs no longer referenced, keeping the upload and the current parents', async () => {
  await indexDocument(
   doc(),
   [{ _id: 'par_0', blobId: 'img_1' } as Parent, { _id: 'par_1', blobId: null } as Parent],
   [child(0)]
  );
  expect(deleteBlobsForDocument).toHaveBeenCalledWith('doc_1', ['blob_1', 'img_1']);
 });

 it('writes nothing when this worker no longer holds the job', async () => {
  await expect(indexDocument(doc(), parents, [child(0)], async () => false)).rejects.toBeInstanceOf(LostLockError);
  expect(order).toEqual([]);
 });

 it('writes nothing when the document was deleted before indexing', async () => {
  vi.mocked(docstore.getDocument).mockResolvedValue(null);
  await expect(indexDocument(doc(), parents, [child(0)])).rejects.toBeInstanceOf(DocumentGoneError);
  expect(order).toEqual([]);
 });

 it('undoes its writes when the document is deleted while indexing', async () => {
  vi
   .mocked(docstore.getDocument)
   .mockResolvedValueOnce({ _id: 'doc_1' } as never)
   .mockResolvedValueOnce(null);

  await expect(indexDocument(doc(), parents, [child(0)])).rejects.toBeInstanceOf(DocumentGoneError);
  expect(order).toEqual(['ensureCollection', 'deletePoints', 'replaceParents', 'addDocuments', 'deletePoints']);
  expect(docstore.deleteParents).toHaveBeenCalledWith('doc_1');
  expect(deleteBlobsForDocument).toHaveBeenLastCalledWith('doc_1', []);
 });
});
