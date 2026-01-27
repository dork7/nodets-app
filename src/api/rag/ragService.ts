import axios from 'axios';
import { StatusCodes } from 'http-status-codes';
import fs from 'fs/promises';
import path from 'path';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';
import { getOrCreateCollection } from '@/config/chroma';
import { callAI } from '@/openai';

interface JsonDocument {
 id: string | number;
 text: string;
 [key: string]: any;
}

interface IngestResponse {
 ingested: number;
 collectionName: string;
}

interface QueryResponse {
 answer: string;
 context: string[];
 sources: string[];
}

const LOCALAI_URL = process.env.LOCALAI_URL || 'http://localhost:8080';
const DEFAULT_COLLECTION_NAME = 'knowledge_base';
const DEFAULT_JSON_FILE = 'data.json';
const USE_CHROMADB_EMBEDDINGS = process.env.USE_CHROMADB_EMBEDDINGS !== 'false'; // Default to true

/**
 * Read and parse JSON file
 */
const readJsonFile = async (filePath: string): Promise<JsonDocument[]> => {
 try {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const fileContent = await fs.readFile(fullPath, 'utf-8');
  const data = JSON.parse(fileContent);

  if (!Array.isArray(data)) {
   throw new Error('JSON file must contain an array of documents');
  }

  return data.map((doc) => ({
   id: doc.id || doc.id?.toString() || `doc_${Date.now()}_${Math.random()}`,
   text: doc.text || doc.content || doc.document || '',
   ...doc,
  }));
 } catch (error) {
  logger.error(`Error reading JSON file: ${(error as Error).message}`);
  throw new Error(`Failed to read JSON file: ${(error as Error).message}`);
 }
};

export const ragService = {
 /**
  * Ingest data from JSON file into ChromaDB
  */
 ingestFromJson: async (
  jsonFilePath: string = DEFAULT_JSON_FILE,
  collectionName: string = DEFAULT_COLLECTION_NAME
 ): Promise<ServiceResponse<IngestResponse>> => {
  try {
   logger.info(`📄 Reading JSON file: ${jsonFilePath}`);

   // Read and parse JSON file
   const documents = await readJsonFile(jsonFilePath);

   if (documents.length === 0) {
    return new ServiceResponse<IngestResponse>(
     ResponseStatus.Failed,
     'JSON file is empty or contains no valid documents',
     null as any,
     StatusCodes.BAD_REQUEST
    );
   }

   logger.info(`📝 Found ${documents.length} documents in JSON file`);

   // Filter out documents without text
   const validDocuments = documents.filter((doc) => doc.text && doc.text.trim().length > 0);

   if (validDocuments.length === 0) {
    return new ServiceResponse<IngestResponse>(
     ResponseStatus.Failed,
     'No documents with valid text found in JSON file',
     null as any,
     StatusCodes.BAD_REQUEST
    );
   }

   // Get or create collection with built-in embeddings
   const collection = await getOrCreateCollection(collectionName, USE_CHROMADB_EMBEDDINGS);

   // Process documents in batches
   const batchSize = 10; // Can process more at once since ChromaDB handles embeddings
   let processedCount = 0;

   for (let i = 0; i < validDocuments.length; i += batchSize) {
    const batch = validDocuments.slice(i, i + batchSize);

    // Prepare metadata (exclude id and text from metadata)
    // ChromaDB only accepts string, number, boolean, or null in metadata
    const metadatas = batch.map((doc) => {
     const { id, text, ...metadata } = doc;
     const cleanMetadata: Record<string, string | number | boolean | null> = {
      source: 'json_file',
      fileName: jsonFilePath,
     };

     // Convert metadata values to ChromaDB-compatible types
     for (const [key, value] of Object.entries(metadata)) {
      if (value === null || value === undefined) {
       cleanMetadata[key] = null;
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
       cleanMetadata[key] = value;
      } else if (Array.isArray(value)) {
       // Convert arrays to comma-separated strings
       cleanMetadata[key] = value.map(String).join(', ');
      } else if (typeof value === 'object') {
       // Convert objects to JSON strings
       cleanMetadata[key] = JSON.stringify(value);
      } else {
       // Convert anything else to string
       cleanMetadata[key] = String(value);
      }
     }

     return cleanMetadata;
    });

    // Add to ChromaDB - embeddings are generated automatically by ChromaDB
    await collection.add({
     ids: batch.map((doc) => String(doc.id)),
     documents: batch.map((doc) => doc.text),
     metadatas,
    });

    processedCount += batch.length;
    logger.info(`✅ Processed ${processedCount}/${validDocuments.length} documents`);
   }

   return new ServiceResponse<IngestResponse>(
    ResponseStatus.Success,
    `Successfully ingested ${processedCount} documents from JSON file`,
    {
     ingested: processedCount,
     collectionName,
    },
    StatusCodes.OK
   );
  } catch (error) {
   const errorMessage = `Error ingesting JSON file: ${(error as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse<IngestResponse>(
    ResponseStatus.Failed,
    errorMessage,
    null as any,
    StatusCodes.INTERNAL_SERVER_ERROR
   );
  }
 },

 /**
  * Query the dataset
  */
 queryDataset: async (
  question: string,
  collectionName: string = DEFAULT_COLLECTION_NAME,
  topK: number = 3,
  aiModel?: string
 ): Promise<ServiceResponse<QueryResponse>> => {
  try {
   if (!question || question.trim().length === 0) {
    return new ServiceResponse<QueryResponse>(
     ResponseStatus.Failed,
     'Question is required',
     null as any,
     StatusCodes.BAD_REQUEST
    );
   }

   const collection = await getOrCreateCollection(collectionName, USE_CHROMADB_EMBEDDINGS);

   // Query similar documents - ChromaDB generates embedding for the query automatically
   const results = await collection.query({
    queryTexts: [question], // Use queryTexts instead of queryEmbeddings
    nResults: topK,
   });

   if (!results.documents || results.documents[0].length === 0) {
    return new ServiceResponse<QueryResponse>(
     ResponseStatus.Success,
     'No relevant context found in dataset',
     {
      answer: 'I could not find relevant information in the dataset to answer your question.',
      context: [],
      sources: [],
     },
     StatusCodes.OK
    );
   }

   const context = results.documents[0].filter((doc): doc is string => doc !== null).join('\n\n');
   const sources = (results.ids[0] || []).filter((id): id is string => id !== null);

   // Generate answer using AI
   const systemPrompt =
    'You are a rude doctor. Answer the question based ONLY on the provided context also share the treatment plan. If there is no data in context say the requested item or information is not available.';
   const userPrompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

   const modelToUse = aiModel || env.AI_MODELS?.split(',')[0] || 'ai/gemma3';

   let answer: string;
   try {
     const response = await callAI(
      [
       { role: 'system', content: systemPrompt },
       { role: 'user', content: userPrompt },
      ] as any,
      false,
      modelToUse
     );
     answer = (response as any).choices[0].message.content;
    // }
   } catch (error) {
    logger.error(`AI completion failed: ${(error as Error).message}`);
    answer = `I found relevant context but encountered an error generating the answer: ${(error as Error).message}`;
   }

   return new ServiceResponse<QueryResponse>(
    ResponseStatus.Success,
    'Query processed successfully',
    {
     answer,
     context: results.documents[0].filter((doc): doc is string => doc !== null),
     sources,
    },
    StatusCodes.OK
   );
  } catch (error) {
   const errorMessage = `Error querying dataset: ${(error as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse<QueryResponse>(
    ResponseStatus.Failed,
    errorMessage,
    null as any,
    StatusCodes.INTERNAL_SERVER_ERROR
   );
  }
 },

 /**
  * Get collection statistics
  */
 getCollectionStats: async (
  collectionName: string = DEFAULT_COLLECTION_NAME
 ): Promise<ServiceResponse<{ count: number; name: string }>> => {
  try {
   const collection = await getOrCreateCollection(collectionName);
   const count = await collection.count();

   return new ServiceResponse(
    ResponseStatus.Success,
    'Collection stats retrieved successfully',
    { count, name: collectionName },
    StatusCodes.OK
   );
  } catch (error) {
   const errorMessage = `Error getting collection stats: ${(error as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse<{ count: number; name: string }>(
    ResponseStatus.Failed,
    errorMessage,
    null as any,
    StatusCodes.INTERNAL_SERVER_ERROR
   );
  }
 },
};
