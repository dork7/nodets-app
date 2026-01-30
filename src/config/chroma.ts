import { ChromaClient } from 'chromadb';
import { DefaultEmbeddingFunction } from '@chroma-core/default-embed';

import { logger } from '@/server';

const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

// Parse URL to get host and port
const parseChromaUrl = (url: string) => {
 const urlObj = new URL(url);
 return {
  host: urlObj.hostname,
  port: urlObj.port ? parseInt(urlObj.port, 10) : 8000,
 };
};

let chromaClient: ChromaClient | null = null;

/**
 * Get or create ChromaDB client instance
 */
export const getChromaClient = (): ChromaClient => {
 if (!chromaClient) {
  try {
   const { host, port } = parseChromaUrl(CHROMA_URL);
   chromaClient = new ChromaClient({ host, port });
   logger.info(`✅ ChromaDB client initialized: ${host}:${port}`);
  } catch (error) {
   logger.error(`❌ Failed to initialize ChromaDB client: ${(error as Error).message}`);
   throw error;
  }
 }
 return chromaClient;
};

/**
 * Test ChromaDB connection
 */
export const testChromaConnection = async (): Promise<boolean> => {
 try {
  const client = getChromaClient();
  await client.heartbeat();
  logger.info('✅ ChromaDB connection successful');
  return true;
 } catch (error) {
  logger.error(`❌ ChromaDB connection failed: ${(error as Error).message}`);
  return false;
 }
};

/**
 * Get or create a collection with default embedding function
 */
export const getOrCreateCollection = async (name: string, useEmbeddings: boolean = true) => {
 try {
  const client = getChromaClient();
  const existing = await client.listCollections();
  const found = existing.find((c) => c.name === name);

  if (found) {
   logger.info(`📚 Using existing collection: ${name}`);
   try {
    // Try to get collection with embedding function if needed
    if (useEmbeddings) {
     const collection = await client.getCollection({
      name,
      embeddingFunction: new DefaultEmbeddingFunction(),
     });
     return collection;
    }
    return await client.getCollection({ name });
   } catch (error) {
    // If collection exists but doesn't support embeddings, we might need to recreate it
    // For now, log a warning and try without embedding function
    logger.warn(
     `Collection ${name} may not have embedding function. If you get errors, delete and recreate the collection.`
    );
    if (useEmbeddings) {
     // Try to delete and recreate with embeddings
     logger.info(`Attempting to recreate collection ${name} with embedding function...`);
     try {
      await client.deleteCollection({ name });
      const collection = await client.createCollection({
       name,
       embeddingFunction: new DefaultEmbeddingFunction(),
      });
      logger.info(`✅ Recreated collection ${name} with default embeddings`);
      return collection;
     } catch (recreateError) {
      logger.error(`Failed to recreate collection: ${(recreateError as Error).message}`);
      throw error; // Throw original error
     }
    }
    return await client.getCollection({ name });
   }
  }

  // Create collection with default embedding function if enabled
  const collection = useEmbeddings
   ? await client.createCollection({
      name,
      embeddingFunction: new DefaultEmbeddingFunction(),
     })
   : await client.createCollection({ name });

  logger.info(`✅ Created new collection: ${name}${useEmbeddings ? ' with default embeddings' : ''}`);
  return collection;
 } catch (error) {
  logger.error(`❌ Error getting/creating collection: ${(error as Error).message}`);
  throw error;
 }
};

/**
 * Delete a ChromaDB collection
 */
export const deleteCollection = async (name: string): Promise<boolean> => {
 try {
  const client = getChromaClient();
  const existing = await client.listCollections();
  const found = existing.find((c) => c.name === name);

  if (!found) {
   logger.warn(`Collection ${name} does not exist`);
   return false;
  }

  await client.deleteCollection({ name });
  logger.info(`✅ Deleted collection: ${name}`);
  return true;
 } catch (error) {
  logger.error(`❌ Error deleting collection: ${(error as Error).message}`);
  throw error;
 }
};
