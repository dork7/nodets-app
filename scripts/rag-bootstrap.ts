import mongoose from 'mongoose';

import connectDB from '@/config/mongoose';
import { bootstrapRag } from '@/rag/bootstrap';
import { config } from '@/rag/config';

// One-off setup for the LangChain RAG pipeline: `npm run rag:bootstrap`.
(async () => {
 await connectDB();
 await bootstrapRag();
 console.log(
  `RAG bootstrap complete: Qdrant collection "${config.qdrantCollection}" and MongoDB rag_* indexes are in place.`
 );
 await mongoose.disconnect();
 process.exit(0);
})().catch((err) => {
 console.error('RAG bootstrap failed:', err);
 process.exit(1);
});
