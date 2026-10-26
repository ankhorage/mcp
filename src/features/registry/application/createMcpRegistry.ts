import { createHash } from 'node:crypto';

import type {
  McpApprovalProposal,
  McpApprovalVerifier,
  McpAuditSink,
  McpIntegration,
  McpJsonSchema,
  McpTool,
  McpToolExecutionContext,
} from '../../../types/public.js';

export interface McpRegistry {
  closeAsync(): Promise<void>;
  executeAsync(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
  ): Promise<unknown>;
  listTools(): readonly RegisteredMcpTool[];
}

export interface RegisteredMcpTool {
  readonly integrationId: string;
  readonly tool: McpTool;
  readonly toolId: string;
}

export interface CreateMcpRegistryOptions {
  readonly approvalVerifier?: McpApprovalVerifier;
  readonly auditSink?: McpAuditSink;
  readonly integrations: readonly McpIntegration[];
  readonly now?: () => Date;
}

/*** Create a deterministic registry that enforces account and mutation boundaries. */
export function createMcpRegistry(options: CreateMcpRegistryOptions): McpRegistry {
  const registeredTools = registerTools(options.integrations);
  const toolsById = new Map(registeredTools.map((tool) => [tool.toolId, tool]));
  return {
    closeAsync: async () => {
      for (const integration of options.integrations) await integration.closeAsync?.();
    },
    executeAsync: async (toolId, input, context) => {
      const registeredTool = toolsById.get(toolId);
      if (registeredTool === undefined)
        return denyAsync(options.auditSink, toolId, context, null, 'unknown-tool');
      try {
        assertSchema(input, registeredTool.tool.inputSchema, 'input');
        const accountId = registeredTool.tool.accountId(input);
        if (accountId !== null && !context.allowedAccounts.includes(accountId))
          return denyAsync(options.auditSink, toolId, context, accountId, 'account-not-allowed');
        await assertWriteApprovalAsync(
          registeredTool,
          input,
          context,
          options.approvalVerifier,
          accountId,
          options.now ?? (() => new Date()),
        );
        const output = await registeredTool.tool.executeAsync(input, context);
        if (registeredTool.tool.outputSchema !== undefined)
          assertSchema(output, registeredTool.tool.outputSchema, 'output');
        await recordAsync(options.auditSink, {
          accountId,
          actorId: context.actorId,
          outcome: 'executed',
          risk: registeredTool.tool.risk,
          toolId,
        });
        return output;
      } catch (error) {
        await recordAsync(options.auditSink, {
          accountId: null,
          actorId: context.actorId,
          errorCode: 'execution-rejected',
          outcome: 'failed',
          risk: registeredTool.tool.risk,
          toolId,
        });
        throw error;
      }
    },
    listTools: () => registeredTools,
  };
}

/*** Register valid, stable namespaced tool identifiers. */
function registerTools(integrations: readonly McpIntegration[]): readonly RegisteredMcpTool[] {
  const integrationIds = new Set<string>();
  const tools = integrations.flatMap((integration) => {
    if (!isIdentifier(integration.id) || integrationIds.has(integration.id))
      throw new Error(`Invalid or duplicate MCP integration identifier: ${integration.id}`);
    integrationIds.add(integration.id);
    return integration.tools.map((tool) => {
      if (!isIdentifier(tool.id))
        throw new Error(`Invalid MCP tool identifier: ${integration.id}.${tool.id}`);
      return { integrationId: integration.id, tool, toolId: `${integration.id}.${tool.id}` };
    });
  });
  const ids = new Set<string>();
  for (const tool of tools) {
    if (ids.has(tool.toolId)) throw new Error(`Duplicate MCP tool identifier: ${tool.toolId}`);
    ids.add(tool.toolId);
  }
  return tools.toSorted((left, right) => left.toolId.localeCompare(right.toolId));
}

/*** Require and consume an immutable, external approval before a productive mutation. */
async function assertWriteApprovalAsync(
  registeredTool: RegisteredMcpTool,
  input: Readonly<Record<string, unknown>>,
  context: McpToolExecutionContext,
  verifier: McpApprovalVerifier | undefined,
  accountId: string | null,
  now: () => Date,
): Promise<void> {
  if (registeredTool.tool.risk === 'read') return;
  if (
    verifier === undefined ||
    context.approvalToken === undefined ||
    accountId === null ||
    registeredTool.tool.describeChangeAsync === undefined ||
    registeredTool.tool.verifyExpectedStateAsync === undefined
  )
    throw new Error(
      'Write tools require an externally issued, durable approval and provider state verification.',
    );
  const change = await registeredTool.tool.describeChangeAsync(input, context);
  if (!(await registeredTool.tool.verifyExpectedStateAsync(input, context, change)))
    throw new Error(
      'Write approval is stale because provider state no longer matches the proposal.',
    );
  const proposal: McpApprovalProposal = {
    accountId,
    actorId: context.actorId,
    change,
    expiresAt: new Date(now().getTime() + 60_000).toISOString(),
    fingerprint: fingerprint(input),
    operation: registeredTool.tool.id,
    toolId: registeredTool.toolId,
  };
  if (!(await verifier.verifyAndConsumeAsync(proposal, context.approvalToken)))
    throw new Error(
      'The supplied approval is denied, expired, replayed, or bound to another operation.',
    );
}

/*** Record a denial before returning a deterministic boundary error. */
async function denyAsync(
  auditSink: McpAuditSink | undefined,
  toolId: string,
  context: McpToolExecutionContext,
  accountId: string | null,
  errorCode: string,
): Promise<never> {
  await recordAsync(auditSink, {
    accountId,
    actorId: context.actorId,
    errorCode,
    outcome: 'denied',
    risk: 'read',
    toolId,
  });
  throw new Error(`MCP request denied: ${errorCode}`);
}

/*** Record audit events without allowing observability failure to bypass enforcement. */
async function recordAsync(
  auditSink: McpAuditSink | undefined,
  event: Parameters<McpAuditSink['recordAsync']>[0],
): Promise<void> {
  await auditSink?.recordAsync(event);
}

/*** Produce a canonical proposal fingerprint independent of property insertion order. */
function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash('sha256')
    .update(JSON.stringify(sortJson(value)))
    .digest('hex');
}

/*** Sort JSON object keys recursively before binding parameters to an approval. */
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, candidate]) => [key, sortJson(candidate)]),
    );
  return value;
}

/*** Validate the small serializable schema vocabulary accepted at provider boundaries. */
function assertSchema(
  value: unknown,
  schema: McpJsonSchema,
  label: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    schema.type !== 'object' ||
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  )
    throw new Error(`MCP ${label} must match an object schema.`);
  const record = new Map(Object.entries(value as Record<string, unknown>));
  for (const property of schema.required ?? [])
    if (!record.has(property))
      throw new Error(`MCP ${label} is missing required property: ${property}`);
  const declaredProperties = new Map(Object.entries(schema.properties ?? {}));
  for (const [property, propertySchema] of declaredProperties) {
    const candidate = record.get(property);
    if (candidate !== undefined && !matchesType(candidate, propertySchema.type))
      throw new Error(`MCP ${label}.${property} must be ${propertySchema.type}.`);
  }
  if (schema.additionalProperties === false)
    for (const property of record.keys())
      if (!declaredProperties.has(property))
        throw new Error(`MCP ${label} has unknown property: ${property}`);
}

/*** Match primitive JSON values against their declared schema type. */
function matchesType(value: unknown, type: McpJsonSchema['type']): boolean {
  return (
    (type === 'string' && typeof value === 'string') ||
    (type === 'boolean' && typeof value === 'boolean') ||
    (type === 'number' && typeof value === 'number') ||
    (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
    (type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value))
  );
}

/*** Restrict public integration and tool identifiers to portable MCP names. */
function isIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}
