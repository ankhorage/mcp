import { expect, test } from 'bun:test';

import type {
  McpPreparedWriteProposal,
  McpPreparedWriteSettlementOutcome,
  McpPreparedWriteStore,
  McpWriteAuditEvent,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpRegistry } from './createMcpRegistry.js';

const context = { actorId: 'operator', allowedAccounts: ['account'] };
const executionClaim = { approvalId: 'approval', intentId: 'intent' };
type FixtureOptions = Readonly<{
  readonly auditCommitFails?: boolean;
  readonly current?: McpPreparedWriteSettlementOutcome | 'executing';
  readonly evidence?: McpPreparedWriteSettlementOutcome;
  readonly evidenceFails?: boolean;
  readonly identity?: 'account' | 'actor' | 'approval-intent' | 'snapshot' | 'tool';
}>;
interface FixtureState {
  audit: McpWriteAuditEvent[];
  evidenceCalls: number;
  executeCalls: number;
  recoveryClaims: number;
  terminal: McpPreparedWriteSettlementOutcome | 'executing';
}

/** Exercise recovery through the privileged registry boundary with a transactional host model. */
function createFixture(options: FixtureOptions = {}) {
  const proposal = createProposal(options.identity);
  const state = {
    audit: [] as McpWriteAuditEvent[],
    evidenceCalls: 0,
    executeCalls: 0,
    recoveryClaims: 0,
    terminal: options.current ?? 'indeterminate',
  };
  const store = createStore(options, proposal, state);
  const tool = createTool(options, proposal, state);
  return {
    registry: createMcpRegistry({
      auditSink: { recordAsync: () => Promise.resolve() },
      integrations: [{ id: 'fixture', tools: [tool] }],
      preparedWriteStore: store,
    }),
    state,
  };
}

/** Model host authorization and recovery-fence acquisition independently from the provider. */
function createStore(
  options: FixtureOptions,
  proposal: McpPreparedWriteProposal,
  state: FixtureState,
): McpPreparedWriteStore {
  return {
    claimApprovedWriteAndCreateIntentAsync: () => Promise.resolve(null),
    claimPreparedWriteRecoveryAsync: () => {
      state.recoveryClaims += 1;
      if (state.terminal === 'executing' || state.recoveryClaims > 1) return Promise.resolve(null);
      return Promise.resolve({
        approvalId: 'approval',
        expiresAt: '2026-11-01T00:00:00.000Z',
        proposal,
        recoveryClaim: {
          approvalId: options.identity === 'approval-intent' ? 'other-approval' : 'approval',
          intentId: options.identity === 'approval-intent' ? 'other-intent' : 'intent',
          recoveryId: 'recovery-fence',
        },
        snapshotFingerprint:
          options.identity === 'snapshot' ? 'tampered' : createMcpApprovalFingerprint(proposal),
      });
    },
    createPreparedWriteAsync: () =>
      Promise.resolve({
        approvalId: 'approval',
        expiresAt: '2026-11-01T00:00:00.000Z',
        proposal,
        snapshotFingerprint: createMcpApprovalFingerprint(proposal),
      }),
    readPreparedWriteRecoveryAsync: (input) => {
      if (
        input.actorId !== proposal.actorId ||
        !input.allowedAccounts.includes(proposal.accountId) ||
        input.toolId !== proposal.toolId ||
        input.executionClaim.approvalId !== 'approval' ||
        input.executionClaim.intentId !== 'intent' ||
        options.identity !== undefined
      )
        return Promise.resolve(null);
      return Promise.resolve({ outcome: state.terminal });
    },
    settlePreparedWriteAsync: () => Promise.resolve(),
    settlePreparedWriteRecoveryAndRecordAuditAsync: (input) =>
      commitRecoveryAsync(options, state, input),
  };
}

/** Commit both recovery rows in the fixture together, or change neither. */
function commitRecoveryAsync(
  options: FixtureOptions,
  state: FixtureState,
  input: Parameters<
    NonNullable<McpPreparedWriteStore['settlePreparedWriteRecoveryAndRecordAuditAsync']>
  >[0],
): Promise<void> {
  const { auditEvent, outcome, recoveryClaim } = input;
  if (
    recoveryClaim.recoveryId !== 'recovery-fence' ||
    auditEvent.recoveryOutcome !== outcome ||
    auditEvent.outcome !== 'reconciliation_completed' ||
    options.auditCommitFails === true
  )
    return Promise.reject(new Error('transaction rolled back'));
  const existing = state.audit.find((event) => event.eventId === auditEvent.eventId);
  if (existing !== undefined)
    return JSON.stringify(existing) === JSON.stringify(auditEvent)
      ? Promise.resolve()
      : Promise.reject(new Error('conflicting event'));
  state.terminal = outcome;
  state.audit.push(auditEvent);
  return Promise.resolve();
}

/** Return a write provider whose recovery evidence and mutation effects are independently visible. */
function createTool(
  options: FixtureOptions,
  proposal: McpPreparedWriteProposal,
  state: FixtureState,
): McpWriteTool {
  return {
    accountId: () => 'account',
    description: 'Fixture write',
    executePreparedWriteAsync: () => Promise.resolve({ calls: ++state.executeCalls }),
    id: 'write',
    inputSchema: { additionalProperties: false, type: 'object' },
    prepareWriteAsync: () => Promise.resolve(withoutBindings(proposal)),
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

/** Create one persisted proposal, optionally with a deliberately invalid binding. */
function createProposal(identity: FixtureOptions['identity']): McpPreparedWriteProposal {
  return {
    accountId: identity === 'account' ? 'other-account' : 'account',
    actorId: identity === 'actor' ? 'other-actor' : 'operator',
    change: { after: { enabled: true }, before: { enabled: false }, resourceId: 'resource' },
    createdAt: '2026-11-01T00:00:00.000Z',
    fingerprint: 'provider-fingerprint',
    operation: 'write',
    payload: { serialized: '{"enabled":true}', version: 'fixture/v1' },
    toolId: identity === 'tool' ? 'fixture.other' : 'fixture.write',
  };
}

/** Remove the runtime-owned proposal bindings before a provider prepares its value. */
function withoutBindings(proposal: McpPreparedWriteProposal) {
  const { accountId: _accountId, actorId: _actorId, toolId: _toolId, ...prepared } = proposal;
  return prepared;
}

/** Assert a rejected recovery without exposing host implementation errors. */
async function rejectsAsync(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toHaveProperty('message', expect.stringContaining(message));
    return;
  }
  throw new Error('Expected recovery to reject.');
}

test('authorizes terminal reads before returning executed and never asks a provider for evidence', async () => {
  const fixture = createFixture({ current: 'executed' });
  expect(
    await fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'executed' });
  expect(fixture.state.evidenceCalls).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('fails closed before terminal reads for unknown tools, foreign actors, accounts, tools, IDs, and snapshots', async () => {
  const unknown = createFixture({ current: 'executed' });
  await rejectsAsync(
    unknown.registry.reconcilePreparedWriteAsync('fixture.unknown', executionClaim, context),
    'unknown write tool',
  );
  for (const identity of ['actor', 'account', 'tool', 'approval-intent', 'snapshot'] as const) {
    const fixture = createFixture({ identity });
    await rejectsAsync(
      fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
      'execution claim is not authorized',
    );
    expect(
      fixture.state.evidenceCalls + fixture.state.executeCalls + fixture.state.audit.length,
    ).toBe(0);
  }
});

test('atomically commits recovery settlement and outcome-specific audit, then permits an authorized restart read', async () => {
  const fixture = createFixture({ evidence: 'executed' });
  expect(
    await fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'executed' });
  expect(fixture.state.audit).toHaveLength(1);
  expect(fixture.state.audit[0]).toMatchObject({
    outcome: 'reconciliation_completed',
    recoveryOutcome: 'executed',
  });
  expect(
    await fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ).toEqual({ outcome: 'executed' });
  expect(fixture.state.evidenceCalls).toBe(1);
  expect(fixture.state.executeCalls).toBe(0);
});

test('rolls back both recovery state and audit when the host transaction cannot commit', async () => {
  const fixture = createFixture({ auditCommitFails: true, evidence: 'not_applied' });
  await rejectsAsync(
    fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
    'atomic recovery settlement is unavailable',
  );
  expect(fixture.state.terminal).toBe('indeterminate');
  expect(fixture.state.audit).toHaveLength(0);
});

test('records distinct deterministic audits for each recovery outcome and treats missing or failing evidence as indeterminate', async () => {
  const executed = createFixture({ evidence: 'executed' });
  const notApplied = createFixture({ evidence: 'not_applied' });
  const indeterminate = createFixture({ evidenceFails: true });
  for (const fixture of [executed, notApplied, indeterminate])
    await fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context);
  expect(executed.state.audit[0]?.eventId).not.toBe(notApplied.state.audit[0]?.eventId);
  expect(notApplied.state.audit[0]?.eventId).not.toBe(indeterminate.state.audit[0]?.eventId);
  expect(indeterminate.state.audit[0]).toMatchObject({
    recoveryOutcome: 'indeterminate',
    reasonCode: 'provider-evidence-insufficient',
  });
  expect(indeterminate.state.executeCalls).toBe(0);
});

test('fences parallel recovery attempts so only one collects evidence and commits an audit', async () => {
  const fixture = createFixture({ evidence: 'executed' });
  await Promise.all([
    fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
    fixture.registry.reconcilePreparedWriteAsync('fixture.write', executionClaim, context),
  ]);
  expect(fixture.state.evidenceCalls).toBe(1);
  expect(fixture.state.audit).toHaveLength(1);
  expect(fixture.state.executeCalls).toBe(0);
});
