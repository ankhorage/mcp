import type {
  McpInvocationContext,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpApprovalProposalAsync } from './createMcpApprovalProposalAsync.js';
import { McpRequestError } from './McpRequestError.js';
import { sanitizeMcpRequestAsync } from './sanitizeMcpRequestAsync.js';

/** Create and persist one immutable, account-authorized provider proposal for external approval. */
export async function prepareMcpWriteAsync(input: {
  readonly context: McpInvocationContext;
  readonly executeInput: Readonly<Record<string, unknown>>;
  readonly preparedWriteStore: McpPreparedWriteStore;
  readonly tool: McpWriteTool;
  readonly toolId: string;
}): Promise<{ readonly approvalId: string; readonly expiresAt: string }> {
  return await sanitizeMcpRequestAsync(async () => {
    const accountId = getAuthorizedAccountId(input.tool, input.executeInput, input.context);
    const prepared = await input.tool.prepareWriteAsync(input.executeInput, input.context);
    const proposal = createMcpApprovalProposalAsync({
      accountId,
      context: input.context,
      prepared,
      toolId: input.toolId,
    });
    const stored = await input.preparedWriteStore.createPreparedWriteAsync(proposal);
    if (
      createMcpApprovalFingerprint(stored.proposal) !== createMcpApprovalFingerprint(proposal) ||
      stored.snapshotFingerprint !== createMcpApprovalFingerprint(proposal)
    )
      throw new McpRequestError('Prepared write storage did not preserve the original proposal.');
    return { approvalId: stored.approvalId, expiresAt: stored.expiresAt };
  }, 'MCP write preparation failed.');
}

/** Enforce provider-derived account authorization before the proposal is persisted. */
function getAuthorizedAccountId(
  tool: McpWriteTool,
  executeInput: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
): string {
  const accountId = tool.accountId(executeInput);
  if (accountId === null) throw new McpRequestError('MCP request denied: missing-account-identity');
  if (!context.allowedAccounts.includes(accountId))
    throw new McpRequestError('MCP request denied: account-not-allowed');
  return accountId;
}
