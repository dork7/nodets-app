import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai'
import { env } from 'process';

// Point both LLM and embeddings at your LocalAI
export const localLlmIndex = new OpenAI({
  model: env.LOCAL_AI_MODEL, // your model name in LocalAI
  apiKey: 'localai',
  baseURL: 'http://localhost:8080/v1',
})

export const embedModelLlmIndex = new OpenAIEmbedding({
  model: env.LOCAL_AI_EMBEDDING_MODEL, // your embedding model in LocalAI
  apiKey: 'localai',
  baseURL: 'http://localhost:8080/v1',
})

// Point both LLM and embeddings at your LocalAI
export const openRouterLlmIndex = new OpenAI({
  model: env.OPENROUTER_MODEL, // your model name in LocalAI
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
})

export const openRouterEmbedModelLlmIndex = new OpenAIEmbedding({
  model: env.OPENROUTER_EMBEDDING_MODEL, // your embedding model in LocalAI
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
})