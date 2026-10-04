import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/rag/stores/blobs', () => ({ saveBlob: vi.fn(), deleteBlobs: vi.fn() }));
vi.mock('@/rag/stores/docstore', () => ({
 findDocumentByHash: vi.fn(),
 latestJobForDocument: vi.fn(),
 insertDocument: vi.fn(),
 insertJob: vi.fn(),
 setDocumentStatus: vi.fn(),
 deleteDocumentRecord: vi.fn(),
}));

import { HttpError } from '@/rag/graphUtils';
import { type IngestFields, inspectFile, registerFile, registerText } from '@/rag/ingestion/intake';
import { MIME } from '@/rag/ingestion/parsers';
import { deleteBlobs, saveBlob } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';

const principal = { id: 'u1', acl: ['user:u1', '*'] };
const fields: IngestFields = { collection: 'finance', metadata: { team: 'fp&a' }, textFormat: 'plain' };
const sha = (data: string) => createHash('sha256').update(data).digest('hex');
const duplicateKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

let dir: string;
const tempFile = async (name: string, content: string) => {
 const filePath = path.join(dir, name);
 await writeFile(filePath, content);
 return { path: filePath, originalname: 'notes.txt', size: Buffer.byteLength(content) };
};

beforeEach(async () => {
 dir = await mkdtemp(path.join(tmpdir(), 'rag-intake-'));
 vi.mocked(saveBlob).mockReset().mockResolvedValue('blob_1');
 vi.mocked(deleteBlobs).mockReset().mockResolvedValue(undefined);
 vi.mocked(docstore.findDocumentByHash).mockReset().mockResolvedValue(null);
 vi.mocked(docstore.latestJobForDocument).mockReset().mockResolvedValue(null);
 vi
  .mocked(docstore.insertDocument)
  .mockReset()
  .mockResolvedValue({} as never);
 vi
  .mocked(docstore.insertJob)
  .mockReset()
  .mockResolvedValue({} as never);
 vi
  .mocked(docstore.setDocumentStatus)
  .mockReset()
  .mockResolvedValue({} as never);
 vi
  .mocked(docstore.deleteDocumentRecord)
  .mockReset()
  .mockResolvedValue({} as never);
});

afterEach(async () => {
 await rm(dir, { recursive: true, force: true });
});

describe('registerText', () => {
 it('stores the text as a blob and creates a queued document and job, private to the uploader', async () => {
  const text = 'Revenue was 412M.';
  const hash = sha(text);
  const result = await registerText(text, fields, principal, 'req_1');

  // Dedupe is scoped to the uploader, so another user's copy of the same bytes is never returned.
  expect(docstore.findDocumentByHash).toHaveBeenCalledWith('finance', hash, 'u1');
  expect(result).toEqual({
   docId: expect.stringMatching(/^doc_/),
   jobId: expect.stringMatching(/^job_/),
   filename: `inline-${hash.slice(0, 12)}.txt`,
   mimeType: MIME.text,
   sizeBytes: Buffer.byteLength(text),
   sha256: hash,
   status: 'queued',
  });
  expect(saveBlob).toHaveBeenCalledWith({ buffer: Buffer.from(text) }, result.filename, { docId: result.docId });

  expect(docstore.insertDocument).toHaveBeenCalledTimes(1);
  expect(docstore.insertDocument).toHaveBeenCalledWith({
   _id: result.docId,
   collection: 'finance',
   filename: result.filename,
   mimeType: MIME.text,
   sha256: hash,
   sizeBytes: Buffer.byteLength(text),
   blobId: 'blob_1',
   status: 'queued',
   chunkCount: 0,
   metadata: { team: 'fp&a' },
   acl: ['user:u1'],
   uploadedBy: 'u1',
   createdAt: expect.any(Date),
   updatedAt: expect.any(Date),
  });
  expect(docstore.insertJob).toHaveBeenCalledTimes(1);
  expect(docstore.insertJob).toHaveBeenCalledWith({
   _id: result.jobId,
   docId: result.docId,
   requestId: 'req_1',
   uploadedBy: 'u1',
   status: 'queued',
   stage: null,
   counts: { text: 0, table: 0, image: 0 },
   attempts: 0,
   lockedAt: null,
   runAfter: null,
   workerId: null,
   errorId: null,
   createdAt: expect.any(Date),
   startedAt: null,
   finishedAt: null,
  });
 });

 it('adds the caller acl to the uploader own entry, which is always present', async () => {
  await registerText('a', { ...fields, acl: ['group:finance', 'user:u1'] }, principal, 'req_1');
  await registerText('b', { ...fields, acl: [] }, principal, 'req_1');

  expect(vi.mocked(docstore.insertDocument).mock.calls[0][0].acl).toEqual(['user:u1', 'group:finance']);
  expect(vi.mocked(docstore.insertDocument).mock.calls[1][0].acl).toEqual(['user:u1']);
 });

 it('names markdown text .md with the markdown mime type, and counts bytes rather than characters', async () => {
  const text = '# Résumé';
  const result = await registerText(text, { ...fields, textFormat: 'markdown' }, principal, 'req_1');

  expect(result.filename).toBe(`inline-${sha(text).slice(0, 12)}.md`);
  expect(result.mimeType).toBe(MIME.markdown);
  expect(result.sizeBytes).toBe(10);
 });

 it('returns the existing document and its latest job for a duplicate sha256, without writing', async () => {
  vi.mocked(docstore.findDocumentByHash).mockResolvedValue({ _id: 'doc_old', status: 'indexed' } as never);
  vi.mocked(docstore.latestJobForDocument).mockResolvedValue({ _id: 'job_old', status: 'succeeded' } as never);

  const result = await registerText('same text', fields, principal, 'req_2');

  expect(result).toMatchObject({ docId: 'doc_old', jobId: 'job_old', status: 'succeeded', sha256: sha('same text') });
  expect(docstore.latestJobForDocument).toHaveBeenCalledWith('doc_old');
  expect(saveBlob).not.toHaveBeenCalled();
  expect(docstore.insertDocument).not.toHaveBeenCalled();
  expect(docstore.insertJob).not.toHaveBeenCalled();
 });

 it.each([
  ['has no job at all', null],
  ['failed', { _id: 'job_old', status: 'failed' }],
 ])('queues a new job for a duplicate whose document %s, so it is never stuck', async (_label, latest) => {
  vi
   .mocked(docstore.findDocumentByHash)
   .mockResolvedValue({ _id: 'doc_old', status: 'failed', uploadedBy: 'u1' } as never);
  vi.mocked(docstore.latestJobForDocument).mockResolvedValue(latest as never);

  const result = await registerText('same text', fields, principal, 'req_2');

  expect(result).toMatchObject({ docId: 'doc_old', jobId: expect.stringMatching(/^job_/), status: 'queued' });
  expect(docstore.insertJob).toHaveBeenCalledWith(
   expect.objectContaining({ _id: result.jobId, docId: 'doc_old', requestId: 'req_2', status: 'queued', attempts: 0 })
  );
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_old', 'queued');
  expect(saveBlob).not.toHaveBeenCalled();
  expect(docstore.insertDocument).not.toHaveBeenCalled();
 });

 it('on a duplicate-key race deletes the orphan blob and returns the winner without queuing a job', async () => {
  vi
   .mocked(docstore.findDocumentByHash)
   .mockResolvedValueOnce(null)
   .mockResolvedValueOnce({ _id: 'doc_winner', status: 'queued' } as never);
  vi.mocked(docstore.latestJobForDocument).mockResolvedValue({ _id: 'job_winner', status: 'running' } as never);
  vi.mocked(docstore.insertDocument).mockRejectedValue(duplicateKey());

  const result = await registerText('raced', fields, principal, 'req_3');

  expect(result).toMatchObject({ docId: 'doc_winner', jobId: 'job_winner', status: 'running' });
  expect(deleteBlobs).toHaveBeenCalledWith(['blob_1']);
  expect(docstore.findDocumentByHash).toHaveBeenCalledTimes(2);
  expect(docstore.insertJob).not.toHaveBeenCalled();
 });

 it('rethrows the duplicate-key error when the winner cannot be found', async () => {
  const err = duplicateKey();
  vi.mocked(docstore.insertDocument).mockRejectedValue(err);

  await expect(registerText('raced', fields, principal, 'req_3')).rejects.toBe(err);
  expect(deleteBlobs).toHaveBeenCalledWith(['blob_1']);
  expect(docstore.insertJob).not.toHaveBeenCalled();
 });

 it('rethrows any other insert error and queues no job', async () => {
  const err = new Error('mongo down');
  vi.mocked(docstore.insertDocument).mockRejectedValue(err);

  await expect(registerText('x', fields, principal, 'req_4')).rejects.toBe(err);
  expect(docstore.insertJob).not.toHaveBeenCalled();
 });

 it('removes the blob it saved when the document insert fails for another reason', async () => {
  vi.mocked(docstore.insertDocument).mockRejectedValue(new Error('mongo down'));

  await expect(registerText('x', fields, principal, 'req_4')).rejects.toThrow('mongo down');
  expect(deleteBlobs).toHaveBeenCalledWith(['blob_1']);
 });

 it('rolls the document and blob back when the job insert fails', async () => {
  vi.mocked(docstore.insertJob).mockRejectedValue(new Error('mongo down'));

  await expect(registerText('x', fields, principal, 'req_5')).rejects.toThrow('mongo down');
  const { _id } = vi.mocked(docstore.insertDocument).mock.calls[0][0];
  expect(docstore.deleteDocumentRecord).toHaveBeenCalledWith(_id);
  expect(deleteBlobs).toHaveBeenCalledWith(['blob_1']);
 });

 it('does not leave a queued document without a job when the job insert fails', async () => {
  const stored: { sha256: string; status: string; _id: string }[] = [];
  vi.mocked(docstore.insertDocument).mockImplementation(async (doc) => {
   stored.push(doc);
   return {} as never;
  });
  vi
   .mocked(docstore.findDocumentByHash)
   .mockImplementation(async (_collection, hash) => (stored.find((d) => d.sha256 === hash) ?? null) as never);
  vi.mocked(docstore.insertJob).mockRejectedValueOnce(new Error('mongo down'));

  await expect(registerText('x', fields, principal, 'req_5')).rejects.toThrow('mongo down');
  const retry = await registerText('x', fields, principal, 'req_6');
  expect(retry.jobId).toMatch(/^job_/);
 });
});

describe('registerFile', () => {
 const inspected = { filename: 'notes.txt', mimeType: MIME.text };

 it('hashes the file, streams it from disk and removes the temp file', async () => {
  const file = await tempFile('upload-1', 'hello file');
  const result = await registerFile(file, inspected, fields, principal, 'req_1');

  expect(result).toMatchObject({
   filename: 'notes.txt',
   mimeType: MIME.text,
   sizeBytes: 10,
   sha256: sha('hello file'),
   status: 'queued',
  });
  expect(saveBlob).toHaveBeenCalledWith({ path: file.path }, 'notes.txt', { docId: result.docId });
  expect(vi.mocked(docstore.insertDocument).mock.calls[0][0]).toMatchObject({ acl: ['user:u1'], blobId: 'blob_1' });
  expect(existsSync(file.path)).toBe(false);
 });

 it('removes the temp file for a duplicate upload', async () => {
  vi.mocked(docstore.findDocumentByHash).mockResolvedValue({ _id: 'doc_old', status: 'indexed' } as never);
  vi.mocked(docstore.latestJobForDocument).mockResolvedValue({ _id: 'job_old', status: 'succeeded' } as never);
  const file = await tempFile('upload-2', 'hello file');

  expect(await registerFile(file, inspected, fields, principal, 'req_1')).toMatchObject({ docId: 'doc_old' });
  expect(saveBlob).not.toHaveBeenCalled();
  expect(existsSync(file.path)).toBe(false);
 });

 it('removes the temp file when registration fails', async () => {
  vi.mocked(saveBlob).mockRejectedValue(new Error('gridfs down'));
  const file = await tempFile('upload-3', 'hello file');

  await expect(registerFile(file, inspected, fields, principal, 'req_1')).rejects.toThrow('gridfs down');
  expect(docstore.insertDocument).not.toHaveBeenCalled();
  expect(existsSync(file.path)).toBe(false);
 });

 it('rejects when the temp file is already gone, without masking the error', async () => {
  const file = { path: path.join(dir, 'missing'), originalname: 'notes.txt', size: 1 };
  await expect(registerFile(file, inspected, fields, principal, 'req_1')).rejects.toMatchObject({ code: 'ENOENT' });
 });
});

describe('inspectFile', () => {
 it('strips any directory from the client filename and sniffs the type from the bytes', async () => {
  const file = { ...(await tempFile('upload-4', '%PDF-1.7 body')), originalname: '../../etc/report.txt' };
  expect(await inspectFile(file)).toEqual({ filename: 'report.txt', mimeType: MIME.pdf });
 });

 it('rejects a type outside the allow-list with a 415 HttpError', async () => {
  const file = { ...(await tempFile('upload-5', 'MZ\u0000\u0003')), originalname: 'tool.exe' };
  const err = await inspectFile(file).catch((e) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect(err).toMatchObject({ statusCode: 415, code: 'unsupported_file_type' });
 });
});
