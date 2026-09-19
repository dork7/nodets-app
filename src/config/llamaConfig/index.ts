import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai';
import { Settings } from 'llamaindex';

import { env } from '@/common/utils/envConfig';

const openRouterConfig = {
 apiKey: env.OPENROUTER_API_KEY,
 baseURL: env.OPENROUTER_BASE_URL,
};

Settings.llm = new OpenAI({
 ...openRouterConfig,
 model: 'meta-llama/llama-3.1-8b-instruct',
});

// Exported directly (in addition to being set on `Settings`) because `llamaindex`
// and `@llamaindex/qdrant` resolve to different installed copies of `@llamaindex/core`,
// so code reading `Settings.embedModel` via the other copy would see it as unset.
export const embedModel = new OpenAIEmbedding({
 ...openRouterConfig,
 model: env.OPENROUTER_EMBED_MODEL ?? 'text-embedding-3-small',
});

Settings.embedModel = embedModel;

export { Settings };
