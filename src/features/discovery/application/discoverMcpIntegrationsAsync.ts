import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { McpIntegration, McpIntegrationModule } from '../../../types/public.js';

export interface DiscoverMcpIntegrationsOptions {
  readonly cwd: string;
  readonly packageNames: readonly string[];
}

/*** Discover configured package exports without resolving arbitrary filesystem paths. */
export async function discoverMcpIntegrationsAsync(
  options: DiscoverMcpIntegrationsOptions,
): Promise<readonly McpIntegration[]> {
  const names = [...new Set(options.packageNames)].toSorted();
  const requireFromCwd = createRequire(pathToFileURL(`${options.cwd}/package.json`));
  return Promise.all(names.map((name) => loadIntegrationAsync(name, requireFromCwd)));
}

/*** Import a package's public mcp export and enforce the integration contract. */
async function loadIntegrationAsync(
  packageName: string,
  requireFromCwd: NodeRequire,
): Promise<McpIntegration> {
  if (!isPackageName(packageName)) throw new Error(`Invalid MCP provider package: ${packageName}`);
  let modulePath: string;
  try {
    modulePath = requireFromCwd.resolve(`${packageName}/mcp`);
  } catch (error) {
    throw new Error(
      `MCP provider package is not installed or does not export ./mcp: ${packageName}`,
      { cause: error },
    );
  }
  let loaded: unknown;
  try {
    loaded = await import(pathToFileURL(modulePath).href);
  } catch {
    throw new Error(`MCP provider initialization module could not be imported: ${packageName}`);
  }
  const module = loaded as McpIntegrationModule;
  try {
    const integration = module.createIntegrationAsync
      ? await module.createIntegrationAsync()
      : module.integration;
    if (!isIntegration(integration))
      throw new Error('missing integration or createIntegrationAsync export');
    return integration;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown failure';
    throw new Error(`MCP provider initialization failed for ${packageName}: ${detail}`, {
      cause: error,
    });
  }
}

/*** Check the minimal executable provider contract before it reaches the registry. */
function isIntegration(value: unknown): value is McpIntegration {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as McpIntegration).id === 'string' &&
    Array.isArray((value as McpIntegration).tools)
  );
}

/*** Accept package names only; paths and URL-like values are never provider configuration. */
function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
}
