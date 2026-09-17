import { exec } from 'child_process';
import { promisify } from 'util';

import { logger } from '@/server';
import { driveService } from '@/services/google/driveService';

const execAsync = promisify(exec);

// ===== Tool Types =====
export type OpenAITool = {
 type: 'function';
 function: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
 };
};

// Who's asking - resolved once per WS connection from the session cookie (see
// ws/server/index.ts) and threaded down through executeToolCalls. null for a
// guest/unauthenticated session; tools that need a real user (Drive) check this
// themselves rather than being hidden from the model, keeping toOpenAITools() simple.
export interface ToolExecutionContext {
 userId: string | null;
}

// A "tool" is a function the model can decide to call. Each one has:
//  - a JSON Schema describing its arguments (so the model knows what to ask for)
//  - a real implementation (what actually runs on your machine)
interface ChatTool {
 name: string;
 description: string;
 parameters: Record<string, unknown>;
 execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<string>;
}

export interface ToolCallRequest {
 id: string;
 name: string;
 arguments: string;
}

export interface ToolCallResult {
 id: string;
 name: string;
 output: string;
}

// ===== Guard rails =====
const TOOL_TIMEOUT_MS = 30_000; // kill runaway commands
const MAX_OUTPUT_CHARS = 8000; // don't blow the context window

// ===== The tools =====

const runBashTool: ChatTool = {
 name: 'run_bash',
 description:
  'Execute a shell command on the host and return its stdout/stderr. ' +
  'Use for file operations, running programs, checking the system, or any computation. ' +
  'Output is truncated to a safe size. Prefer read-only commands.',
 parameters: {
  type: 'object',
  properties: {
   command: { type: 'string', description: 'The shell command to run, e.g. "ls -la"' },
  },
  required: ['command'],
  additionalProperties: false,
 },
 async execute(args) {
  const command = typeof args.command === 'string' ? args.command : '';
  if (!command) {
   return 'Error: no command provided.';
  }

  try {
   const { stdout, stderr } = await execAsync(command, { timeout: TOOL_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
   const output = [stdout, stderr ? `[stderr]\n${stderr}` : ''].filter(Boolean).join('\n').trim();
   return output.length > MAX_OUTPUT_CHARS
    ? output.slice(0, MAX_OUTPUT_CHARS) + '\n... (truncated)'
    : output || '(no output)';
  } catch (error) {
   const message = error instanceof Error ? `${error.message}\n${String(error.stack ?? '')}` : String(error);
   return `Command failed:\n${message.slice(0, MAX_OUTPUT_CHARS)}`;
  }
 },
};

// ===== Google Drive tools =====
// Offered to every session regardless of sign-in state (simpler than threading a
// per-session tool list through callAI/toOpenAITools) - each one just returns a
// clear "not connected" message immediately when context.userId is unset or the
// user hasn't connected Drive, instead of throwing.
const listDriveFilesTool: ChatTool = {
 name: 'list_drive_files',
 description: "List the signed-in user's most recently modified Google Drive files.",
 parameters: {
  type: 'object',
  properties: {
   pageSize: { type: 'number', description: 'Max files to return (default 20).' },
  },
  additionalProperties: false,
 },
 async execute(args, context) {
  const pageSize = typeof args.pageSize === 'number' ? args.pageSize : undefined;
  return driveService.listFiles(context.userId, pageSize);
 },
};

const searchDriveFilesTool: ChatTool = {
 name: 'search_drive_files',
 description: "Search the signed-in user's Google Drive by file name or content.",
 parameters: {
  type: 'object',
  properties: {
   query: { type: 'string', description: 'Text to search for in file names/content.' },
  },
  required: ['query'],
  additionalProperties: false,
 },
 async execute(args, context) {
  const query = typeof args.query === 'string' ? args.query : '';
  if (!query) return 'Error: no query provided.';
  return driveService.searchFiles(context.userId, query);
 },
};

const readDriveFileTool: ChatTool = {
 name: 'read_drive_file',
 description:
  'Read the text content of a Google Drive file by its file ID (from list_drive_files/search_drive_files). ' +
  'Works for Google Docs/Sheets/Slides as well as uploaded PDFs, Word docs, and plain text files.',
 parameters: {
  type: 'object',
  properties: {
   fileId: { type: 'string', description: 'The Google Drive file ID.' },
  },
  required: ['fileId'],
  additionalProperties: false,
 },
 async execute(args, context) {
  const fileId = typeof args.fileId === 'string' ? args.fileId : '';
  if (!fileId) return 'Error: no fileId provided.';
  return driveService.readFileContent(context.userId, fileId);
 },
};

const createDriveFileTool: ChatTool = {
 name: 'create_drive_file',
 description: "Create a new file in the signed-in user's Google Drive with the given text content.",
 parameters: {
  type: 'object',
  properties: {
   name: { type: 'string', description: 'File name, e.g. "notes.txt".' },
   content: { type: 'string', description: 'Text content to write into the file.' },
   mimeType: { type: 'string', description: 'Optional MIME type, defaults to text/plain.' },
  },
  required: ['name', 'content'],
  additionalProperties: false,
 },
 async execute(args, context) {
  const name = typeof args.name === 'string' ? args.name : '';
  const content = typeof args.content === 'string' ? args.content : '';
  const mimeType = typeof args.mimeType === 'string' ? args.mimeType : undefined;
  if (!name) return 'Error: no name provided.';
  return driveService.createFile(context.userId, name, content, mimeType);
 },
};

const updateDriveFileTool: ChatTool = {
 name: 'update_drive_file',
 description: 'Update an existing Google Drive file (rename and/or replace its text content) by file ID.',
 parameters: {
  type: 'object',
  properties: {
   fileId: { type: 'string', description: 'The Google Drive file ID to update.' },
   name: { type: 'string', description: 'New file name (optional).' },
   content: { type: 'string', description: 'New text content to replace the file with (optional).' },
  },
  required: ['fileId'],
  additionalProperties: false,
 },
 async execute(args, context) {
  const fileId = typeof args.fileId === 'string' ? args.fileId : '';
  if (!fileId) return 'Error: no fileId provided.';
  return driveService.updateFile(context.userId, fileId, {
   name: typeof args.name === 'string' ? args.name : undefined,
   content: typeof args.content === 'string' ? args.content : undefined,
  });
 },
};

const deleteDriveFileTool: ChatTool = {
 name: 'delete_drive_file',
 description: 'Move a Google Drive file to Trash by file ID (recoverable, not a permanent delete).',
 parameters: {
  type: 'object',
  properties: {
   fileId: { type: 'string', description: 'The Google Drive file ID to trash.' },
  },
  required: ['fileId'],
  additionalProperties: false,
 },
 async execute(args, context) {
  const fileId = typeof args.fileId === 'string' ? args.fileId : '';
  if (!fileId) return 'Error: no fileId provided.';
  return driveService.deleteFile(context.userId, fileId);
 },
};

// ===== Registry =====
export const CHAT_TOOLS: ChatTool[] = [
 runBashTool,
 listDriveFilesTool,
 searchDriveFilesTool,
 readDriveFileTool,
 createDriveFileTool,
 updateDriveFileTool,
 deleteDriveFileTool,
];

const toolMap = new Map(CHAT_TOOLS.map((tool) => [tool.name, tool]));

// OpenAI expects `tools` fragments shaped like this.
export const toOpenAITools = (): OpenAITool[] =>
 CHAT_TOOLS.map((tool) => ({
  type: 'function',
  function: {
   name: tool.name,
   description: tool.description,
   parameters: tool.parameters,
  },
 }));

// Run every tool call the model requested, in parallel.
export const executeToolCalls = async (
 toolCalls: ToolCallRequest[],
 context: ToolExecutionContext = { userId: null }
): Promise<ToolCallResult[]> =>
 Promise.all(
  toolCalls.map(async (call) => {
   const tool = toolMap.get(call.name);
   if (!tool) {
    logger.warn(`[tool] unknown tool requested: ${call.name}`);
    return { id: call.id, name: call.name, output: `Error: unknown tool "${call.name}"` };
   }

   let args: Record<string, unknown> = {};
   try {
    args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
   } catch (error) {
    logger.error(`[tool] failed to parse arguments for ${call.name}: ${error}`);
   }

   logger.info(`[tool] ${call.name} <- ${JSON.stringify(args)}`);
   try {
    const output = await tool.execute(args, context);
    logger.info(`[tool] ${call.name} -> ${output.slice(0, 200)}${output.length > 200 ? '...' : ''}`);
    return { id: call.id, name: call.name, output };
   } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[tool] ${call.name} threw: ${message}`);
    return { id: call.id, name: call.name, output: `Tool error: ${message}` };
   }
  })
 );
