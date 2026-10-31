import { expect, test } from 'bun:test';

import type {
  McpAuditEvent,
  McpPreparedWriteProposal,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { loadMcpHostAsync } from '../../host/application/loadMcpHostAsync.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpRegistry } from './createMcpRegistry.js';

const context = { actorId: 'operator', allowedAccounts: ['account'] };
const approvalInput = { approvalId: 'approval' };

type FixtureOptions = Readonly<{
  auditFailsFor?: 'executed' | 'intent';
  claimProposal?: (proposal: McpPreparedWriteProposal) => McpPreparedWriteProposal;
  executeFails?: boolean;
  stateMatches?: boolean;
  storedProposal?: (proposal: McpPreparedWriteProposal) => McpPreparedWriteProposal;
}>;

/** Build a fake provider and trusted host whose observable effects can be asserted precisely. */
function createFixture(options: FixtureOptions = {}) {
  const state = {
    audit: [] as McpAuditEvent[],
    calls: 0,
    consumed: false,
    proposal: undefined as McpPreparedWriteProposal | undefined,
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

/** Model the trusted host's atomic approval consume with mutable test-only state. */
function createStore(
  state: {
    consumed: boolean;
    proposal: McpPreparedWriteProposal | undefined;
  },
  options: FixtureOptions,
): McpPreparedWriteStore {
  return {
    createPreparedWriteAsync: (proposal) => {
      const storedProposal = options.storedProposal?.(proposal) ?? proposal;
      state.proposal = storedProposal;
      return Promise.resolve(stored(storedProposal));
    },
    claimApprovedWriteAndCreateIntentAsync: ({ approvalId, toolId }) => {
      const { proposal } = state;
      if (
        state.consumed ||
        approvalId !== 'approval' ||
        proposal === undefined ||
        toolId !== 'fixture.write'
      )
        return Promise.resolve(null);
      state.consumed = true;
      const claimedProposal = options.claimProposal?.(proposal) ?? proposal;
      return Promise.resolve({
        ...stored(claimedProposal),
        executionClaim: { approvalId, intentId: 'intent' },
      });
    },
  };
}

/** Build a fake write provider whose verification and invocation can be made to fail independently. */
function createTool(state: { calls: number }, options: FixtureOptions): McpWriteTool {
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
    verifyPreparedWriteAsync: () => Promise.resolve(options.stateMatches !== false),
  };
}

/** Return the trusted host envelope with a fingerprint of exactly the proposal it returned. */
function stored(proposal: McpPreparedWriteProposal) {
  return {
    approvalId: 'approval',
    expiresAt: '2026-11-01T00:00:00.000Z',
    proposal,
    snapshotFingerprint: createMcpApprovalFingerprint(proposal),
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

/** Prepare one host-persisted approval for execution. */
async function prepareAsync(registry: ReturnType<typeof createMcpRegistry>): Promise<void> {
  await registry.prepareWriteAsync('fixture.write', {}, context);
}

/** Assert a request fails without relying on provider-specific error details. */
async function rejectsAsync(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect((error as Error).message).toContain(expected);
    return;
  }
  throw new Error('Expected rejection.');
}

test('rejects unapproved, expired, reused, actor-bound, and tool-bound approvals before mutation', async () => {
  const missing = createFixture();
  await prepareAsync(missing.registry);
  await rejectsAsync(
    missing.registry.executeAsync('fixture.write', {}, context),
    'accepts only an approvalId',
  );
  expect(missing.state.calls).toBe(0);

  const expired = createFixture();
  await prepareAsync(expired.registry);
  await rejectsAsync(
    expired.registry.executeAsync('fixture.write', { approvalId: 'expired' }, context),
    'denied, expired, replayed',
  );
  expect(expired.state.calls).toBe(0);

  const actor = createFixture({ claimProposal: (proposal) => ({ ...proposal, actorId: 'other' }) });
  await prepareAsync(actor.registry);
  await rejectsAsync(
    actor.registry.executeAsync('fixture.write', approvalInput, context),
    'bound to another operation',
  );
  expect(actor.state.calls).toBe(0);

  const tool = createFixture({
    claimProposal: (proposal) => ({ ...proposal, toolId: 'fixture.other' }),
  });
  await prepareAsync(tool.registry);
  await rejectsAsync(
    tool.registry.executeAsync('fixture.write', approvalInput, context),
    'bound to another operation',
  );
  expect(tool.state.calls).toBe(0);

  const replay = createFixture();
  await prepareAsync(replay.registry);
  await replay.registry.executeAsync('fixture.write', approvalInput, context);
  await rejectsAsync(
    replay.registry.executeAsync('fixture.write', approvalInput, context),
    'denied, expired, replayed',
  );
  expect(replay.state.calls).toBe(1);
});

test('rejects changed original proposals and fingerprints before a human approval can be used', async () => {
  const changed = createFixture({
    storedProposal: (proposal) => ({
      ...proposal,
      payload: { ...proposal.payload, serialized: '{}' },
    }),
  });
  await rejectsAsync(
    changed.registry.prepareWriteAsync('fixture.write', {}, context),
    'did not preserve',
  );

  const fingerprint = createFixture({
    storedProposal: (proposal) => ({ ...proposal, fingerprint: 'tampered' }),
  });
  await rejectsAsync(
    fingerprint.registry.prepareWriteAsync('fixture.write', {}, context),
    'did not preserve',
  );
  expect(changed.state.calls + fingerprint.state.calls).toBe(0);
});

test('claims concurrent executions once and never retries an indeterminate provider call', async () => {
  const concurrent = createFixture();
  await prepareAsync(concurrent.registry);
  const results = await Promise.allSettled([
    concurrent.registry.executeAsync('fixture.write', approvalInput, context),
    concurrent.registry.executeAsync('fixture.write', approvalInput, context),
  ]);
  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  expect(concurrent.state.calls).toBe(1);

  const indeterminate = createFixture({ executeFails: true });
  await prepareAsync(indeterminate.registry);
  await rejectsAsync(
    indeterminate.registry.executeAsync('fixture.write', approvalInput, context),
    'execution failed',
  );
  expect(indeterminate.state.calls).toBe(1);
  expect(indeterminate.state.audit.map(({ outcome }) => outcome)).toEqual([
    'intent',
    'indeterminate',
  ]);
  await rejectsAsync(
    indeterminate.registry.executeAsync('fixture.write', approvalInput, context),
    'denied, expired, replayed',
  );
  expect(indeterminate.state.calls).toBe(1);
});

test('fails closed for audit loss and consumes stale state without a provider mutation', async () => {
  const before = createFixture({ auditFailsFor: 'intent' });
  await prepareAsync(before.registry);
  await rejectsAsync(
    before.registry.executeAsync('fixture.write', approvalInput, context),
    'durable audit',
  );
  expect(before.state.calls).toBe(0);

  const after = createFixture({ auditFailsFor: 'executed' });
  await prepareAsync(after.registry);
  await rejectsAsync(
    after.registry.executeAsync('fixture.write', approvalInput, context),
    'durable audit',
  );
  expect(after.state.calls).toBe(1);

  const stale = createFixture({ stateMatches: false });
  await prepareAsync(stale.registry);
  await rejectsAsync(
    stale.registry.executeAsync('fixture.write', approvalInput, context),
    'state no longer matches',
  );
  expect(stale.state.calls).toBe(0);
  await rejectsAsync(
    stale.registry.executeAsync('fixture.write', approvalInput, context),
    'denied, expired, replayed',
  );
});

test('fails closed for absent or malformed host configuration', async () => {
  expect(await loadMcpHostAsync({ env: {} })).toBeUndefined();
  await rejectsAsync(
    loadMcpHostAsync({ env: { ANKH_MCP_HOST_MODULE: './host.mjs' } }),
    'must be an absolute local path',
  );
  await rejectsAsync(
    loadMcpHostAsync({ env: { ANKH_MCP_HOST_MODULE: '/definitely/not/a/host.mjs' } }),
    'ENOENT',
  );
});

test('reserves the public prepare and execute suffixes from provider tool identifiers', () => {
  const readTool = {
    description: 'Read.',
    executeAsync: () => Promise.resolve({ ok: true }),
    inputSchema: { additionalProperties: false, type: 'object' } as const,
    risk: 'read' as const,
    scope: 'global' as const,
    title: 'Read',
  };
  expect(() =>
    createMcpRegistry({
      integrations: [{ id: 'fixture', tools: [{ ...readTool, id: 'write.prepare' }] }],
    }),
  ).toThrow('reserved write lifecycle suffix');
  expect(() =>
    createMcpRegistry({
      integrations: [{ id: 'fixture', tools: [{ ...readTool, id: 'write.execute' }] }],
    }),
  ).toThrow('reserved write lifecycle suffix');
});
