import type {
  McpInvocationContext,
  McpPreparedWrite,
  McpPreparedWriteProposal,
} from '../../../types/public.js';
import type { RegisteredMcpTool } from './createMcpRegistry.js';

/** Bind provider-prepared immutable content to its registered MCP tool and requesting actor. */
export function createMcpApprovalProposalAsync(input: {
  readonly accountId: string;
  readonly context: McpInvocationContext;
  readonly prepared: McpPreparedWrite;
  readonly tool: RegisteredMcpTool;
}): McpPreparedWriteProposal {
  return {
    accountId: input.accountId,
    actorId: input.context.actorId,
    change: input.prepared.change,
    createdAt: input.prepared.createdAt,
    fingerprint: input.prepared.fingerprint,
    operation: input.prepared.operation,
    payload: input.prepared.payload,
    toolId: input.tool.toolId,
  };
}
