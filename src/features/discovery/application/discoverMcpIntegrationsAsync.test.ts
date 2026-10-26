import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { discoverMcpIntegrationsAsync } from './discoverMcpIntegrationsAsync.js';

test('discovers an independent ESM provider through an import-only ./mcp export', async () => {
  const consumer = await createConsumerAsync({
    '@fixture/provider': `export const integration = { id: 'fixture', tools: [] };`,
  });
  expect(
    await discoverMcpIntegrationsAsync({ cwd: consumer, packageNames: ['@fixture/provider'] }),
  ).toEqual([{ id: 'fixture', tools: [] }]);
});

test('closes initialized providers when later discovery fails', async () => {
  const consumer = await createConsumerAsync({
    '@fixture/first': `export const integration = { id: 'first', tools: [], closeAsync: () => { process.env.MCP_DISCOVERY_CLOSED = 'yes'; return Promise.resolve(); } };`,
    '@fixture/z-failing': `throw new Error('initialization failed');`,
  });
  delete process.env.MCP_DISCOVERY_CLOSED;
  const error = await discoverMcpIntegrationsAsync({
    cwd: consumer,
    packageNames: ['@fixture/first', '@fixture/z-failing'],
  }).then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(
    'MCP provider initialization module could not be imported',
  );
  expect(String(process.env.MCP_DISCOVERY_CLOSED)).toBe('yes');
});

async function createConsumerAsync(providers: Readonly<Record<string, string>>): Promise<string> {
  const consumer = await mkdtemp(join(tmpdir(), 'ankhorage-mcp-discovery-'));
  await writeFile(join(consumer, 'package.json'), '{"type":"module"}');
  for (const [packageName, moduleSource] of Object.entries(providers)) {
    const providerDirectory = join(consumer, 'node_modules', ...packageName.split('/'));
    await mkdir(providerDirectory, { recursive: true });
    await writeFile(
      join(providerDirectory, 'package.json'),
      '{"name":"' + packageName + '","type":"module","exports":{"./mcp":{"import":"./mcp.js"}}}',
    );
    await writeFile(join(providerDirectory, 'mcp.js'), moduleSource);
  }
  return consumer;
}
