import type {
  McpExecutionClaim,
  McpPreparedWriteProposal,
  McpStoredPreparedWrite,
  McpWriteAuditEvent,
  McpWriteAuditOutcome,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';

/** Create a secret-free, stable write audit record that a host can append idempotently. */
export function createMcpWriteAuditEvent(input: {
  readonly claim: McpExecutionClaim;
  readonly outcome: McpWriteAuditOutcome;
  readonly proposal: McpPreparedWriteProposal;
  readonly reasonCode?: string;
  readonly snapshotFingerprint: McpStoredPreparedWrite['snapshotFingerprint'];
}): McpWriteAuditEvent {
  const eventKey = {
    intentId: input.claim.intentId,
    outcome: input.outcome,
    reasonCode: input.reasonCode ?? null,
  };
  return {
    accountId: input.proposal.accountId,
    actorId: input.proposal.actorId,
    approvalId: input.claim.approvalId,
    eventId: createMcpApprovalFingerprint(eventKey),
    intentId: input.claim.intentId,
    operation: input.proposal.operation,
    outcome: input.outcome,
    providerProposalFingerprint: input.proposal.fingerprint,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    risk: 'write',
    snapshotFingerprint: input.snapshotFingerprint,
    toolId: input.proposal.toolId,
  };
}
