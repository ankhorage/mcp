import type { McpClaimedPreparedWrite } from '../../../types/preparedWrite.js';
import type { McpInvocationContext, McpPreparedWriteStore } from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { McpRequestError } from './McpRequestError.js';

/** Atomically authorize and claim an approval before any provider preflight or mutation. */
export async function claimMcpApprovedWriteAsync(input: {
  readonly context: McpInvocationContext;
  readonly executeInput: Readonly<Record<string, unknown>>;
  readonly preparedWriteStore: McpPreparedWriteStore | undefined;
  readonly toolId: string;
}): Promise<McpClaimedPreparedWrite> {
  const { approvalId } = input.executeInput;
  if (typeof approvalId !== 'string' || Object.keys(input.executeInput).length !== 1)
    throw new McpRequestError('Write execution accepts only an approvalId.');
  if (input.preparedWriteStore === undefined)
    throw new McpRequestError('Write tools require a trusted prepared-write host.');
  const claimed = await claimFromHostAsync(input, approvalId);
  if (!isValidClaim(input, claimed))
    throw new McpRequestError(
      'The supplied approval is denied, expired, replayed, or bound to another operation.',
    );
  return claimed;
}

/** Isolate host failures at the trusted persistence boundary. */
async function claimFromHostAsync(
  input: Parameters<typeof claimMcpApprovedWriteAsync>[0],
  approvalId: string,
): Promise<McpClaimedPreparedWrite | null> {
  try {
    return (
      (await input.preparedWriteStore?.claimApprovedWriteAndCreateIntentAsync({
        approvalId,
        actorId: input.context.actorId,
        allowedAccounts: input.context.allowedAccounts,
        toolId: input.toolId,
      })) ?? null
    );
  } catch {
    throw new McpRequestError(
      'MCP write rejected because prepared-write persistence is unavailable.',
    );
  }
}

/** Validate the immutable host response again before it can reach a provider boundary. */
function isValidClaim(
  input: Parameters<typeof claimMcpApprovedWriteAsync>[0],
  claimed: McpClaimedPreparedWrite | null,
): claimed is McpClaimedPreparedWrite {
  return (
    claimed !== null &&
    claimed.proposal.toolId === input.toolId &&
    claimed.proposal.operation.length > 0 &&
    claimed.proposal.change.resourceId.length > 0 &&
    claimed.proposal.actorId === input.context.actorId &&
    input.context.allowedAccounts.includes(claimed.proposal.accountId) &&
    claimed.snapshotFingerprint === createMcpApprovalFingerprint(claimed.proposal)
  );
}
