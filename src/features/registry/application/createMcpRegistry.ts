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

export type RegisteredMcpTool = Readonly<{ integrationId: string; tool: McpTool; toolId: string }>;

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
      return await executeRegisteredToolAsync(registeredTool, toolId, input, context, options);
    },
    listTools: () => registeredTools,
  };
}

/*** Enforce one registered tool boundary before it reaches its provider implementation. */
async function executeRegisteredToolAsync(
  registeredTool: RegisteredMcpTool,
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  context: McpToolExecutionContext,
  options: CreateMcpRegistryOptions,
): Promise<unknown> {
  try {
    assertSchema(input, registeredTool.tool.inputSchema, 'input');
    const accountId = await getAuthorizedAccountId(
      registeredTool,
      input,
      context,
      options.auditSink,
    );
    await assertWriteApprovalAsync(
      registeredTool,
      input,
      context,
      options.approvalVerifier,
      accountId,
      options.now ?? (() => new Date()),
    );
    if (registeredTool.tool.risk === 'write')
      await recordRequiredAsync(options.auditSink, {
        accountId,
        actorId: context.actorId,
        outcome: 'intent',
        risk: 'write',
        toolId,
      });
    return await executeAndAuditAsync(registeredTool, input, context, accountId, options.auditSink);
  } catch (error) {
    if (!(error instanceof McpRequestError))
      await recordBestEffortAsync(options.auditSink, {
        accountId: null,
        actorId: context.actorId,
        errorCode: 'execution-rejected',
        outcome: 'failed',
        risk: registeredTool.tool.risk,
        toolId,
      });
    if (error instanceof McpRequestError) throw error;
    throw new McpRequestError('MCP tool execution failed.');
  }
}

/*** Execute one authorized tool and durably record write outcomes without exposing provider failures. */
async function executeAndAuditAsync(
  registeredTool: RegisteredMcpTool,
  input: Readonly<Record<string, unknown>>,
  context: McpToolExecutionContext,
  accountId: string | null,
  auditSink: McpAuditSink | undefined,
): Promise<unknown> {
  let output: unknown;
  try {
    output = await registeredTool.tool.executeAsync(input, context);
    if (registeredTool.tool.outputSchema !== undefined)
      assertSchema(output, registeredTool.tool.outputSchema, 'output');
  } catch (error) {
    try {
      await recordOutcomeAsync(auditSink, registeredTool, context, accountId, 'failed');
    } catch {
      throw new McpRequestError('MCP write outcome could not be durably recorded.');
    }
    if (error instanceof McpRequestError) throw error;
    throw new McpRequestError('MCP tool execution failed.');
  }
  try {
    await recordOutcomeAsync(auditSink, registeredTool, context, accountId, 'executed');
  } catch {
    throw new McpRequestError('MCP write outcome could not be durably recorded.');
  }
  return output;
}

/*** Record the terminal outcome according to the read best-effort and write durable-audit policies. */
async function recordOutcomeAsync(
  auditSink: McpAuditSink | undefined,
  registeredTool: RegisteredMcpTool,
  context: McpToolExecutionContext,
  accountId: string | null,
  outcome: 'executed' | 'failed',
): Promise<void> {
  const event = {
    accountId,
    actorId: context.actorId,
    ...(outcome === 'failed' ? { errorCode: 'execution-rejected' } : {}),
    outcome,
    risk: registeredTool.tool.risk,
    toolId: registeredTool.toolId,
  } as const;
  if (registeredTool.tool.risk === 'write') return await recordRequiredAsync(auditSink, event);
  await recordBestEffortAsync(auditSink, event);
}

/*** Reject missing account identity unless a tool explicitly declares global scope. */
async function getAuthorizedAccountId(
  registeredTool: RegisteredMcpTool,
  input: Readonly<Record<string, unknown>>,
  context: McpToolExecutionContext,
  auditSink: McpAuditSink | undefined,
): Promise<string | null> {
  if (registeredTool.tool.scope === 'global') return null;
  const accountId = registeredTool.tool.accountId(input);
  if (accountId === null)
    return denyAsync(auditSink, registeredTool.toolId, context, null, 'missing-account-identity');
  if (!context.allowedAccounts.includes(accountId))
    return denyAsync(auditSink, registeredTool.toolId, context, accountId, 'account-not-allowed');
  return accountId;
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
    accountId === null ||
    registeredTool.tool.describeChangeAsync === undefined ||
    registeredTool.tool.verifyExpectedStateAsync === undefined
  )
    throw new McpRequestError(
      'Write tools require an externally issued, durable approval and provider state verification.',
    );
  const change = await registeredTool.tool.describeChangeAsync(input, context);
  if (!(await registeredTool.tool.verifyExpectedStateAsync(input, context, change)))
    throw new McpRequestError(
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
  if (!(await verifier.verifyAndConsumeAsync(proposal)))
    throw new McpRequestError(
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
  await recordBestEffortAsync(auditSink, {
    accountId,
    actorId: context.actorId,
    errorCode,
    outcome: 'denied',
    risk: 'read',
    toolId,
  });
  throw new McpRequestError(`MCP request denied: ${errorCode}`);
}

/*** Identify boundary failures whose deterministic messages are safe to return to clients. */
class McpRequestError extends Error {}

/*** Record reads and denials opportunistically without changing their authorization decision. */
async function recordBestEffortAsync(
  auditSink: McpAuditSink | undefined,
  event: Parameters<McpAuditSink['recordAsync']>[0],
): Promise<void> {
  try {
    await auditSink?.recordAsync(event);
  } catch {
    // Audit delivery must not alter an authorization decision or expose sink failures to clients.
  }
}

/*** Require a durable audit record for each write intent and terminal write outcome. */
async function recordRequiredAsync(
  auditSink: McpAuditSink | undefined,
  event: Parameters<McpAuditSink['recordAsync']>[0],
): Promise<void> {
  try {
    await auditSink?.recordAsync(event);
    if (auditSink === undefined) throw new Error('audit sink is unavailable');
  } catch {
    throw new McpRequestError('MCP write rejected because durable audit recording is unavailable.');
  }
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
  if (schema.type !== 'object')
    throw new McpRequestError(`MCP ${label} must match an object schema.`);
  assertSchemaValue(value, schema, label);
}

/*** Recursively validate serializable provider values against the declared schema. */
function assertSchemaValue(value: unknown, schema: McpJsonSchema, label: string): void {
  if (!matchesType(value, schema.type))
    throw new McpRequestError(`MCP ${label} must be ${schema.type}.`);
  if (schema.type !== 'object') return;
  const record = new Map(Object.entries(value as Record<string, unknown>));
  for (const property of schema.required ?? [])
    if (!record.has(property))
      throw new McpRequestError(`MCP ${label} is missing required property: ${property}`);
  const declaredProperties = new Map(Object.entries(schema.properties ?? {}));
  for (const [property, propertySchema] of declaredProperties) {
    const candidate = record.get(property);
    if (candidate !== undefined)
      assertSchemaValue(candidate, propertySchema, `${label}.${property}`);
  }
  if (schema.additionalProperties === false)
    for (const property of record.keys())
      if (!declaredProperties.has(property))
        throw new McpRequestError(`MCP ${label} has unknown property: ${property}`);
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
