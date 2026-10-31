import { expect, test } from 'bun:test';

import type {
  McpPreparedWriteProposal,
  McpPreparedWriteStore,
  McpWriteTool,
} from '../../../types/public.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpRegistry } from './createMcpRegistry.js';

const context = { actorId: 'operator', allowedAccounts: ['account'] };

/** Test the persisted proposal lifecycle with an atomic in-memory host fake. */
function createFixture(change?: (proposal: McpPreparedWriteProposal) => McpPreparedWriteProposal) {
  const state = {
    calls: 0,
    consumed: false,
    proposal: undefined as McpPreparedWriteProposal | undefined,
  };
  const store = createStore(state, change);
  const registry = createMcpRegistry({
    auditSink: { recordAsync: () => Promise.resolve() },
    integrations: [{ id: 'example', tools: [createTool(state)] }],
    preparedWriteStore: store,
  });
  return { registry, state };
}

/** Return an atomic host store that consumes each externally approved ID only once. */
function createStore(
  state: { calls: number; consumed: boolean; proposal: McpPreparedWriteProposal | undefined },
  change: ((proposal: McpPreparedWriteProposal) => McpPreparedWriteProposal) | undefined,
): McpPreparedWriteStore {
  return {
    createPreparedWriteAsync: (proposal) => {
      state.proposal = change?.(proposal) ?? proposal;
      return Promise.resolve(stored(state.proposal));
    },
    claimApprovedWriteAndCreateIntentAsync: ({ approvalId, toolId }) => {
      const { proposal } = state;
      if (state.consumed || approvalId !== 'approval' || proposal?.toolId !== toolId)
        return Promise.resolve(null);
      state.consumed = true;
      return Promise.resolve({
        ...stored(proposal),
        executionClaim: { approvalId, intentId: 'intent' },
      });
    },
  };
}

/** Return the exact immutable persistence envelope expected from the trusted host. */
function stored(proposal: McpPreparedWriteProposal) {
  return {
    approvalId: 'approval',
    expiresAt: '2026-11-01T00:00:00.000Z',
    proposal,
    snapshotFingerprint: createMcpApprovalFingerprint(proposal),
  };
}

/** Build a fake write provider that records every irreversible execution. */
function createTool(state: { calls: number }): McpWriteTool {
  return {
    accountId: () => 'account',
    description: 'Write.',
    executePreparedWriteAsync: (proposal) => {
      state.calls += 1;
      return Promise.resolve({ payload: proposal.payload.serialized });
    },
    id: 'write',
    inputSchema: { additionalProperties: false, type: 'object' },
    prepareWriteAsync: () => Promise.resolve(prepared()),
    risk: 'write',
    scope: 'account',
    title: 'Write',
    verifyPreparedWriteAsync: () => Promise.resolve(true),
  };
}

/** Return provider-authored proposal data before the runtime attaches caller and tool identity. */
function prepared() {
  return {
    change: { after: { state: 'after' }, before: { state: 'before' }, resourceId: 'resource' },
    createdAt: '2026-10-31T00:00:00.000Z',
    fingerprint: 'provider-fingerprint',
    operation: 'pause',
    payload: { serialized: '{"original":true}', version: '1' },
  };
}

/** Assert the deterministic fail-closed result from an asynchronous request. */
async function rejectAsync(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error('Expected rejection.');
}

test('persists and executes the original proposal with an approval ID only', async () => {
  const { registry, state } = createFixture();
  await registry.prepareWriteAsync('example.write', {}, context);
  expect(state.proposal).toEqual({
    ...prepared(),
    accountId: 'account',
    actorId: 'operator',
    toolId: 'example.write',
  });
  expect(await registry.executeAsync('example.write', { approvalId: 'approval' }, context)).toEqual(
    { payload: '{"original":true}' },
  );
  await rejectAsync(
    registry.executeAsync('example.write', { approvalId: 'approval' }, context),
    'denied, expired, replayed',
  );
  expect(state.calls).toBe(1);
});

test('rejects tampered persistence and caller-supplied proposal fields', async () => {
  const changed = createFixture((proposal) => ({ ...proposal, createdAt: 'changed' }));
  await rejectAsync(
    changed.registry.prepareWriteAsync('example.write', {}, context),
    'did not preserve the original proposal',
  );
  const fixture = createFixture();
  await fixture.registry.prepareWriteAsync('example.write', {}, context);
  await rejectAsync(
    registryExecute(fixture.registry, { approvalId: 'approval', operation: 'resume' }),
    'accepts only an approvalId',
  );
  await rejectAsync(
    registryExecute(fixture.registry, { approvalId: 'approval', resourceId: 'other' }),
    'accepts only an approvalId',
  );
});

/** Invoke the sole caller-facing write input shape. */
function registryExecute(
  registry: ReturnType<typeof createMcpRegistry>,
  input: Record<string, unknown>,
) {
  return registry.executeAsync('example.write', input, context);
}
