import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { McpToolExecutionContext } from '../../../../types/public.js';
import type { McpRegistry } from '../../../registry/application/createMcpRegistry.js';

export interface CreateMcpStdioServerOptions {
  readonly context: McpToolExecutionContext;
  readonly registry: McpRegistry;
  readonly version: string;
}

/*** Connect registered provider tools to the official MCP STDIO transport. */
export async function createMcpStdioServerAsync(
  options: CreateMcpStdioServerOptions,
): Promise<{ closeAsync(): Promise<void> }> {
  const server = new Server(
    { name: '@ankhorage/mcp', version: options.version },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: options.registry.listTools().map((registered) => ({
      description: registered.tool.description,
      inputSchema: registered.tool.inputSchema,
      name: registered.toolId,
      title: registered.tool.title,
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const output = await options.registry.executeAsync(
        request.params.name,
        request.params.arguments ?? {},
        options.context,
      );
      return { content: [{ text: JSON.stringify(output), type: 'text' }] };
    } catch (error) {
      return {
        content: [
          {
            text: error instanceof Error ? error.message : 'MCP tool execution failed.',
            type: 'text',
          },
        ],
        isError: true,
      };
    }
  });
  await server.connect(new StdioServerTransport());
  return {
    closeAsync: async () => {
      await server.close();
      await options.registry.closeAsync();
    },
  };
}
