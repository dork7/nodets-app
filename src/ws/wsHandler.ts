import { handleMCPMessage } from './mcpServer';

export const wsHandler = (params: any, message: any) => {
 // Example handler logic
 switch (params.type) {
  case 'mcp':
   // Handle MCP message
   return handleMCPMessage(message);
  default:
   return { type: 'error', message: 'Unknown message type' };
 }
};
