import type {
  McpAuditSink,
  McpExecutionClaim,
  McpInvocationContext,
  McpPreparedWriteSettlementOutcome,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpWriteAuditEvent } from './createMcpWriteAuditEvent.js';
import { McpRequestError } from './McpRequestError.js';
import { recordMcpAuditRequiredAsync } from './recordMcpAuditRequiredAsync.js';

/*** Reconcile one host-fenced execution using only a matching provider's read-only evidence contract. */
export async function reconcileMcpPreparedWriteAsync(input: {
  readonly auditSink: McpAuditSink | undefined;
  readonly context: McpInvocationContext;
  readonly executionClaim: McpExecutionClaim;
  readonly preparedWriteStore: McpPreparedWriteStore | undefined;
  readonly registeredTool: { readonly tool: McpWriteTool; readonly toolId: string } | undefined;
}): Promise<{ readonly outcome: McpPreparedWriteSettlementOutcome | 'executing' }> {
  const store = input.preparedWriteStore;
  if (store === undefined)
    throw new McpRequestError('Write recovery requires a trusted prepared-write host.');
  const current = await readCurrentOutcomeAsync(store, input.executionClaim);
  if (current === 'executed' || current === 'not_applied') return { outcome: current };
  if (input.registeredTool === undefined)
    throw new McpRequestError('MCP recovery denied: unknown write tool.');
  const recovery = await claimRecoveryAsync(store, input);
  if (recovery === null) return { outcome: current };
  assertRecoveryBinding(input, recovery);
  const outcome = await collectEvidenceAsync(input.registeredTool.tool, recovery.proposal, {
    ...input.context,
    executionClaim: input.executionClaim,
  });
  await settleAndAuditAsync(input, recovery, outcome);
  return { outcome };
}

/*** Read the durable state before attempting a recovery claim; this operation never reaches a provider. */
async function readCurrentOutcomeAsync(
  store: McpPreparedWriteStore,
  executionClaim: McpExecutionClaim,
): Promise<McpPreparedWriteSettlementOutcome | 'executing'> {
  try {
    return (await store.reconcilePreparedWriteAsync(executionClaim)).outcome;
  } catch {
    throw new McpRequestError(
      'MCP recovery rejected because prepared-write persistence is unavailable.',
    );
  }
}

/*** Ask the host to atomically fence recovery before any provider evidence is requested. */
async function claimRecoveryAsync(
  store: McpPreparedWriteStore,
  input: Parameters<typeof reconcileMcpPreparedWriteAsync>[0],
) {
  if (store.claimPreparedWriteRecoveryAsync === undefined)
    throw new McpRequestError('Write recovery requires a trusted recovery-capable host.');
  try {
    return await store.claimPreparedWriteRecoveryAsync({
      allowedAccounts: input.context.allowedAccounts,
      actorId: input.context.actorId,
      executionClaim: input.executionClaim,
    });
  } catch {
    throw new McpRequestError('MCP recovery rejected because recovery persistence is unavailable.');
  }
}

/*** Reject host data whose immutable proposal cannot be bound to this recovery's identity and tool. */
function assertRecoveryBinding(
  input: Parameters<typeof reconcileMcpPreparedWriteAsync>[0],
  recovery: NonNullable<Awaited<ReturnType<typeof claimRecoveryAsync>>>,
): void {
  if (
    recovery.proposal.toolId !== input.registeredTool?.toolId ||
    recovery.proposal.actorId !== input.context.actorId ||
    !input.context.allowedAccounts.includes(recovery.proposal.accountId) ||
    recovery.snapshotFingerprint !== createMcpApprovalFingerprint(recovery.proposal) ||
    recovery.recoveryClaim.approvalId !== input.executionClaim.approvalId ||
    recovery.recoveryClaim.intentId !== input.executionClaim.intentId ||
    recovery.recoveryClaim.recoveryId.length === 0
  )
    throw new McpRequestError(
      'MCP recovery rejected because its immutable execution binding is invalid.',
    );
}

/*** Convert missing, failing, or non-causal provider evidence into the only safe result: indeterminate. */
async function collectEvidenceAsync(
  tool: McpWriteTool,
  proposal: Parameters<NonNullable<McpWriteTool['reconcilePreparedWriteAsync']>>[0],
  context: Parameters<NonNullable<McpWriteTool['reconcilePreparedWriteAsync']>>[1],
): Promise<McpPreparedWriteSettlementOutcome> {
  if (tool.reconcilePreparedWriteAsync === undefined) return 'indeterminate';
  try {
    return await tool.reconcilePreparedWriteAsync(proposal, context);
  } catch {
    return 'indeterminate';
  }
}

/*** Persist the fenced terminal recovery result before its deterministic audit record. */
async function settleAndAuditAsync(
  input: Parameters<typeof reconcileMcpPreparedWriteAsync>[0],
  recovery: NonNullable<Awaited<ReturnType<typeof claimRecoveryAsync>>>,
  outcome: McpPreparedWriteSettlementOutcome,
): Promise<void> {
  const store = input.preparedWriteStore;
  if (store?.settlePreparedWriteRecoveryAsync === undefined)
    throw new McpRequestError('Write recovery requires a trusted recovery-capable host.');
  try {
    await store.settlePreparedWriteRecoveryAsync({
      outcome,
      ...(outcome === 'indeterminate' ? { reasonCode: 'provider-evidence-insufficient' } : {}),
      recoveryClaim: recovery.recoveryClaim,
    });
  } catch {
    throw new McpRequestError('MCP recovery rejected because recovery settlement is unavailable.');
  }
  await recordMcpAuditRequiredAsync(
    input.auditSink,
    createMcpWriteAuditEvent({
      claim: input.executionClaim,
      outcome: 'reconciliation_completed',
      proposal: recovery.proposal,
      snapshotFingerprint: recovery.snapshotFingerprint,
      ...(outcome === 'indeterminate' ? { reasonCode: 'provider-evidence-insufficient' } : {}),
    }),
  );
}
