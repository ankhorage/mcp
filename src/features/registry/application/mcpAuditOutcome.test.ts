import { expect, test } from 'bun:test';

import { createMcpRegistry } from './createMcpRegistry.js';

test('records a provider-reported indeterminate write without claiming execution', async () => {
  const outcomes: string[] = [];
  const registry = createMcpRegistry({
    approvalVerifier: { verifyAndConsumeAsync: () => Promise.resolve(true) },
    auditSink: {
      recordAsync: (event) => {
        outcomes.push(event.outcome);
        return Promise.resolve();
      },
    },
    integrations: [
      {
        id: 'google-ads',
        tools: [
          {
            accountId: (input) => (typeof input.accountId === 'string' ? input.accountId : null),
            auditOutcome: (output) =>
              (output as { readonly outcome?: unknown }).outcome === 'indeterminate'
                ? 'indeterminate'
                : 'executed',
            describeChangeAsync: () =>
              Promise.resolve({ after: {}, before: {}, resourceId: 'customers/1/campaigns/2' }),
            description: 'Mutate Google Ads.',
            executeAsync: () =>
              Promise.resolve({
                outcome: 'indeterminate',
                reason: 'Provider write is unverified.',
              }),
            id: 'mutation',
            inputSchema: {
              properties: { accountId: { type: 'string' } },
              required: ['accountId'],
              type: 'object',
            },
            risk: 'write',
            scope: 'account',
            title: 'Mutate Google Ads',
            verifyExpectedStateAsync: () => Promise.resolve(true),
          },
        ],
      },
    ],
  });
  await registry.executeAsync(
    'google-ads.mutation',
    { accountId: 'allowed' },
    { actorId: 'test', allowedAccounts: ['allowed'] },
  );
  expect(outcomes).toEqual(['intent', 'indeterminate']);
});
