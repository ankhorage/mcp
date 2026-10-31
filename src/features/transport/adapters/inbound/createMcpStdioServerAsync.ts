import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { McpInvocationContext } from '../../../../types/public.js';
import type { McpRegistry } from '../../../registry/application/createMcpRegistry.js';

export interface CreateMcpStdioServerOptions {
  readonly context: McpInvocationContext;
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
    tools: listMcpTools(options.registry),
  }));
  server.setRequestHandler(CallToolRequestSchema, (request) => callMcpToolAsync(options, request));
  await server.connect(new StdioServerTransport());
  return {
    closeAsync: async () => {
      await server.close();
      await options.registry.closeAsync();
    },
  };
}

/** Translate internal tool contracts into the discoverable MCP tool surface. */
function listMcpTools(registry: McpRegistry) {
  return registry.listTools().flatMap((registered) =>
    registered.tool.risk === 'read'
      ? [toMcpTool(registered.toolId, registered.tool)]
      : [
          toMcpTool(`${registered.toolId}.prepare`, registered.tool, 'Prepare '),
          {
            description: `Execute an externally approved ${registered.tool.description}`,
            inputSchema: {
              additionalProperties: false,
              properties: { approvalId: { type: 'string' } },
              required: ['approvalId'],
              type: 'object' as const,
            },
            name: `${registered.toolId}.execute`,
            title: `Execute ${registered.tool.title}`,
          },
        ],
  );
}

/** Translate a normal or prepare lifecycle tool into the MCP SDK shape. */
function toMcpTool(
  name: string,
  tool: ReturnType<McpRegistry['listTools']>[number]['tool'],
  prefix = '',
) {
  return {
    description: `${prefix}${tool.description}`,
    inputSchema: tool.inputSchema,
    name,
    title: `${prefix}${tool.title}`,
  };
}

/** Invoke a discovered tool without allowing client input to select an internal write proposal. */
async function callMcpToolAsync(options: CreateMcpStdioServerOptions, request: CallToolRequest) {
  try {
    const output = await invokeMcpToolAsync(
      options,
      request.params.name,
      request.params.arguments ?? {},
    );
    return { content: [{ text: JSON.stringify(output), type: 'text' as const }] };
  } catch (error) {
    return {
      content: [
        {
          text: error instanceof Error ? error.message : 'MCP tool execution failed.',
          type: 'text' as const,
        },
      ],
      isError: true,
    };
  }
}

/** Route protocol suffixes to the registry lifecycle without exposing proposal data to the caller. */
async function invokeMcpToolAsync(
  options: CreateMcpStdioServerOptions,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (name.endsWith('.prepare'))
    return await options.registry.prepareWriteAsync(name.slice(0, -8), input, options.context);
  return await options.registry.executeAsync(
    name.endsWith('.execute') ? name.slice(0, -8) : name,
    input,
    options.context,
  );
}
