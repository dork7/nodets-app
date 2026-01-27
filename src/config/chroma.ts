import { ChromaClient } from 'chromadb';

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
 * Get or create a collection
 */
export const getOrCreateCollection = async (name: string) => {
 try {
  const client = getChromaClient();
  const existing = await client.listCollections();
  const found = existing.find((c) => c.name === name);

  if (found) {
   logger.info(`📚 Using existing collection: ${name}`);
   return await client.getCollection({ name });
  }

  const collection = await client.createCollection({ name });
  logger.info(`✅ Created new collection: ${name}`);
  return collection;
 } catch (error) {
  logger.error(`❌ Error getting/creating collection: ${(error as Error).message}`);
  throw error;
 }
};
