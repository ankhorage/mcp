import type {
  McpAuditEvent,
  McpPreparedWriteProposal,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpRegistry } from './createMcpRegistry.js';

export const securityContext = { actorId: 'operator', allowedAccounts: ['account'] };
export const securityApprovalInput = { approvalId: 'approval' };

export type PreparedWriteSecurityFixtureOptions = Readonly<{
  readonly auditFailsFor?: 'intent_persisted' | 'mutation_verified';
  readonly claimProposal?: (proposal: McpPreparedWriteProposal) => McpPreparedWriteProposal;
  readonly executeFails?: boolean;
  readonly snapshotFingerprint?: string;
  readonly stateMatches?: boolean;
  readonly storedProposal?: (proposal: McpPreparedWriteProposal) => McpPreparedWriteProposal;
  readonly verificationThrows?: boolean;
}>;

/** Build a fake provider and trusted host whose observable effects can be asserted precisely. */
export function createPreparedWriteSecurityFixture(
  options: PreparedWriteSecurityFixtureOptions = {},
) {
  const state = {
    audit: [] as McpAuditEvent[],
    calls: 0,
    consumed: false,
    proposal: undefined as McpPreparedWriteProposal | undefined,
    settlements: [] as { outcome: string; reasonCode?: string }[],
  };
  const store = createStore(state, options);
  const tool = createTool(state, options);
  const registry = createMcpRegistry({
    auditSink: {
      recordAsync: (event) => {
        state.audit.push(event);
        return event.outcome === options.auditFailsFor
          ? Promise.reject(new Error('audit unavailable'))
          : Promise.resolve();
      },
    },
    integrations: [{ id: 'fixture', tools: [tool] }],
    preparedWriteStore: store,
  });
  return { registry, state };
}

/** Prepare one host-persisted approval for execution. */
export async function preparePreparedWriteSecurityFixtureAsync(
  registry: ReturnType<typeof createMcpRegistry>,
): Promise<void> {
  await registry.prepareWriteAsync('fixture.write', {}, securityContext);
}

/** Assert a request fails without relying on provider-specific error details. */
export async function rejectPreparedWriteSecurityFixtureAsync(
  promise: Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(expected))
      throw new Error(`Expected rejection containing: ${expected}`, { cause: error });
    return;
  }
  throw new Error('Expected rejection.');
}

/** Model the trusted host's atomic approval consume with mutable test-only state. */
function createStore(
  state: {
    consumed: boolean;
    proposal: McpPreparedWriteProposal | undefined;
    settlements: { outcome: string; reasonCode?: string }[];
  },
  options: PreparedWriteSecurityFixtureOptions,
): McpPreparedWriteStore {
  return {
    createPreparedWriteAsync: (proposal) => {
      const storedProposal = options.storedProposal?.(proposal) ?? proposal;
      state.proposal = storedProposal;
      return Promise.resolve(stored(storedProposal, options.snapshotFingerprint));
    },
    claimApprovedWriteAndCreateIntentAsync: ({ approvalId, actorId, allowedAccounts, toolId }) => {
      const { proposal } = state;
      if (
        state.consumed ||
        approvalId !== 'approval' ||
        proposal?.actorId !== actorId ||
        !allowedAccounts.includes(proposal.accountId) ||
        toolId !== 'fixture.write'
      )
        return Promise.resolve(null);
      state.consumed = true;
      const claimedProposal = options.claimProposal?.(proposal) ?? proposal;
      return Promise.resolve({
        ...stored(claimedProposal, options.snapshotFingerprint),
        executionClaim: { approvalId, intentId: 'intent' },
      });
    },
    reconcilePreparedWriteAsync: () => Promise.resolve({ outcome: 'executing' }),
    settlePreparedWriteAsync: (settlement) => {
      state.settlements.push({
        outcome: settlement.outcome,
        ...(settlement.reasonCode === undefined ? {} : { reasonCode: settlement.reasonCode }),
      });
      return Promise.resolve();
    },
  };
}

/** Build a fake write provider whose verification and invocation can fail independently. */
function createTool(
  state: { calls: number },
  options: PreparedWriteSecurityFixtureOptions,
): McpWriteTool {
  return {
    accountId: () => 'account',
    description: 'Mutate the fixture.',
    executePreparedWriteAsync: () => {
      state.calls += 1;
      return options.executeFails === true
        ? Promise.reject(new Error('provider timeout or crash'))
        : Promise.resolve({ ok: true });
    },
    id: 'write',
    inputSchema: { additionalProperties: false, type: 'object' },
    prepareWriteAsync: () => Promise.resolve(prepared()),
    risk: 'write',
    scope: 'account',
    title: 'Write',
    verifyPreparedWriteAsync: () =>
      options.verificationThrows === true
        ? Promise.reject(new Error('provider-secret'))
        : Promise.resolve(options.stateMatches !== false),
  };
}

/** Return the trusted host envelope with a fingerprint of exactly the proposal it returned. */
function stored(proposal: McpPreparedWriteProposal, snapshotFingerprint?: string) {
  return {
    approvalId: 'approval',
    expiresAt: '2026-11-01T00:00:00.000Z',
    proposal,
    snapshotFingerprint: snapshotFingerprint ?? createMcpApprovalFingerprint(proposal),
  };
}

/** Return a provider-generated immutable change proposal. */
function prepared() {
  return {
    change: { after: { enabled: true }, before: { enabled: false }, resourceId: 'resource' },
    createdAt: '2026-10-31T00:00:00.000Z',
    fingerprint: 'provider-fingerprint',
    operation: 'enable',
    payload: { serialized: '{"enabled":true}', version: '1' },
  };
}
