import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

import { readMcpConfigurationAsync } from '../../features/config/application/readMcpConfigurationAsync.js';

/*** Add one installed provider package to the explicit workspace MCP configuration. */
export async function add(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  const [packageName] = request.argv;
  if (packageName === undefined || !isPackageName(packageName)) {
    request.context.writeStderr('Usage: ankh mcp add <package>\n');
    return { exitCode: 2 };
  }
  const configuration = await readMcpConfigurationAsync(request.context.cwd);
  const configPath = join(request.context.cwd, '.ankh', 'mcp.json');
  const packages = [...new Set([...(configuration.packages ?? []), packageName])].toSorted();
  await mkdir(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ ...configuration, packages }, null, 2)}\n`,
    'utf8',
  );
  await rename(temporaryPath, configPath);
  request.context.writeStdout(`${packageName}\n`);
  return { exitCode: 0 };
}

/*** Permit package identifiers only, never path-like provider targets. */
function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
}
