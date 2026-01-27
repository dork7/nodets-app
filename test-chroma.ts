import { ChromaClient } from 'chromadb';

const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

// Parse URL to get host and port
const parseChromaUrl = (url: string) => {
 const urlObj = new URL(url);
 return {
  host: urlObj.hostname,
  port: urlObj.port ? parseInt(urlObj.port, 10) : 8000,
 };
};

async function testChromaDB() {
 console.log('🔍 Testing ChromaDB connection...');
 console.log(`📍 ChromaDB URL: ${CHROMA_URL}`);

 try {
  const { host, port } = parseChromaUrl(CHROMA_URL);
  const client = new ChromaClient({ host, port });

  // Test heartbeat
  console.log('\n1️⃣ Testing heartbeat...');
  const heartbeat = await client.heartbeat();
  console.log('✅ Heartbeat successful:', heartbeat);

  // List collections
  console.log('\n2️⃣ Listing collections...');
  const collections = await client.listCollections();
  console.log(`✅ Found ${collections.length} collection(s):`);
  collections.forEach((col) => {
   console.log(`   - ${col.name}`);
  });

  // Create a test collection
  console.log('\n3️⃣ Creating test collection...');
  const testCollectionName = 'test_collection';
  
  // Delete if exists
  try {
   await client.deleteCollection({ name: testCollectionName });
   console.log('   🗑️  Deleted existing test collection');
  } catch {
   // Collection doesn't exist, that's fine
  }

  const collection = await client.createCollection({ name: testCollectionName });
  console.log('✅ Test collection created:', testCollectionName);

  // Add a test document
  console.log('\n4️⃣ Adding test document...');
  await collection.add({
   ids: ['test1'],
   documents: ['This is a test document for ChromaDB'],
   metadatas: [{ source: 'test' }],
  });
  console.log('✅ Test document added');

  // Query the collection
  console.log('\n5️⃣ Querying collection...');
  const results = await collection.query({
   queryTexts: ['test'],
   nResults: 1,
  });
  console.log('✅ Query successful');
  console.log('   Results:', {
   documents: results.documents,
   ids: results.ids,
   metadatas: results.metadatas,
  });

  // Clean up
  console.log('\n6️⃣ Cleaning up...');
  await client.deleteCollection({ name: testCollectionName });
  console.log('✅ Test collection deleted');

  console.log('\n🎉 All tests passed! ChromaDB is working correctly.');
 } catch (error) {
  console.error('\n❌ Error testing ChromaDB:', (error as Error).message);
  console.error('\n💡 Make sure ChromaDB is running:');
  console.error('   docker-compose -f ai-docker-compose.yml up -d chromadb');
  process.exit(1);
 }
}

testChromaDB();
