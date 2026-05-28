import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { logger } from '@/server';

import { getMethod, listMethods, registerMethod } from './registry';

const handlersDir = path.join(__dirname, 'handlers');

type HandlerModule = {
 name?: string;
 handler?: (...args: any[]) => unknown;
 default?: {
  name?: string;
  handler?: (...args: any[]) => unknown;
 };
};

const handlerExtensions = new Set(['.ts', '.js', '.mjs', '.cjs']);

const isHandlerFile = (file: string) => {
 return handlerExtensions.has(path.extname(file)) && !file.endsWith('.d.ts');
};

const getHandlerExports = (module: HandlerModule) => {
 return module.name && module.handler ? module : module.default || {};
};

// Dynamically import all handler files in handlers/
export async function loadHandlers() {
 const files = fs.readdirSync(handlersDir).filter(isHandlerFile);

 for (const file of files) {
  const modulePath = path.join(handlersDir, file);
  const module = (await import(pathToFileURL(modulePath).href)) as HandlerModule;
  const { name, handler } = getHandlerExports(module);

  if (!name || typeof handler !== 'function') {
   throw new Error(`Invalid MCP handler module: ${modulePath}`);
  }

  registerMethod(name, handler);
  logger.info(`🔌 Registered MCP method: ${name}`);
 }

 logger.info(`✅ Available MCP methods:  ${listMethods()}`);
}

export { getMethod, listMethods };
