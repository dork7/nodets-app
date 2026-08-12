import { exec } from 'child_process';
import { promisify } from 'util';

import { logger } from '@/server';

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
// A "tool" is a function the model can decide to call. Each one has:
//  - a JSON Schema describing its arguments (so the model knows what to ask for)
//  - a real implementation (what actually runs on your machine)
interface ChatTool {
 name: string;
 description: string;
 parameters: Record<string, unknown>;
 execute: (args: Record<string, unknown>) => Promise<string>;
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

// ===== Registry =====
export const CHAT_TOOLS: ChatTool[] = [runBashTool];

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
export const executeToolCalls = async (toolCalls: ToolCallRequest[]): Promise<ToolCallResult[]> =>
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
    const output = await tool.execute(args);
    logger.info(`[tool] ${call.name} -> ${output.slice(0, 200)}${output.length > 200 ? '...' : ''}`);
    return { id: call.id, name: call.name, output };
   } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[tool] ${call.name} threw: ${message}`);
    return { id: call.id, name: call.name, output: `Tool error: ${message}` };
   }
  })
 );
