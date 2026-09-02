import type { Metadata } from 'chromadb';
import { StatusCodes } from 'http-status-codes';

import { minioRepository } from '@/api/minio/minioRepository';
import { chunkDocument } from '@/api/rag/chunker';
import { UnsupportedFileTypeError } from '@/api/rag/extractText';
import { LoadedDocument, loaders } from '@/api/rag/loaders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { embedMany } from '@/openai/embeddings';
import { logger } from '@/server';
import {
 clearCollection,
 countCollection,
 deleteByDocId,
 listCollections,
 queryCollection,
 upsertMany,
} from '@/services/vectorStore';

export type RagSource = 'json' | 'minio' | 'csv' | 'url';

export interface IngestOptions {
 source: RagSource;
 fileId?: string;
 bucket?: string;
 url?: string;
 content?: string;
 provider?: string;
 force?: boolean;
}

const toChunks = (documents: LoadedDocument[]) => {
 const chunks = documents.flatMap((document) =>
  chunkDocument(document.text, document.id, document.source, document.meta)
 );
 return chunks;
};

export const ragService = {
 ingest: async (options: IngestOptions): Promise<ServiceResponse<{ count: number } | null>> => {
  try {
   let documents: LoadedDocument[] = [];

   switch (options.source) {
    case 'json':
     documents = await loaders.json();
     break;
    case 'minio':
     documents = await loaders.minio(options.fileId as string, options.bucket);
     break;
    case 'csv':
     documents = await loaders.csv(options.content ?? '', 'upload');
     break;
    case 'url':
     documents = await loaders.url(options.url as string);
     break;
   }

   if (documents.length === 0) {
    return new ServiceResponse(ResponseStatus.Failed, 'No documents found to ingest', null, StatusCodes.NOT_FOUND);
   }

   const chunks = toChunks(documents);
   const embeddings = await embedMany(
    chunks.map((chunk) => chunk.text),
    { provider: options.provider }
   );

   await upsertMany(
    chunks.map((chunk) => ({ id: chunk.id, text: chunk.text, metadata: chunk.meta as Metadata })),
    embeddings
   );

   if (options.source === 'minio' && options.fileId) {
    if (options.force) {
     await minioRepository.updateAsync(options.fileId, { ingested: false });
    }
    await minioRepository.markIngestedAsync(options.fileId);
   }

   logger.info(`RAG ingest complete: ${chunks.length} chunks from ${documents.length} documents`);

   return new ServiceResponse<{ count: number }>(
    ResponseStatus.Success,
    'Ingested successfully',
    { count: chunks.length },
    StatusCodes.CREATED
   );
  } catch (ex) {
   if (ex instanceof UnsupportedFileTypeError) {
    logger.warn(ex.message);
    return new ServiceResponse(ResponseStatus.Failed, ex.message, null, StatusCodes.UNSUPPORTED_MEDIA_TYPE);
   }
   const errorMessage = `Failed to ingest: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 search: async (
  query: string,
  topK = 3
 ): Promise<ServiceResponse<{ results: { id: string; text: string; score: number }[] } | null>> => {
  try {
   const [embedding] = await embedMany([query]);
   const matches = await queryCollection(embedding, topK);

   const results = matches.map((match) => ({
    id: match.id,
    text: match.text,
    score: match.score,
   }));

   return new ServiceResponse<{ results: typeof results }>(
    ResponseStatus.Success,
    'Search completed',
    { results },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to search: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 /**
  * Remove a single document's chunks from the vector store. For a MinIO-backed file
  * (`docId` === the MinIO file id) the `ingested` flag is also flipped back so the UI
  * reflects that it is no longer in the knowledge base.
  */
 deleteFile: async (docId: string): Promise<ServiceResponse<{ removed: number } | null>> => {
  try {
   const removed = await deleteByDocId(docId);
   await minioRepository.updateAsync(docId, { ingested: false });
   logger.info(`RAG: removed ${removed} chunk(s) from the vector store for docId ${docId}`);
   return new ServiceResponse<{ removed: number }>(
    ResponseStatus.Success,
    `Removed ${removed} chunk(s) from the vector store`,
    { removed },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to remove document from vector store: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 clear: async (): Promise<ServiceResponse<boolean | null>> => {
  try {
   await clearCollection();
   await minioRepository.resetIngestedFlagsAsync();
   return new ServiceResponse<boolean>(ResponseStatus.Success, 'Collection cleared', true, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Failed to clear collection: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

stats: async (): Promise<ServiceResponse<{ count: number; collections: string[] } | null>> => {
   try {
    const [count, collections] = await Promise.all([countCollection(), listCollections()]);
    return new ServiceResponse<{ count: number; collections: string[] }>(
     ResponseStatus.Success,
     'Stats retrieved',
     { count, collections },
     StatusCodes.OK
    );
   } catch (ex) {
    const errorMessage = `Failed to get stats: ${(ex as Error).message}`;
    logger.error(errorMessage);
    return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
   }
  },

  storeText: async (text: string, provider?: string): Promise<ServiceResponse<{ id: string } | null>> => {
   try {
    const [embedding] = await embedMany([text], { provider });
    const id = `test_${Date.now()}`;
    await upsertMany(
     [{ id, text, metadata: { source: 'test', provider } as any }],
     [embedding]
    );
    return new ServiceResponse<{ id: string }>(
     ResponseStatus.Success,
     'Text stored successfully',
     { id },
     StatusCodes.CREATED
    );
   } catch (ex) {
    const errorMessage = `Failed to store text: ${(ex as Error).message}`;
    logger.error(errorMessage);
    return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
   }
  },
};
