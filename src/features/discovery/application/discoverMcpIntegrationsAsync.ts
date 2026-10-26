import { join } from 'node:path';
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
  const integrations: McpIntegration[] = [];
  try {
    for (const packageName of [...new Set(options.packageNames)].toSorted())
      integrations.push(await loadIntegrationAsync(packageName, options.cwd));
    return integrations;
  } catch (error) {
    await closeIntegrationsAsync(integrations);
    throw error;
  }
}

/*** Import a package's public mcp export and enforce the integration contract. */
async function loadIntegrationAsync(packageName: string, cwd: string): Promise<McpIntegration> {
  if (!isPackageName(packageName)) throw new Error(`Invalid MCP provider package: ${packageName}`);
  const parentUrl = pathToFileURL(join(cwd, 'package.json')).href;
  let moduleUrl: string;
  try {
    moduleUrl = import.meta.resolve(`${packageName}/mcp`, parentUrl);
  } catch (error) {
    throw new Error(
      `MCP provider package is not installed or does not export ./mcp: ${packageName}`,
      { cause: error },
    );
  }
  let loaded: unknown;
  try {
    loaded = await import(moduleUrl);
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

/*** Close providers initialized before a later configured provider fails discovery. */
async function closeIntegrationsAsync(integrations: readonly McpIntegration[]): Promise<void> {
  for (const integration of integrations) {
    try {
      if (integration.closeAsync !== undefined) await integration.closeAsync();
    } catch {
      // A later discovery error remains the actionable error; cleanup is best effort.
    }
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
