import { StatusCodes } from 'http-status-codes';
import { Document, Metadata, MetadataMode, VectorStoreIndex } from 'llamaindex';
import { v4 as uuidv4 } from 'uuid';

import { extractText } from '@/api/rag/extractText';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import '@/config/llamaConfig';
import { logger } from '@/server';

export type LlamaIndexIngestResult = { id: string; filename: string; type: string };

export type LlamaIndexQueryResult = { extractedText: string; sources: Metadata[] };

// Lazily built, shared in-memory vector index: the same index instance is reused
// (and grown via `insert`) across requests so ingested files stay queryable
// for the lifetime of the process.
let indexPromise: Promise<VectorStoreIndex> | null = null;

const getIndex = async (): Promise<VectorStoreIndex> => {
 if (!indexPromise) {
  indexPromise = VectorStoreIndex.fromDocuments([]);
 }
 return indexPromise;
};

export const llamaIndexService = {
 ingestFile: async (
  file: Express.Multer.File | undefined,
  type: string
 ): Promise<ServiceResponse<LlamaIndexIngestResult | null>> => {
  try {
   if (!file) {
    return new ServiceResponse(ResponseStatus.Failed, 'No file provided', null, StatusCodes.BAD_REQUEST);
   }

   const text = (await extractText(file.buffer, file.originalname)).trim();
   if (!text) {
    return new ServiceResponse(
     ResponseStatus.Failed,
     `No extractable text found in "${file.originalname}".`,
     null,
     StatusCodes.BAD_REQUEST
    );
   }

   const id = uuidv4();
   const document = new Document({
    id_: id,
    text,
    metadata: { type, filename: file.originalname },
   });

   const index = await getIndex();
   await index.insert(document);

   return new ServiceResponse<LlamaIndexIngestResult>(
    ResponseStatus.Success,
    'File indexed successfully',
    { id, filename: file.originalname, type },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to index file: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 query: async (query: string, topK: number): Promise<ServiceResponse<LlamaIndexQueryResult | null>> => {
  try {
   const index = await getIndex();
   const retriever = index.asRetriever({ similarityTopK: topK });
   const response = await retriever.retrieve(query);

   return new ServiceResponse<LlamaIndexQueryResult>(
    ResponseStatus.Success,
    'Query executed successfully',
    { extractedText: response.map((node) => node.node.getContent(MetadataMode.NONE)).join('\n') ?? '', sources: response.map((node) => node.node.metadata) ?? [] },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to query index: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
