import '@/config/llamaConfig';

import fs from 'fs/promises';
import { StatusCodes } from 'http-status-codes';
import { Document, Metadata, MetadataMode, VectorStoreIndex } from 'llamaindex';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { localStorageService } from '@/api/localStorage/localStorageService';
import { extractText } from '@/api/rag/extractText';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { getQdrantVectorStore, resetQdrantVectorStore } from '@/config/qdrantStore';
import { LocalFileModel } from '@/models/localFile.model';
import { logger } from '@/server';

export type LlamaIndexIngestResult = { id: string; filename: string; type: string };

const RAG_STORAGE_DIR = path.join(process.cwd(), 'ragStorage');

class NoExtractableTextError extends Error {}

export type LlamaIndexQueryResult = { extractedText: string; sources: Metadata[] };

// Lazily built vector index backed by Qdrant: the same index instance is reused
// (and grown via `insert`) across requests, with vectors persisted in Qdrant
// so ingested files stay queryable across process restarts.
let indexPromise: Promise<VectorStoreIndex> | null = null;

const getIndex = async (): Promise<VectorStoreIndex> => {
 if (!indexPromise) {
  indexPromise = VectorStoreIndex.fromVectorStore(getQdrantVectorStore());
 }
 return indexPromise;
};

// Qdrant Cloud collections default to strict mode, which rejects filtered
// delete/update requests on payload fields that have no index - so `doc_id`
// (used by `deleteFile`'s filter-by-ref_doc_id) needs an explicit index before
// any delete can succeed. Idempotent, so it's safe to call after every ingest;
// reset after `clear()` recreates the collection, which drops the index too.
let docIdIndexEnsured = false;

const ensureDocIdIndex = async (): Promise<void> => {
 if (docIdIndexEnsured) return;
 try {
  await getQdrantVectorStore().client().createPayloadIndex(env.QDRANT_COLLECTION_NAME, {
   field_name: 'doc_id',
   field_schema: 'keyword',
  });
  docIdIndexEnsured = true;
 } catch (ex) {
  logger.warn(`Failed to ensure doc_id payload index: ${(ex as Error).message}`);
 }
};

// Shared by `ingestFile` (multipart upload) and `ingestFileFromStorage` (by
// fileId): extracts text, saves a copy under ragStorage, indexes it in Qdrant
// under `docId`, and marks the matching LocalFileModel doc as ingested.
const indexBuffer = async (
 docId: string,
 buffer: Buffer,
 filename: string,
 type: string
): Promise<LlamaIndexIngestResult> => {
 const text = (await extractText(buffer, filename)).trim();
 if (!text) {
  throw new NoExtractableTextError(`No extractable text found in "${filename}".`);
 }

 await fs.mkdir(RAG_STORAGE_DIR, { recursive: true });
 await fs.writeFile(path.join(RAG_STORAGE_DIR, `${docId}-${filename}`), buffer);

 const document = new Document({ id_: docId, text, metadata: { type, filename } });

 const index = await getIndex();
 await index.insert(document);
 await ensureDocIdIndex();
 await LocalFileModel.updateOne({ fileId: docId }, { ingested: true });

 return { id: docId, filename, type };
};

const toIngestErrorResponse = (ex: unknown, context: string): ServiceResponse<LlamaIndexIngestResult | null> => {
 if (ex instanceof NoExtractableTextError) {
  return new ServiceResponse(ResponseStatus.Failed, ex.message, null, StatusCodes.BAD_REQUEST);
 }
 const errorMessage = `${context}: ${(ex as Error).message}`;
 logger.error(errorMessage);
 return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
};

export const llamaIndexService = {
 // `id`, when passed, is used as the LlamaIndex document id instead of a fresh
 // uuid - callers ingesting an already-stored file (e.g. by fileId from
 // localStorage) pass that id so `deleteFile`/the `ingested` flag line up with it.
 ingestFile: async (
  file: Express.Multer.File | undefined,
  type: string,
  id?: string
 ): Promise<ServiceResponse<LlamaIndexIngestResult | null>> => {
  if (!file) {
   return new ServiceResponse(ResponseStatus.Failed, 'No file provided', null, StatusCodes.BAD_REQUEST);
  }

  try {
   const docId = id ?? uuidv4();
   const result = await indexBuffer(docId, file.buffer, file.originalname, type);
   return new ServiceResponse<LlamaIndexIngestResult>(
    ResponseStatus.Success,
    'File indexed successfully',
    result,
    StatusCodes.OK
   );
  } catch (ex) {
   return toIngestErrorResponse(ex, 'Failed to index file');
  }
 },

 // Fetches the file straight from local storage (no upload needed) and indexes
 // it under the same id, so it's the same document `deleteFile` can remove later.
 ingestFileFromStorage: async (
  fileId: string,
  type: string
 ): Promise<ServiceResponse<LlamaIndexIngestResult | null>> => {
  const file = await localStorageService.getFileBuffer(fileId);
  if (!file) {
   return new ServiceResponse(
    ResponseStatus.Failed,
    `File ${fileId} not found in local storage`,
    null,
    StatusCodes.NOT_FOUND
   );
  }

  const filename = file.reference.name.startsWith(`${fileId}-`)
   ? file.reference.name.slice(fileId.length + 1)
   : file.reference.name;

  try {
   const result = await indexBuffer(fileId, file.buffer, filename, type);
   return new ServiceResponse<LlamaIndexIngestResult>(
    ResponseStatus.Success,
    'File indexed successfully',
    result,
    StatusCodes.OK
   );
  } catch (ex) {
   return toIngestErrorResponse(ex, 'Failed to index file');
  }
 },

 // Asks the LLM to synthesize an answer from the retrieved chunks, instead of
 // just returning their raw concatenated text (see `extract` for that).
 query: async (query: string, topK: number): Promise<ServiceResponse<LlamaIndexQueryResult | null>> => {
  try {
   const index = await getIndex();
   const queryEngine = index.asQueryEngine({ retriever: index.asRetriever({ similarityTopK: topK }) });
   const response = await queryEngine.query({ query });

   return new ServiceResponse<LlamaIndexQueryResult>(
    ResponseStatus.Success,
    'Query executed successfully',
    {
     extractedText: response.toString(),
     sources: (response.sourceNodes ?? []).map((node) => node.node.metadata),
    },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to query index: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Raw retrieval: returns the retrieved chunks' concatenated text, with no LLM call.
 extract: async (query: string, topK: number): Promise<ServiceResponse<LlamaIndexQueryResult | null>> => {
  try {
   const index = await getIndex();
   const retriever = index.asRetriever({ similarityTopK: topK });
   const response = await retriever.retrieve(query);

   return new ServiceResponse<LlamaIndexQueryResult>(
    ResponseStatus.Success,
    'Query executed successfully',
    {
     extractedText: response.map((node) => node.node.getContent(MetadataMode.NONE)).join('\n') ?? '',
     sources: response.map((node) => node.node.metadata) ?? [],
    },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to query index: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Removes just this document's vectors (matched by `doc_id` in Qdrant), leaving
 // the rest of the index untouched.
 deleteFile: async (id: string): Promise<ServiceResponse<boolean | null>> => {
  try {
   const index = await getIndex();
   await index.deleteRefDoc(id, false);
   await LocalFileModel.updateOne({ fileId: id }, { ingested: false });

   return new ServiceResponse<boolean>(ResponseStatus.Success, 'Removed from the vector index', true, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Failed to remove document from index: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Wipes the whole Qdrant collection and resets the cached index/client so the
 // next ingest recreates it from scratch.
 clear: async (): Promise<ServiceResponse<boolean | null>> => {
  try {
   try {
    await getQdrantVectorStore().client().deleteCollection(env.QDRANT_COLLECTION_NAME);
   } catch (ex) {
    logger.warn(`Qdrant collection delete skipped: ${(ex as Error).message}`);
   }
   resetQdrantVectorStore();
   indexPromise = null;
   docIdIndexEnsured = false;
   await LocalFileModel.updateMany({ ingested: true }, { ingested: false });

   return new ServiceResponse<boolean>(ResponseStatus.Success, 'Index cleared', true, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Failed to clear index: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
