import type {
  McpAuditSink,
  McpIntegration,
  McpInvocationContext,
  McpPreparedWriteStore,
} from '../../../types/public.js';
import { createMcpRegistry } from '../../registry/application/createMcpRegistry.js';
import { createMcpStdioServerAsync as createMcpStdioServerAdapterAsync } from '../adapters/inbound/createMcpStdioServerAsync.js';

export interface CreateMcpStdioServerOptions {
  readonly auditSink?: McpAuditSink;
  readonly context: McpInvocationContext;
  readonly integrations: readonly McpIntegration[];
  readonly preparedWriteStore?: McpPreparedWriteStore;
  readonly version: string;
}

/*** Compose the central registry with the STDIO delivery adapter. */
export async function createMcpStdioServerAsync(
  options: CreateMcpStdioServerOptions,
): Promise<{ closeAsync(): Promise<void> }> {
  return await createMcpStdioServerAdapterAsync({
    context: options.context,
    registry: createMcpRegistry({
      integrations: options.integrations,
      ...(options.auditSink === undefined ? {} : { auditSink: options.auditSink }),
      ...(options.preparedWriteStore === undefined
        ? {}
        : { preparedWriteStore: options.preparedWriteStore }),
    }),
    version: options.version,
  });
}
