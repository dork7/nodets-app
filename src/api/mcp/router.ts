import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';

import { handleServiceResponse } from '@/common/utils/httpHandlers';
import { StatusCodes } from 'http-status-codes';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { writeDataInFile } from '@/common/utils/fileUtils';

export const mcpRegistry = new OpenAPIRegistry();

// mcpRegistry.register('mcp', mcpSchema);

export const mcpRouter: Router = (() => {
 const router = express.Router();

 router.get('/health', async (_req: Request, res: Response) => {
  const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'Success', null, StatusCodes.OK);
  handleServiceResponse(serviceResponse, res);
 });

 function createMCPServer() {
  const server = new McpServer(
   {
    name: 'mcp-server',
    version: '1.0.0',
   },
   {
    capabilities: {
     tools: {},
     resources: {},
     prompts: {},
    },
   }
  );

  server.registerTool('ping', { description: 'Health check that returns pong' }, async () => ({
   content: [{ type: 'text', text: 'pong' }],
  }));

  const createPostInput = z.object({
   title: z.string(),
   content: z.string(),
   author: z.string().min(3, 'Author must be at least 3 characters'),
   category: z.enum(['technology', 'science', 'health', 'business', 'entertainment', 'other']),
  });

  const createPostOutput = z.object({
   id: z.string(),

   title: z.string(),
   author: z.string().min(3).describe('The author of the post'),
   category: z
    .enum(['technology', 'science', 'health', 'business', 'entertainment', 'other'])
    .describe('The category of the post'),
   body: z.string().min(10).describe('The body of the post'),
  });

  function validatePostInput(input: z.infer<typeof createPostInput>) {
   if (input.title.trim() === '') {
    return { error: 'Title is required' };
   }
   if (input.content.trim() === '') {
    return { error: 'Content is required' };
   }
   if (input.author.trim() === '') {
    return { error: 'Author is required' };
   }
   const body = input.content.trim();
   if (body.length < 10) {
    return { error: 'Content must be at least 10 characters' };
   }
   return {
    success: true,
    data: {
     id: crypto.randomUUID(),
     title: input.title.trim(),
     author: input.author.trim(),
     category: input.category,
     body,
    },
   };
  }

  server.registerTool(
   'create_post',
   {
    description: 'Create a post (title, content, author, category)',
    // App uses `zod@3`; MCP types cross Zod v3+v4 (`AnySchema`) — bridge with `unknown` (runtime is still fine).
    inputSchema: createPostInput as unknown as AnySchema,
    outputSchema: createPostOutput as unknown as AnySchema,
   },
   async (args: z.infer<typeof createPostInput>) => {
    const validatedInput = validatePostInput(args);
    if (validatedInput.error) {
     throw new Error(validatedInput.error);
    }
    const structured = validatedInput.data;
    writeDataInFile('posts.json', JSON.stringify(structured));
    return {
     content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
     structuredContent: structured,
    };
   }
  );

  server.registerResource('macp_instructions' , "posts://all",{
    title: "MCP usage instructions",
    description: "This is the instructions for the MCP server",
    mimeType: "text/plain",
  }, async () => ({
   contents: [{ uri: 'posts://all', text: `This is the instructions for the MCP server 
    - create_post: This is the tool to create a post
    - get_post: This is the tool to get a post
    - update_post: This is the tool to update a post
    - delete_post: This is the tool to delete a post

    `, mimeType: 'text/plain' }],
  }));

  server.registerPrompt('MCP_prompt', {
    title: "MCP prompt",
    description: "This is the prompt for the MCP server",

  },async() => {
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: 'Create three blog posts using the create_post tool, one related to technology, one related to science, one related to health' },
        },
      ],
    }
  })
  return server;
 }

 /** Streamable HTTP MCP: same path handles GET (SSE) and POST (messages). Do not send a second Express body after this. */
 const handleStreamableMcp = async (req: Request, res: Response): Promise<void> => {
  const server = createMCPServer();
  const transport = new StreamableHTTPServerTransport({
   sessionIdGenerator: undefined,
  });
  try {
   await server.connect(transport);
   const parsedBody = req.method === 'POST' ? req.body : undefined;
 
   await transport.handleRequest(req, res, parsedBody);
  } catch (err: unknown) {
   if (!res.headersSent) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: ResponseStatus.Failed, message: msg });
   }
  }
 };

 router.get('/', handleStreamableMcp);
 router.post('/', handleStreamableMcp);

 return router;
})();
