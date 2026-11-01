import type { McpClaimedPreparedWrite } from '../../../types/preparedWrite.js';
import type {
  McpAuditSink,
  McpExecutionAuditOutcome,
  McpPreparedWriteSettlementOutcome,
  McpPreparedWriteStore,
  McpToolExecutionContext,
  McpWriteAuditOutcome,
  McpWriteTool,
} from '../../../types/public.js';
import { assertMcpJsonSchema } from './assertMcpJsonSchema.js';
import { createMcpWriteAuditEvent } from './createMcpWriteAuditEvent.js';
import { McpRequestError } from './McpRequestError.js';
import { recordMcpAuditRequiredAsync } from './recordMcpAuditRequiredAsync.js';

/** Run durable auditing, preflight, provider mutation, and one authoritative terminal settlement. */
export async function executeMcpClaimedWriteAsync(input: {
  readonly auditSink: McpAuditSink | undefined;
  readonly claimed: McpClaimedPreparedWrite;
  readonly context: McpToolExecutionContext;
  readonly preparedWriteStore: McpPreparedWriteStore | undefined;
  readonly tool: McpWriteTool;
}): Promise<unknown> {
  await auditOrSettleNoWriteAsync(input, 'intent_persisted');
  const verification = await verifyAsync(input);
  if (verification !== 'verified') {
    await settleAndAuditAsync(input, 'not_applied', 'preflight_rejected', verification);
    throw new McpRequestError(
      verification === 'state-mismatch'
        ? 'Write approval is stale because provider state no longer matches the proposal.'
        : 'MCP write verification failed.',
    );
  }
  await auditOrSettleNoWriteAsync(input, 'provider_call_started');
  return await invokeAndSettleAsync(input);
}

/** Record the pre-provider audit checkpoint, failing closed while a no-write result is provable. */
async function auditOrSettleNoWriteAsync(
  input: Parameters<typeof executeMcpClaimedWriteAsync>[0],
  outcome: 'intent_persisted' | 'provider_call_started',
): Promise<void> {
  try {
    await recordAuditAsync(input, outcome);
  } catch {
    await settleAndAuditAsync(input, 'not_applied', 'preflight_rejected', 'audit-unavailable');
    throw new McpRequestError('MCP write rejected because durable audit recording is unavailable.');
  }
}

/** Treat a rejected or exceptional preflight as a durable no-write outcome. */
async function verifyAsync(
  input: Parameters<typeof executeMcpClaimedWriteAsync>[0],
): Promise<'state-mismatch' | 'verification-error' | 'verified'> {
  try {
    return (await input.tool.verifyPreparedWriteAsync(input.claimed.proposal, input.context))
      ? 'verified'
      : 'state-mismatch';
  } catch {
    return 'verification-error';
  }
}

/** Once invocation begins, every exception is indeterminate because the provider may have mutated. */
async function invokeAndSettleAsync(
  input: Parameters<typeof executeMcpClaimedWriteAsync>[0],
): Promise<unknown> {
  const { output, outcome } = await invokeProviderAsync(input);
  await settleAndAuditAsync(
    input,
    outcome === 'executed' ? 'executed' : 'indeterminate',
    outcome === 'executed' ? 'mutation_verified' : 'indeterminate',
  );
  return output;
}

/** Limit indeterminate handling to the interval after the provider call may have begun. */
async function invokeProviderAsync(
  input: Parameters<typeof executeMcpClaimedWriteAsync>[0],
): Promise<{ readonly outcome: McpExecutionAuditOutcome; readonly output: unknown }> {
  try {
    const output = await input.tool.executePreparedWriteAsync(
      input.claimed.proposal,
      input.context,
    );
    if (input.tool.outputSchema !== undefined)
      assertMcpJsonSchema(output, input.tool.outputSchema, 'output');
    return { outcome: input.tool.auditOutcome?.(output) ?? 'executed', output };
  } catch (error) {
    await settleAndAuditAsync(input, 'indeterminate', 'indeterminate', 'provider-outcome-unknown');
    if (error instanceof McpRequestError) throw error;
    throw new McpRequestError('MCP tool execution failed.');
  }
}

/** Persist terminal lifecycle state before its idempotent, secret-free audit event. */
async function settleAndAuditAsync(
  input: Parameters<typeof executeMcpClaimedWriteAsync>[0],
  outcome: McpPreparedWriteSettlementOutcome,
  auditOutcome: Extract<
    McpWriteAuditOutcome,
    'indeterminate' | 'mutation_verified' | 'preflight_rejected'
  >,
  reasonCode?: string,
): Promise<void> {
  try {
    if (input.preparedWriteStore === undefined) throw new Error('missing store');
    await input.preparedWriteStore.settlePreparedWriteAsync({
      executionClaim: input.claimed.executionClaim,
      outcome,
      ...(reasonCode === undefined ? {} : { reasonCode }),
    });
  } catch {
    throw new McpRequestError(
      'MCP write rejected because prepared-write settlement is unavailable.',
    );
  }
  await recordAuditAsync(input, auditOutcome, reasonCode);
}

/** Append one deterministic audit event, allowing the host to make lost responses idempotent. */
async function recordAuditAsync(
  input: Parameters<typeof executeMcpClaimedWriteAsync>[0],
  outcome: McpWriteAuditOutcome,
  reasonCode?: string,
): Promise<void> {
  await recordMcpAuditRequiredAsync(
    input.auditSink,
    createMcpWriteAuditEvent({
      claim: input.claimed.executionClaim,
      outcome,
      proposal: input.claimed.proposal,
      snapshotFingerprint: input.claimed.snapshotFingerprint,
      ...(reasonCode === undefined ? {} : { reasonCode }),
    }),
  );
}
