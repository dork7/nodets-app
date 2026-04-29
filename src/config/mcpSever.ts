import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const USERS_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../mcp-users.json');

function readUsers(): Record<string, unknown>[] {
 if (!fs.existsSync(USERS_FILE)) return [];
 return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function writeUsers(users: Record<string, unknown>[]) {
 fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
 
const server = new McpServer({
 name: 'mcp-server',
 version: '1.0.0',
});

server.registerTool('ping', { description: 'Health check that returns pong' }, async () => ({
 content: [{ type: 'text', text: 'pong' }],
}));

server.registerTool('getTime', { description: 'Returns the current server time' }, async () => ({
 content: [{ type: 'text', text: new Date().toISOString() }],
}));

const userInputShape = {
 name: z.string(),
 email: z.string(),
 age: z.number(),
};

server.registerTool(
 'create-user',
 {
  description: 'Create a new user and save to file',
  inputSchema: userInputShape as any,
 },
 async (args: any) => {
  const { name, email, age } = args as { name: string; email: string; age: number };
  const users = readUsers();
  const id = `user_${Date.now()}`;
  const newUser = { id, name, email, age, createdAt: new Date().toISOString() };
  users.push(newUser);
  writeUsers(users);
  return { content: [{ type: 'text' as const, text: JSON.stringify(newUser) }] };
 }
);

server.registerResource(
 'users',
 'users://all',
 {
  description: 'Returns all users',
  mimeType: 'application/json',
 },
 async () => ({
  contents: [{ uri: 'users://all', text: JSON.stringify(readUsers()), mimeType: 'application/json' }],
 })
);

server.registerResource(
 'user-details',
 new ResourceTemplate('users://{id}', { list: undefined }) as any,
 {
  description: 'Returns the details of a user',
  mimeType: 'application/json',
 },
 async (uri, args: any) => ({
  contents: [{ uri: uri.toString(), text: JSON.stringify(readUsers().find((user: any) => user.id === args.id)), mimeType: 'application/json' }],
 })
);

export default async function startMcpServer() {
 const transport = new StdioServerTransport();
 await server.connect(transport);
};


