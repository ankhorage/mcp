import { readFile } from 'node:fs/promises';
import * as module from 'node:module';
import { dirname, join, resolve } from 'node:path';
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
  let moduleUrl: string;
  try {
    moduleUrl = await resolveMcpExportAsync(packageName, cwd);
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

/*** Resolve the public import export from the explicitly selected consumer installation. */
async function resolveMcpExportAsync(packageName: string, cwd: string): Promise<string> {
  if (typeof Bun !== 'undefined')
    return Bun.resolve(`${packageName}/mcp`, join(cwd, 'package.json'));
  const packageJsonPath = module.findPackageJSON(
    packageName,
    pathToFileURL(join(cwd, 'package.json')).href,
  );
  if (packageJsonPath === undefined) throw new Error('provider package was not found');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    readonly exports?: unknown;
  };
  const target = selectImportExportTarget(packageJson.exports);
  if (target === null) throw new Error('provider package does not export ./mcp for ESM imports');
  return pathToFileURL(resolve(dirname(packageJsonPath), target)).href;
}

/*** Select the ESM target for the required public `./mcp` package export. */
function selectImportExportTarget(exports: unknown): string | null {
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports)) return null;
  const mcpExport = (exports as Readonly<Record<string, unknown>>)['./mcp'];
  return selectImportConditionTarget(mcpExport);
}

/*** Follow package-export condition order using the Node ESM import conditions. */
function selectImportConditionTarget(value: unknown): string | null {
  if (typeof value === 'string') return value.startsWith('./') ? value : null;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const target = selectImportConditionTarget(candidate);
      if (target !== null) return target;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  for (const [condition, candidate] of Object.entries(value)) {
    if (condition === 'import' || condition === 'node' || condition === 'default') {
      const target = selectImportConditionTarget(candidate);
      if (target !== null) return target;
    }
  }
  return null;
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
