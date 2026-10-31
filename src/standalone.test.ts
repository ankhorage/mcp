import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

const repositoryRoot = dirname(import.meta.dir);

test('accepts the packed package through independent Node, Bun, MCP, Ankh, and security consumers', async () => {
  await assertCapabilityMaterializationAsync();
  const consumer = await createPackedConsumerAsync();
  try {
    await assertExportsAsync(consumer);
    await assertNodeDiscoveryAsync(consumer);
    await assertAnkhCliAsync(consumer);
    await assertMcpStdioAsync(consumer);
    await assertMcpServeAccountScopeAsync(consumer);
    await assertSecurityAsync(consumer);
  } finally {
    await rm(consumer, { force: true, recursive: true });
  }
}, 30_000);

async function assertCapabilityMaterializationAsync(): Promise<void> {
  await runCommandAsync(
    ['bunx', '--bun', '--no-install', 'ankhorage-repository', 'package', 'sync', '.'],
    repositoryRoot,
  );
  await runCommandAsync(
    ['bunx', '--bun', '--no-install', 'ankhorage-repository', 'package', 'status', '.'],
    repositoryRoot,
  );
}

async function createPackedConsumerAsync(): Promise<string> {
  const temporaryDirectory = getTemporaryDirectory();
  await mkdir(temporaryDirectory, { recursive: true });
  const consumer = await mkdtemp(join(temporaryDirectory, 'ankhorage-mcp-consumer-'));
  let artifact: string | undefined;
  try {
    await runCommandAsync(['bun', 'pm', 'pack'], repositoryRoot);
    const artifacts = (await readdir(repositoryRoot)).filter((entry) => entry.endsWith('.tgz'));
    if (artifacts.length !== 1 || artifacts[0] === undefined)
      throw new Error('Expected bun pm pack to produce exactly one package artifact.');
    artifact = join(repositoryRoot, artifacts[0]);
    const packageJson = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    await writeFile(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          dependencies: {
            '@ankhorage/ankh': packageJson.dependencies['@ankhorage/ankh'],
            '@ankhorage/mcp': `file:${artifact}`,
            '@modelcontextprotocol/sdk': packageJson.dependencies['@modelcontextprotocol/sdk'],
          },
          name: 'packed-mcp-consumer',
          private: true,
          type: 'module',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await runCommandAsync(['bun', 'install'], consumer);
    await writeProviderFixtureAsync(consumer);
    return consumer;
  } catch (error) {
    await rm(consumer, { force: true, recursive: true });
    throw error;
  } finally {
    if (artifact !== undefined) await rm(artifact, { force: true });
  }
}

async function assertExportsAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'exports.mjs'),
    "import { isDeepStrictEqual } from 'node:util';\n" +
      "import * as mcp from '@ankhorage/mcp';\n" +
      "import { CAPABILITIES } from '@ankhorage/mcp/capabilities';\n" +
      "import provider from '@ankhorage/mcp/cli';\n" +
      "import manifest from '@ankhorage/mcp/package.json' with { type: 'json' };\n" +
      "if (typeof mcp.createMcpRegistry !== 'function' || typeof mcp.createMcpStdioServerAsync !== 'function' || typeof mcp.discoverMcpIntegrationsAsync !== 'function') throw new Error('missing public export');\n" +
      "if (!isDeepStrictEqual(CAPABILITIES, manifest.ankh.capabilities) || !isDeepStrictEqual(provider.capabilities, CAPABILITIES)) throw new Error('capability catalogs are not synchronized');\n" +
      "if (provider.version !== manifest.version) throw new Error('CLI provider version is not synchronized with package metadata');\n",
    'utf8',
  );
  await runCommandAsync(['node', 'exports.mjs'], consumer);
  await runCommandAsync(['bun', 'exports.mjs'], consumer);
  const installedManifest = await readFile(
    join(consumer, 'node_modules', '@ankhorage', 'mcp', 'package.json'),
    'utf8',
  );
  expect(installedManifest).not.toContain('workspace:');
  expect(installedManifest).not.toContain('file:');
}

async function assertNodeDiscoveryAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'node-discovery.mjs'),
    "import { discoverMcpIntegrationsAsync } from '@ankhorage/mcp';\n" +
      "const integrations = await discoverMcpIntegrationsAsync({ cwd: process.cwd(), packageNames: ['@fixture/provider'] });\n" +
      "if (integrations.length !== 1 || integrations[0]?.id !== 'fixture') throw new Error('Node ESM consumer discovery failed');\n",
    'utf8',
  );
  await runCommandAsync(['node', 'node-discovery.mjs'], consumer);
}

async function assertAnkhCliAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'ankh-cli.mjs'),
    "import { discoverAnkhPackages, runCli } from '@ankhorage/ankh';\n" +
      'const output = []; const errors = [];\n' +
      "const context = { cwd: process.cwd(), env: process.env, version: 'test', writeStdout: (text) => output.push(text), writeStderr: (text) => errors.push(text) };\n" +
      'const options = { context, discoverPackages: discoverAnkhPackages };\n' +
      "for (const argv of [['mcp', 'add', '@fixture/provider'], ['mcp', 'list'], ['mcp', 'doctor']]) { const result = await runCli(argv, options); if (result.exitCode !== 0) throw new Error(errors.join('')); }\n" +
      "if (!output.join('').includes('@fixture/provider') || !output.join('').includes('fixture')) throw new Error('Ankh provider discovery or dispatch failed');\n",
    'utf8',
  );
  await runCommandAsync(['bun', 'ankh-cli.mjs'], consumer);
}

async function assertMcpStdioAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'mcp-server.mjs'),
    "import { createHash } from 'node:crypto';\n" +
      "import { createMcpStdioServerAsync, discoverMcpIntegrationsAsync } from '@ankhorage/mcp';\n" +
      "const integrations = await discoverMcpIntegrationsAsync({ cwd: process.cwd(), packageNames: ['@fixture/provider'] });\n" +
      "const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])) : value; let proposal; let consumed = false; const fingerprint = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); const preparedWriteStore = { createPreparedWriteAsync: async (value) => { proposal = value; return { approvalId: 'approval', expiresAt: '2026-11-01T00:00:00.000Z', proposal: value, snapshotFingerprint: fingerprint(value) }; }, claimApprovedWriteAndCreateIntentAsync: async ({ approvalId, toolId }) => { if (consumed || approvalId !== 'approval' || toolId !== 'fixture.write') return null; consumed = true; return { approvalId, expiresAt: '2026-11-01T00:00:00.000Z', proposal, snapshotFingerprint: fingerprint(proposal), executionClaim: { approvalId, intentId: 'intent' } }; } };\n" +
      "await createMcpStdioServerAsync({ auditSink: { recordAsync: async () => {} }, context: { actorId: 'acceptance', allowedAccounts: ['allowed'] }, integrations, preparedWriteStore, version: 'test' });\n",
    'utf8',
  );
  await writeFile(
    join(consumer, 'mcp-client.mjs'),
    "import { Client } from '@modelcontextprotocol/sdk/client/index.js';\n" +
      "import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';\n" +
      "const transport = new StdioClientTransport({ command: 'bun', args: ['mcp-server.mjs'], cwd: process.cwd(), stderr: 'pipe' });\n" +
      'const protocolErrors = []; transport.onerror = (error) => protocolErrors.push(String(error));\n' +
      "const client = new Client({ name: 'acceptance-client', version: '1.0.0' }, { capabilities: {} });\n" +
      "await client.connect(transport); const tools = await client.listTools(); const result = await client.callTool({ name: 'fixture.echo', arguments: {} }); const prepared = await client.callTool({ name: 'fixture.write.prepare', arguments: {} }); const executed = await client.callTool({ name: 'fixture.write.execute', arguments: { approvalId: 'approval' } }); await client.close();\n" +
      "if (tools.tools.length !== 4 || !['fixture.echo', 'fixture.write.prepare', 'fixture.write.execute'].every((name) => tools.tools.some((tool) => tool.name === name)) || result.content[0]?.text !== '{\\\"ok\\\":true}' || prepared.content[0]?.text !== '{\\\"approvalId\\\":\\\"approval\\\",\\\"expiresAt\\\":\\\"2026-11-01T00:00:00.000Z\\\"}' || executed.content[0]?.text !== '{\\\"ok\\\":true}' || protocolErrors.length !== 0) throw new Error('MCP STDIO prepared-write protocol acceptance failed');\n",
    'utf8',
  );
  await runCommandAsync(['bun', 'mcp-client.mjs'], consumer);
}

async function assertMcpServeAccountScopeAsync(consumer: string): Promise<void> {
  await mkdir(join(consumer, '.ankh'), { recursive: true });
  await writeFile(
    join(consumer, '.ankh', 'mcp.json'),
    '{"allowedAccounts":["allowed"],"packages":["@fixture/provider"]}\n',
    'utf8',
  );
  await writeFile(
    join(consumer, 'ankh-serve.mjs'),
    "import { discoverAnkhPackages, runCli } from '@ankhorage/ankh';\n" +
      "const context = { cwd: process.cwd(), env: process.env, version: 'test', writeStdout: () => {}, writeStderr: () => {} };\n" +
      "process.exitCode = (await runCli(['mcp', 'serve'], { context, discoverPackages: discoverAnkhPackages })).exitCode;\n",
    'utf8',
  );
  await writeFile(
    join(consumer, 'mcp-serve-client.mjs'),
    "import { Client } from '@modelcontextprotocol/sdk/client/index.js';\n" +
      "import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';\n" +
      "const client = new Client({ name: 'acceptance-client', version: '1.0.0' }, { capabilities: {} });\n" +
      "await client.connect(new StdioClientTransport({ command: 'bun', args: ['ankh-serve.mjs'], cwd: process.cwd(), stderr: 'pipe' }));\n" +
      "const allowed = await client.callTool({ name: 'fixture.account-read', arguments: { accountId: 'allowed' } }); const denied = await client.callTool({ name: 'fixture.account-read', arguments: { accountId: 'other' } }); await client.close();\n" +
      "if (allowed.isError || allowed.content[0]?.text !== '{\\\"accountId\\\":\\\"allowed\\\"}' || !denied.isError || !denied.content[0]?.text?.includes('account-not-allowed')) throw new Error('CLI account scope acceptance failed');\n",
    'utf8',
  );
  await runCommandAsync(['bun', 'mcp-serve-client.mjs'], consumer);
}

async function assertSecurityAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'security.mjs'),
    "import { createMcpRegistry } from '@ankhorage/mcp';\n" +
      "const context = { actorId: 'acceptance', allowedAccounts: ['allowed'] }; const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value; let proposal; let consumed = false; let calls = 0;\n" +
      "const tool = { id: 'write', title: 'Write', description: 'Write fixture', risk: 'write', scope: 'account', accountId: () => 'allowed', inputSchema: { type: 'object', additionalProperties: false }, prepareWriteAsync: async () => ({ change: { resourceId: 'fixture', before: {}, after: {} }, createdAt: '2026-10-31T00:00:00.000Z', fingerprint: 'fixture', operation: 'write', payload: { version: '1', serialized: '{}' } }), verifyPreparedWriteAsync: async () => true, executePreparedWriteAsync: async () => ({ calls: ++calls }) };\n" +
      "const fingerprint = async (value) => (await import('node:crypto')).createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); const store = { createPreparedWriteAsync: async (value) => { proposal = value; return { approvalId: 'approval', expiresAt: '2026-11-01T00:00:00.000Z', proposal: value, snapshotFingerprint: await fingerprint(value) }; }, claimApprovedWriteAndCreateIntentAsync: async ({ approvalId, toolId }) => { if (consumed || approvalId !== 'approval' || toolId !== 'fixture.write') return null; consumed = true; return { approvalId, expiresAt: '2026-11-01T00:00:00.000Z', proposal, snapshotFingerprint: await fingerprint(proposal), executionClaim: { approvalId, intentId: 'intent' } }; } };\n" +
      "const registry = createMcpRegistry({ auditSink: { recordAsync: async () => {} }, integrations: [{ id: 'fixture', tools: [tool] }], preparedWriteStore: store }); await registry.prepareWriteAsync('fixture.write', {}, context); const result = await registry.executeAsync('fixture.write', { approvalId: 'approval' }, context); if (result.calls !== 1 || calls !== 1) throw new Error('prepared write acceptance failed');\n",
    'utf8',
  );
  await runCommandAsync(['bun', 'security.mjs'], consumer);
}

async function writeProviderFixtureAsync(consumer: string): Promise<void> {
  const providerDirectory = join(consumer, 'node_modules', '@fixture', 'provider');
  await mkdir(providerDirectory, { recursive: true });
  await writeFile(
    join(providerDirectory, 'package.json'),
    '{"name":"@fixture/provider","type":"module","exports":{"./mcp":{"import":"./mcp.js"}}}\n',
    'utf8',
  );
  await writeFile(
    join(providerDirectory, 'mcp.js'),
    "export const integration = { id: 'fixture', tools: [{ id: 'echo', title: 'Echo', description: 'Echo fixture', risk: 'read', scope: 'global', inputSchema: { type: 'object', additionalProperties: false }, executeAsync: async () => ({ ok: true }) }, { id: 'account-read', title: 'Account read', description: 'Read account fixture', risk: 'read', scope: 'account', accountId: (input) => typeof input.accountId === 'string' ? input.accountId : null, inputSchema: { type: 'object', required: ['accountId'], properties: { accountId: { type: 'string' } }, additionalProperties: false }, executeAsync: async (input) => ({ accountId: input.accountId }) }, { id: 'write', title: 'Write', description: 'Write fixture', risk: 'write', scope: 'account', accountId: () => 'allowed', inputSchema: { type: 'object', additionalProperties: false }, prepareWriteAsync: async () => ({ change: { resourceId: 'fixture', before: {}, after: { enabled: true } }, createdAt: '2026-10-31T00:00:00.000Z', fingerprint: 'fixture', operation: 'write', payload: { version: '1', serialized: '{\\\"enabled\\\":true}' } }), verifyPreparedWriteAsync: async () => true, executePreparedWriteAsync: async () => ({ ok: true }) }] };\n",
    'utf8',
  );
}

async function runCommandAsync(command: readonly string[], cwd: string): Promise<void> {
  const temporaryDirectory = getTemporaryDirectory();
  await mkdir(temporaryDirectory, { recursive: true });
  const child = Bun.spawn([...command], {
    cwd,
    env: { ...process.env, TMPDIR: temporaryDirectory },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`${command.join(' ')} failed: ${stdout}${stderr}`);
}

function getTemporaryDirectory(): string {
  return process.env.MCP_ACCEPTANCE_TMPDIR ?? join(homedir(), '.cache', 'ankhorage-mcp-acceptance');
}
