import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

/*** Add one installed provider package to the explicit workspace MCP configuration. */
export async function add(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  const [packageName] = request.argv;
  if (packageName === undefined || !isPackageName(packageName)) {
    request.context.writeStderr('Usage: ankh mcp add <package>\n');
    return { exitCode: 2 };
  }
  const configPath = join(request.context.cwd, '.ankh', 'mcp.json');
  const configured = await readPackagesAsync(configPath);
  const packages = [...new Set([...configured, packageName])].toSorted();
  await mkdir(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify({ packages }, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, configPath);
  request.context.writeStdout(`${packageName}\n`);
  return { exitCode: 0 };
}

/*** Read only the small explicit provider configuration shape. */
async function readPackagesAsync(configPath: string): Promise<readonly string[]> {
  try {
    const value: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    if (
      typeof value !== 'object' ||
      value === null ||
      !Array.isArray((value as { packages?: unknown }).packages)
    )
      throw new Error('invalid configuration');
    return (value as { packages: unknown[] }).packages.filter(
      (candidate): candidate is string => typeof candidate === 'string' && isPackageName(candidate),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`Invalid MCP configuration: ${configPath}`, { cause: error });
  }
}

/*** Permit package identifiers only, never path-like provider targets. */
function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
}
