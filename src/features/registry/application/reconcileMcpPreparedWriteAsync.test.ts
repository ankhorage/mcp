import { expect, test } from 'bun:test';

import type {
  McpPreparedWriteProposal,
  McpPreparedWriteSettlementOutcome,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpRegistry } from './createMcpRegistry.js';

const context = { actorId: 'operator', allowedAccounts: ['account'] };
const executionClaim = { approvalId: 'approval', intentId: 'intent' };
interface FixtureOptions {
  readonly current?: McpPreparedWriteSettlementOutcome | 'executing';
  readonly evidence?: McpPreparedWriteSettlementOutcome;
  readonly evidenceFails?: boolean;
  readonly invalidRecoveryBinding?: boolean;
  readonly settlementFails?: boolean;
}
interface FixtureState {
  evidenceCalls: number;
  executeCalls: number;
  recoveryClaims: number;
  settlements: string[];
}
interface StoredFixture {
  readonly approvalId: string;
  readonly expiresAt: string;
  readonly proposal: McpPreparedWriteProposal;
  readonly snapshotFingerprint: string;
}

/** Exercise recovery only through the host-facing registry boundary, never through an MCP tool call. */
function createFixture(options: FixtureOptions = {}) {
  const state: FixtureState = {
    evidenceCalls: 0,
    executeCalls: 0,
    recoveryClaims: 0,
    settlements: [],
  };
  const proposal = createProposal();
  const stored: StoredFixture = {
    approvalId: executionClaim.approvalId,
    expiresAt: '2026-11-01T00:00:00.000Z',
    proposal,
    snapshotFingerprint: createMcpApprovalFingerprint(proposal),
  };
  return {
    registry: createMcpRegistry({
      auditSink: { recordAsync: () => Promise.resolve() },
      integrations: [{ id: 'fixture', tools: [createTool(options, state)] }],
      preparedWriteStore: createStore(options, state, stored),
    }),
    state,
  };
}

/** Model an exclusive host recovery lease with deterministic persistence failures. */
function createStore(
  options: FixtureOptions,
  state: FixtureState,
  stored: StoredFixture,
): McpPreparedWriteStore {
  return {
    claimApprovedWriteAndCreateIntentAsync: () => Promise.resolve(null),
    claimPreparedWriteRecoveryAsync: () => {
      state.recoveryClaims += 1;
      if (options.current === 'executing' || state.recoveryClaims > 1) return Promise.resolve(null);
      return Promise.resolve({
        ...stored,
        recoveryClaim: {
          ...executionClaim,
          recoveryId: options.invalidRecoveryBinding === true ? '' : 'recovery-fence',
        },
      });
    },
    createPreparedWriteAsync: () => Promise.resolve(stored),
    reconcilePreparedWriteAsync: () =>
      Promise.resolve({ outcome: options.current ?? 'indeterminate' }),
    settlePreparedWriteAsync: () => Promise.resolve(),
    settlePreparedWriteRecoveryAsync: (settlement) => {
      if (options.settlementFails === true)
        return Promise.reject(new Error('conflicting settlement'));
      state.settlements.push(settlement.outcome);
      return Promise.resolve();
    },
  };
}

/** Return a write provider that can collect recovery evidence but whose mutation counter stays observable. */
function createTool(options: FixtureOptions, state: FixtureState): McpWriteTool {
  const proposal = createProposal();
  return {
    accountId: () => 'account',
    description: 'Fixture write',
    executePreparedWriteAsync: () => Promise.resolve({ calls: ++state.executeCalls }),
    id: 'write',
    inputSchema: { additionalProperties: false, type: 'object' },
    prepareWriteAsync: () =>
      Promise.resolve({
        change: proposal.change,
        createdAt: proposal.createdAt,
        fingerprint: proposal.fingerprint,
        operation: proposal.operation,
        payload: proposal.payload,
      }),
    reconcilePreparedWriteAsync: () => {
      state.evidenceCalls += 1;
      return options.evidenceFails === true
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve(options.evidence ?? 'indeterminate');
    },
    risk: 'write',
    scope: 'account',
    title: 'Fixture write',
    verifyPreparedWriteAsync: () => Promise.resolve(true),
  };
}

/** Return one immutable persisted proposal with all execution identity bindings present. */
function createProposal(): McpPreparedWriteProposal {
  return {
    accountId: 'account',
    actorId: 'operator',
    change: { after: { enabled: true }, before: { enabled: false }, resourceId: 'resource' },
    createdAt: '2026-11-01T00:00:00.000Z',
    fingerprint: 'provider-fingerprint',
    operation: 'write',
    payload: { serialized: '{"enabled":true}', version: 'fixture/v1' },
    toolId: 'fixture.write',
  };
}

test('recovers a crashed execution as executed from read-only provider evidence without a second mutation', async () => {
  const fixture = createFixture({ evidence: 'executed' });
  expect(
    await fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'executed' });
  expect(fixture.state).toEqual({
    evidenceCalls: 1,
    executeCalls: 0,
    recoveryClaims: 1,
    settlements: ['executed'],
  });
});

test('settles not_applied only when the provider evidence contract returns that proof', async () => {
  const fixture = createFixture({ evidence: 'not_applied' });
  expect(
    await fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'not_applied' });
  expect(fixture.state.settlements).toEqual(['not_applied']);
});

test('keeps timeout, crash-after-call, and missing evidence indeterminate without invoking execution', async () => {
  const timeout = createFixture({ evidenceFails: true });
  const absent = createFixture();
  expect(
    await timeout.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'indeterminate' });
  expect(
    await absent.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'indeterminate' });
  expect(timeout.state.executeCalls + absent.state.executeCalls).toBe(0);
});

test('does not inspect a settled execution or convert an active execution into a provider call', async () => {
  const settled = createFixture({ current: 'executed' });
  const active = createFixture({ current: 'executing' });
  expect(
    await settled.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'executed' });
  expect(
    await active.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'executing' });
  expect(settled.state.evidenceCalls + active.state.evidenceCalls).toBe(0);
});

test('fences parallel recovery attempts so only one can collect provider evidence', async () => {
  const fixture = createFixture({ evidence: 'executed' });
  const outcomes = await Promise.all([
    fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
    fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ]);
  expect(outcomes).toContainEqual({ outcome: 'executed' });
  expect(fixture.state.evidenceCalls).toBe(1);
  expect(fixture.state.executeCalls).toBe(0);
});

test('rejects invalid recovery bindings and contradictory recovery settlements', async () => {
  const invalid = createFixture({ invalidRecoveryBinding: true });
  const conflicting = createFixture({ settlementFails: true });
  await rejectAsync(
    invalid.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
    'immutable execution binding is invalid',
  );
  await rejectAsync(
    conflicting.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
    'recovery settlement is unavailable',
  );
  expect(invalid.state.executeCalls + conflicting.state.executeCalls).toBe(0);
});

/** Assert a rejected recovery without relying on the host implementation's raw error. */
async function rejectAsync(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
    throw new Error('Expected recovery to reject.');
  } catch (error) {
    expect(error).toHaveProperty('message', expect.stringContaining(expected));
  }
}
