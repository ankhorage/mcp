import type {
  McpExecutionClaim,
  McpInvocationContext,
  McpPreparedWriteSettlementOutcome,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpWriteAuditEvent } from './createMcpWriteAuditEvent.js';
import { McpRequestError } from './McpRequestError.js';

/*** Reconcile one host-fenced execution using only a matching provider's read-only evidence contract. */
export async function reconcileMcpPreparedWriteAsync(input: {
  readonly context: McpInvocationContext;
  readonly executionClaim: McpExecutionClaim;
  readonly preparedWriteStore: McpPreparedWriteStore | undefined;
  readonly registeredTool: { readonly tool: McpWriteTool; readonly toolId: string } | undefined;
}): Promise<{ readonly outcome: McpPreparedWriteSettlementOutcome | 'executing' }> {
  if (input.registeredTool === undefined)
    throw new McpRequestError('MCP recovery denied: unknown write tool.');
  const store = input.preparedWriteStore;
  if (store === undefined)
    throw new McpRequestError('Write recovery requires a trusted prepared-write host.');
  const current = await readCurrentOutcomeAsync(store, input);
  if (current === null)
    throw new McpRequestError('MCP recovery denied: execution claim is not authorized.');
  if (current === 'executed' || current === 'not_applied') return { outcome: current };
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

/*** Read lifecycle state only through the host's atomically authorized recovery-read boundary. */
async function readCurrentOutcomeAsync(
  store: McpPreparedWriteStore,
  input: Parameters<typeof reconcileMcpPreparedWriteAsync>[0],
): Promise<McpPreparedWriteSettlementOutcome | 'executing' | null> {
  if (store.readPreparedWriteRecoveryAsync === undefined)
    throw new McpRequestError('Write recovery requires a trusted recovery-capable host.');
  try {
    return (
      (
        await store.readPreparedWriteRecoveryAsync({
          actorId: input.context.actorId,
          allowedAccounts: input.context.allowedAccounts,
          executionClaim: input.executionClaim,
          toolId: input.registeredTool?.toolId ?? '',
        })
      )?.outcome ?? null
    );
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

/*** Persist the fenced terminal result and deterministic audit record in one host transaction. */
async function settleAndAuditAsync(
  input: Parameters<typeof reconcileMcpPreparedWriteAsync>[0],
  recovery: NonNullable<Awaited<ReturnType<typeof claimRecoveryAsync>>>,
  outcome: McpPreparedWriteSettlementOutcome,
): Promise<void> {
  const store = input.preparedWriteStore;
  if (store?.settlePreparedWriteRecoveryAndRecordAuditAsync === undefined)
    throw new McpRequestError('Write recovery requires an atomic recovery-audit host.');
  const reasonCode = outcome === 'indeterminate' ? 'provider-evidence-insufficient' : undefined;
  const auditEvent = createMcpWriteAuditEvent({
    claim: input.executionClaim,
    outcome: 'reconciliation_completed',
    proposal: recovery.proposal,
    recoveryOutcome: outcome,
    snapshotFingerprint: recovery.snapshotFingerprint,
    ...(reasonCode === undefined ? {} : { reasonCode }),
  });
  try {
    await store.settlePreparedWriteRecoveryAndRecordAuditAsync({
      auditEvent,
      outcome,
      ...(reasonCode === undefined ? {} : { reasonCode }),
      recoveryClaim: recovery.recoveryClaim,
    });
  } catch {
    throw new McpRequestError(
      'MCP recovery rejected because atomic recovery settlement is unavailable.',
    );
  }
}
