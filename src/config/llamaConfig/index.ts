import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai'
import { Settings } from 'llamaindex'
import { env } from '@/common/utils/envConfig';

const openRouterConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
}

Settings.llm = new OpenAI({
  ...openRouterConfig,
  model: "meta-llama/llama-3.1-8b-instruct"
});

Settings.embedModel = new OpenAIEmbedding({
  ...openRouterConfig,
  model: env.OPENROUTER_EMBED_MODEL ?? "text-embedding-3-small",
});

export { Settings };