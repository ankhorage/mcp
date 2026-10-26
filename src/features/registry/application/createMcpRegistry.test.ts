import { expect, test } from 'bun:test';

import { createMcpRegistry } from './createMcpRegistry.js';

const readIntegration = {
  id: 'example',
  tools: [
    {
      accountId: (input: Readonly<Record<string, unknown>>) => input.accountId as string,
      description: 'Read one account.',
      executeAsync: () => Promise.resolve({ ok: true }),
      id: 'read',
      inputSchema: {
        properties: { accountId: { type: 'string' } },
        required: ['accountId'],
        type: 'object',
      } as const,
      risk: 'read' as const,
      title: 'Read',
    },
  ],
};

test('rejects an account outside the invocation scope', () => {
  const registry = createMcpRegistry({ integrations: [readIntegration] });
  return expect(
    registry.executeAsync(
      'example.read',
      { accountId: 'other' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
  ).rejects.toThrow('account-not-allowed');
});

test('never executes writes without external approval', () => {
  const [readTool] = readIntegration.tools;
  if (readTool === undefined) throw new Error('read fixture is missing');
  const registry = createMcpRegistry({
    integrations: [{ ...readIntegration, tools: [{ ...readTool, id: 'write', risk: 'write' }] }],
  });
  return expect(
    registry.executeAsync(
      'example.write',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
  ).rejects.toThrow('externally issued');
});
