import type { McpAuditSink, McpInvocationContext } from '../../../types/public.js';
import { McpRequestError } from './McpRequestError.js';
import { recordMcpAuditBestEffortAsync } from './recordMcpAuditBestEffortAsync.js';

/** Record a denial before returning a deterministic boundary error. */
export async function denyMcpRequestAsync(input: {
  readonly accountId: string | null;
  readonly auditSink: McpAuditSink | undefined;
  readonly context: McpInvocationContext;
  readonly errorCode: string;
  readonly toolId: string;
}): Promise<never> {
  await recordMcpAuditBestEffortAsync(input.auditSink, {
    accountId: input.accountId,
    actorId: input.context.actorId,
    errorCode: input.errorCode,
    outcome: 'denied',
    risk: 'read',
    toolId: input.toolId,
  });
  throw new McpRequestError(`MCP request denied: ${input.errorCode}`);
}
