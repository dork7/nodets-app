import { logger } from '@/server';

import * as getTimeHandler from './handlers/getTime';
import * as getUsersHandler from './handlers/getUsers';
import * as openaiHandler from './handlers/openai';
import * as pingHandler from './handlers/ping';
import * as streamHandler from './handlers/stream';
import { getMethod, listMethods, registerMethod } from './registry';

type HandlerModule = {
 name?: string;
 handler?: (...args: any[]) => unknown;
};

// Statically imported (rather than scanned off disk at runtime) because tsup
// bundles each entry with `splitting: false`, which inlines this file's code into
// dist/index.js — at that point `__dirname` resolves to dist/, not dist/ws/server/,
// so a runtime `fs.readdirSync(path.join(__dirname, 'handlers'))` can never find them.
const handlerModules: HandlerModule[] = [pingHandler, getTimeHandler, getUsersHandler, streamHandler, openaiHandler];

export async function loadHandlers() {
 for (const module of handlerModules) {
  const { name, handler } = module;

  if (!name || typeof handler !== 'function') {
   throw new Error(`Invalid server handler module: ${JSON.stringify(module)}`);
  }

  registerMethod(name, handler);
 }

 logger.info(`✅ Available server methods:  ${listMethods()}`);
}

export { getMethod, listMethods };
