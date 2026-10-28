import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

/*** List explicitly configured provider packages without importing them. */
export async function list(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  const configPath = join(request.context.cwd, '.ankh', 'mcp.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { packages?: unknown };
    const packages = Array.isArray(config.packages)
      ? config.packages.filter((value): value is string => typeof value === 'string').toSorted()
      : [];
    request.context.writeStdout(`${packages.join('\n')}${packages.length === 0 ? '' : '\n'}`);
    return { exitCode: 0 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exitCode: 0 };
    request.context.writeStderr(`Invalid MCP configuration: ${configPath}\n`);
    return { exitCode: 1 };
  }
}
