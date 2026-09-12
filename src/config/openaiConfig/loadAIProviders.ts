import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { logger } from '@/server';

import { getModel, listModels, registerModel } from './registry';

const modelsDir = path.join(__dirname, 'providers');

type HandlerModule = {
 name?: string;
 handler?: unknown;
 default?: {
  name?: string;
  handler?: unknown;
 };
};

const handlerExtensions = new Set(['.ts', '.js']);

const isProviderFile = (file: string) => {
 return handlerExtensions.has(path.extname(file)) && !file.endsWith('.d.ts');
};

const getHandlerExports = (module: HandlerModule) => {
 return module.name && module.handler ? module : module.default || {};
};

// Dynamically import all model handler files in src/openai/providers
export async function loadAIProviders() {
 const files = fs.readdirSync(modelsDir).filter(isProviderFile);

 for (const file of files) {
  const modulePath = path.join(modelsDir, file);
  const module = (await import(pathToFileURL(modulePath).href)) as HandlerModule;
  const { name, handler } = getHandlerExports(module);

  if (!name || !handler) {
   throw new Error(`Invalid model handler module: ${modulePath}`);
  }

  registerModel(name, handler);
  logger.info(`🔌 Registered model instance: ${name}`);
 }

 logger.info(`✅ Available model instances:  ${listModels()}`);
}

export { getModel, listModels };
