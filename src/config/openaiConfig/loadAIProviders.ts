import { logger } from '@/server';

import * as localAIProvider from './providers/localAI';
import * as ollamaAIProvider from './providers/ollamaAI';
import * as openRouterAIProvider from './providers/openRouterAI';
import { getModel, listModels, registerModel } from './registry';

type ProviderModule = {
 name?: string;
 handler?: unknown;
};

// Statically imported (rather than scanned off disk at runtime) because tsup
// bundles each entry with `splitting: false`, which inlines this file's code into
// dist/index.js — at that point `__dirname` resolves to dist/, not
// dist/config/openaiConfig/, so a runtime `fs.readdirSync(path.join(__dirname,
// 'providers'))` can never find them.
const providerModules: ProviderModule[] = [localAIProvider, openRouterAIProvider, ollamaAIProvider];

export async function loadAIProviders() {
 for (const module of providerModules) {
  const { name, handler } = module;

  if (!name || !handler) {
   throw new Error(`Invalid model handler module: ${JSON.stringify(module)}`);
  }

  registerModel(name, handler);
  logger.info(`🔌 Registered model instance: ${name}`);
 }

 logger.info(`✅ Available model instances:  ${listModels()}`);
}

export { getModel, listModels };
