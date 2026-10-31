import { expect, test } from 'bun:test';

import { loadMcpHostAsync } from '../../host/application/loadMcpHostAsync.js';
import { createMcpRegistry } from './createMcpRegistry.js';

/** Assert lifecycle host loading fails closed without disclosing implementation failures. */
async function rejectsAsync(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect((error as Error).message).toContain(expected);
    return;
  }
  throw new Error('Expected rejection.');
}

test('fails closed for absent or malformed lifecycle host configuration', async () => {
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

test('reserves lifecycle tool suffixes from provider tool identifiers', () => {
  const readTool = {
    description: 'Read.',
    executeAsync: () => Promise.resolve({ ok: true }),
    inputSchema: { additionalProperties: false, type: 'object' } as const,
    risk: 'read' as const,
    scope: 'global' as const,
    title: 'Read',
  };
  for (const id of ['write.prepare', 'write.execute'])
    expect(() =>
      createMcpRegistry({ integrations: [{ id: 'fixture', tools: [{ ...readTool, id }] }] }),
    ).toThrow('reserved write lifecycle suffix');
});
