import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from '@/server';

import { getMethod, listMethods, registerMethod } from './registry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const handlersDir = path.join(__dirname, 'handlers');

// Dynamically import all JS files in handlers/
export async function loadHandlers() {
 const files = fs.readdirSync(handlersDir).filter((f) => f.endsWith('.ts'));

 for (const file of files) {
  const modulePath = path.join(handlersDir, file);
  const { name, handler } = await import(`file://${modulePath}`);
  registerMethod(name, handler);
  logger.info(`🔌 Registered MCP method: ${name}`);
 }

 logger.info(`✅ Available MCP methods:  ${listMethods()}`);
}

export { getMethod, listMethods };
