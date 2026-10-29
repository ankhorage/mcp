import type { McpApprovalProposal, McpInvocationContext } from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import type { RegisteredMcpTool } from './createMcpRegistry.js';

/** Build the exact immutable approval binding after provider state has been verified. */
export async function createMcpApprovalProposalAsync(input: {
  readonly accountId: string;
  readonly change: McpApprovalProposal['change'];
  readonly context: McpInvocationContext;
  readonly now: () => Date;
  readonly tool: RegisteredMcpTool;
  readonly toolInput: Readonly<Record<string, unknown>>;
}): Promise<McpApprovalProposal> {
  return {
    accountId: input.accountId,
    actorId: input.context.actorId,
    change: input.change,
    expiresAt: new Date(input.now().getTime() + 60_000).toISOString(),
    fingerprint:
      (await input.tool.tool.approvalFingerprintAsync?.(
        input.toolInput,
        input.context,
        input.change,
      )) ?? createMcpApprovalFingerprint(input.toolInput),
    operation: input.tool.tool.id,
    toolId: input.tool.toolId,
  };
}
