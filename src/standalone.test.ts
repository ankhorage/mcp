import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

const repositoryRoot = dirname(import.meta.dir);

test('accepts the packed package through independent Node, Bun, MCP, Ankh, and security consumers', async () => {
  const consumer = await createPackedConsumerAsync();
  try {
    await assertExportsAsync(consumer);
    await assertAnkhCliAsync(consumer);
    await assertMcpStdioAsync(consumer);
    await assertSecurityAsync(consumer);
  } finally {
    await rm(consumer, { force: true, recursive: true });
  }
});

async function createPackedConsumerAsync(): Promise<string> {
  const consumer = await mkdtemp('/private/tmp/ankhorage-mcp-consumer-');
  const artifact = join(repositoryRoot, 'ankhorage-mcp-0.1.0.tgz');
  try {
    await runCommandAsync(['bun', 'pm', 'pack'], repositoryRoot);
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
    await rm(artifact, { force: true });
  }
}

async function assertExportsAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'exports.mjs'),
    "import * as mcp from '@ankhorage/mcp';\n" +
      "if (typeof mcp.createMcpRegistry !== 'function' || typeof mcp.createMcpStdioServerAsync !== 'function' || typeof mcp.discoverMcpIntegrationsAsync !== 'function') throw new Error('missing public export');\n",
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
    "import { createMcpStdioServerAsync, discoverMcpIntegrationsAsync } from '@ankhorage/mcp';\n" +
      "const integrations = await discoverMcpIntegrationsAsync({ cwd: process.cwd(), packageNames: ['@fixture/provider'] });\n" +
      "await createMcpStdioServerAsync({ context: { actorId: 'acceptance', allowedAccounts: [] }, integrations, version: 'test' });\n",
    'utf8',
  );
  await writeFile(
    join(consumer, 'mcp-client.mjs'),
    "import { Client } from '@modelcontextprotocol/sdk/client/index.js';\n" +
      "import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';\n" +
      "const transport = new StdioClientTransport({ command: 'bun', args: ['mcp-server.mjs'], cwd: process.cwd(), stderr: 'pipe' });\n" +
      'const protocolErrors = []; transport.onerror = (error) => protocolErrors.push(String(error));\n' +
      "const client = new Client({ name: 'acceptance-client', version: '1.0.0' }, { capabilities: {} });\n" +
      "await client.connect(transport); const tools = await client.listTools(); const result = await client.callTool({ name: 'fixture.echo', arguments: {} }); await client.close();\n" +
      "if (tools.tools.length !== 1 || tools.tools[0].name !== 'fixture.echo' || result.content[0]?.text !== '{\\\"ok\\\":true}' || protocolErrors.length !== 0) throw new Error('MCP STDIO protocol acceptance failed');\n",
    'utf8',
  );
  await runCommandAsync(['bun', 'mcp-client.mjs'], consumer);
}

async function assertSecurityAsync(consumer: string): Promise<void> {
  await writeFile(
    join(consumer, 'security.mjs'),
    "import { createMcpRegistry } from '@ankhorage/mcp';\n" +
      "const secret = 'acceptance-secret'; const context = { actorId: 'acceptance', allowedAccounts: ['allowed'], approvalToken: 'approval' };\n" +
      "const tool = { id: 'write', title: 'Write', description: 'Write fixture', risk: 'write', scope: 'account', accountId: (input) => typeof input.accountId === 'string' ? input.accountId : null, inputSchema: { type: 'object', required: ['accountId'], properties: { accountId: { type: 'string' } }, additionalProperties: false }, describeChangeAsync: async () => ({ resourceId: 'fixture', before: {}, after: {} }), verifyExpectedStateAsync: async () => true, executeAsync: async () => { throw new Error(secret); } };\n" +
      "const execute = async (verifier, invocationContext = context) => createMcpRegistry({ auditSink: { recordAsync: async () => { throw new Error(secret); } }, integrations: [{ id: 'fixture', tools: [tool] }], ...(verifier === undefined ? {} : { approvalVerifier: verifier }) }).executeAsync('fixture.write', { accountId: 'allowed' }, invocationContext);\n" +
      "const expectFailure = async (promise, message) => { try { await promise; throw new Error('expected rejection'); } catch (error) { if (!(error instanceof Error) || !error.message.includes(message) || error.message.includes(secret)) throw error; } };\n" +
      "await expectFailure(execute(undefined), 'externally issued');\n" +
      "await expectFailure(execute({ verifyAndConsumeAsync: async () => true }, { ...context, allowedAccounts: [] }), 'account-not-allowed');\n" +
      "await expectFailure(execute({ verifyAndConsumeAsync: async (_proposal, token) => token !== 'invalid' }, { ...context, approvalToken: 'invalid' }), 'denied, expired, replayed');\n" +
      "await expectFailure(execute({ verifyAndConsumeAsync: async (_proposal, token) => token !== 'expired' }, { ...context, approvalToken: 'expired' }), 'denied, expired, replayed');\n" +
      'let consumed = false; const replayVerifier = { verifyAndConsumeAsync: async () => { if (consumed) return false; consumed = true; return true; } };\n' +
      "await expectFailure(execute(replayVerifier), 'MCP tool execution failed.'); await expectFailure(execute(replayVerifier), 'denied, expired, replayed');\n",
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
    "export const integration = { id: 'fixture', tools: [{ id: 'echo', title: 'Echo', description: 'Echo fixture', risk: 'read', scope: 'global', inputSchema: { type: 'object', additionalProperties: false }, executeAsync: async () => ({ ok: true }) }] };\n",
    'utf8',
  );
}

async function runCommandAsync(command: readonly string[], cwd: string): Promise<void> {
  const temporaryDirectory = '/private/tmp/ankhorage-mcp-command-temp';
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
