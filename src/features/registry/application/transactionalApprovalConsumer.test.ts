import { expect, test } from 'bun:test';

import { createMcpRegistry } from './createMcpRegistry.js';

const context = { actorId: 'test', allowedAccounts: ['allowed'] };

/** Build the smallest account-scoped write tool for trusted approval boundary tests. */
function createWriteTool(input: { readonly stateMatches: boolean }) {
  return {
    accountId: (arguments_: Readonly<Record<string, unknown>>) =>
      typeof arguments_.accountId === 'string' ? arguments_.accountId : null,
    approvalFingerprintAsync: () => Promise.resolve('canonical-proposal-fingerprint'),
    description: 'Write one account.',
    describeChangeAsync: () =>
      Promise.resolve({
        after: { status: 'PAUSED' },
        before: { status: 'ENABLED' },
        resourceId: '7',
      }),
    executeAsync: (
      _input: Readonly<Record<string, unknown>>,
      executionContext: { readonly consumedApproval?: { readonly approvalId: string } },
    ) => Promise.resolve({ approvalId: executionContext.consumedApproval?.approvalId }),
    id: 'write',
    inputSchema: {
      additionalProperties: false,
      properties: { accountId: { type: 'string' as const } },
      required: ['accountId'],
      type: 'object' as const,
    },
    risk: 'write' as const,
    scope: 'account' as const,
    title: 'Write',
    verifyExpectedStateAsync: () => Promise.resolve(input.stateMatches),
  };
}

/** Create one registry whose write is explicitly bound by the trusted host. */
function createTransactionalRegistry(input: { readonly stateMatches: boolean }) {
  let consumerCalls = 0;
  const registry = createMcpRegistry({
    auditSink: { recordAsync: () => Promise.resolve() },
    integrations: [{ id: 'example', tools: [createWriteTool(input)] }],
    transactionalApprovalConsumers: [
      {
        consumeApprovalAndCreateIntentAsync: (proposal) => {
          consumerCalls += 1;
          return Promise.resolve(
            proposal.fingerprint === 'canonical-proposal-fingerprint' && consumerCalls === 1
              ? { approvalId: 'approval-1' }
              : null,
          );
        },
        toolIds: ['example.write'],
      },
    ],
  });
  return { getConsumerCalls: () => consumerCalls, registry };
}

test('delegates a host-selected write to one transactional consumer exactly once', async () => {
  const transactional = createTransactionalRegistry({ stateMatches: true });
  const execute = () =>
    transactional.registry.executeAsync('example.write', { accountId: 'allowed' }, context);
  const [first, second] = await Promise.allSettled([execute(), execute()]);
  expect(first.status === 'fulfilled' || second.status === 'fulfilled').toBe(true);
  expect(first.status === 'rejected' || second.status === 'rejected').toBe(true);
  expect(transactional.getConsumerCalls()).toBe(2);
});

test('fails closed before transactional consumption for stale state and wrong accounts', () => {
  const transactional = createTransactionalRegistry({ stateMatches: false });
  return Promise.all([
    assertFailureAsync(
      transactional.registry.executeAsync('example.write', { accountId: 'allowed' }, context),
      'provider state no longer matches',
    ),
    assertFailureAsync(
      transactional.registry.executeAsync('example.write', { accountId: 'other' }, context),
      'account-not-allowed',
    ),
  ]).then(() => expect(transactional.getConsumerCalls()).toBe(0));
});

test('rejects read-tool and absent-host transactional authorization', () => {
  const readTool = {
    ...createWriteTool({ stateMatches: true }),
    id: 'read',
    risk: 'read' as const,
  };
  expect(() =>
    createMcpRegistry({
      integrations: [{ id: 'example', tools: [readTool] }],
      transactionalApprovalConsumers: [
        {
          consumeApprovalAndCreateIntentAsync: () => Promise.resolve({ approvalId: 'approval-1' }),
          toolIds: ['example.read'],
        },
      ],
    }),
  ).toThrow('Invalid transactional approval consumer tool');
  const registry = createMcpRegistry({
    integrations: [{ id: 'example', tools: [createWriteTool({ stateMatches: true })] }],
  });
  return expect(
    registry.executeAsync('example.write', { accountId: 'allowed' }, context),
  ).rejects.toThrow('externally issued');
});

/** Assert the deterministic rejection message of one asynchronous MCP invocation. */
async function assertFailureAsync(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    expect(error.message).toContain(message);
    return;
  }
  throw new Error('Expected MCP invocation to fail.');
}
