/*
Steps to run this file:

1. Install dependencies:
   npm install

2. Start ChromaDB and LocalAI:
   docker compose -f ai-docker-compose.yml up -d

3. Make sure the LocalAI model used below is available in ./models:
   mathstral-7b-v0.1-imat

4. Run the file:
   node rag.js

5. Stop the AI services when finished:
   docker compose -f ai-docker-compose.yml down --remove-orphans
*/

import axios from 'axios';
import { ChromaClient } from 'chromadb';
import fs from 'fs';

const chroma = new ChromaClient({ path: 'http://localhost:8000' });
const LOCALAI_URL = 'http://localhost:8080';
const COLLECTION_NAME = 'knowledge_base';

// --- 1. Initialize or create collection ---
async function initCollection() {
 const existing = await chroma.listCollections();
 if (!existing.find((c) => c.name === COLLECTION_NAME)) {
  await chroma.createCollection({ name: COLLECTION_NAME });
  console.log('✅ Created Chroma collection:', COLLECTION_NAME);
 }
 return await chroma.getCollection({ name: COLLECTION_NAME });
}

// --- 2. Generate embedding from LocalAI ---
async function getEmbedding(text) {
 const res = await axios.post(`${LOCALAI_URL}/v1/embeddings`, {
  model: 'mathstral-7b-v0.1-imat',
  input: text,
 });
 return res.data.data[0].embedding;
}

// --- 3. Add documents to Chroma ---
async function addDocuments(collection, docs) {
 for (let i = 0; i < docs.length; i++) {
  const emb = await getEmbedding(docs[i].text);
  await collection.add({
   ids: [String(docs[i].id)],
   embeddings: [emb],
   documents: [docs[i].text],
  });
  console.log('📚 Added:', docs[i].text.slice(0, 40));
 }
}

// --- 4. Query RAG ---
async function askQuestion(question) {
 const collection = await chroma.getCollection({ name: COLLECTION_NAME });
 const qEmbed = await getEmbedding(question);

 const results = await collection.query({
  queryEmbeddings: [qEmbed],
  nResults: 3,
 });

 const context = results.documents[0].join('\n\n');

 const res = await axios.post(`${LOCALAI_URL}/v1/chat/completions`, {
  model: 'mathstral-7b-v0.1-imat',
  messages: [
   { role: 'system', content: 'Answer only based on the provided context.' },
   { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
  ],
 });

 console.log('\n💬 Question:', question);
 console.log('🧠 Context:\n', context);
 console.log('🤖 Answer:\n', res.data.choices[0].message.content);
}

// --- 5. Main Workflow ---
(async () => {
 const collection = await initCollection();

 // Load dataset from file
 const docs = JSON.parse(fs.readFileSync('./data.json', 'utf-8'));
 await addDocuments(collection, docs);

 // Ask question
 await askQuestion('How long does delivery to Abu Dhabi take?');
})();
