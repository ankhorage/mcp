import type {
  McpApprovalVerifier,
  McpAuditSink,
  McpIntegration,
  McpInvocationContext,
  McpTransactionalApprovalConsumer,
} from '../../../types/public.js';
import { createMcpRegistry } from '../../registry/application/createMcpRegistry.js';
import { createMcpStdioServerAsync as createMcpStdioServerAdapterAsync } from '../adapters/inbound/createMcpStdioServerAsync.js';

export interface CreateMcpStdioServerOptions {
  readonly approvalVerifier?: McpApprovalVerifier;
  readonly auditSink?: McpAuditSink;
  readonly context: McpInvocationContext;
  readonly integrations: readonly McpIntegration[];
  readonly transactionalApprovalConsumers?: readonly McpTransactionalApprovalConsumer[];
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
      ...(options.approvalVerifier === undefined
        ? {}
        : { approvalVerifier: options.approvalVerifier }),
      ...(options.auditSink === undefined ? {} : { auditSink: options.auditSink }),
      ...(options.transactionalApprovalConsumers === undefined
        ? {}
        : { transactionalApprovalConsumers: options.transactionalApprovalConsumers }),
    }),
    version: options.version,
  });
}
