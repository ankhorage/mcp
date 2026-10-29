import type {
  McpApprovalProposal,
  McpApprovalVerifier,
  McpAuditSink,
  McpIntegration,
  McpInvocationContext,
  McpTool,
  McpToolExecutionContext,
  McpTransactionalApprovalConsumer,
} from '../../../types/public.js';
import { assertMcpJsonSchema } from './assertMcpJsonSchema.js';
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { isMcpToolIdentifier } from './isMcpToolIdentifier.js';
import { McpRequestError } from './McpRequestError.js';
import { recordMcpAuditBestEffortAsync } from './recordMcpAuditBestEffortAsync.js';
import { recordMcpAuditRequiredAsync } from './recordMcpAuditRequiredAsync.js';
import { registerTransactionalApprovalConsumers } from './registerTransactionalApprovalConsumers.js';

export interface McpRegistry {
  closeAsync(): Promise<void>;
  executeAsync(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: McpInvocationContext,
  ): Promise<unknown>;
  listTools(): readonly RegisteredMcpTool[];
}

export type RegisteredMcpTool = Readonly<{ integrationId: string; tool: McpTool; toolId: string }>;

export interface CreateMcpRegistryOptions {
  readonly approvalVerifier?: McpApprovalVerifier;
  readonly auditSink?: McpAuditSink;
  readonly integrations: readonly McpIntegration[];
  readonly now?: () => Date;
  readonly transactionalApprovalConsumers?: readonly McpTransactionalApprovalConsumer[];
}

/*** Create a deterministic registry that enforces account and mutation boundaries. */
export function createMcpRegistry(options: CreateMcpRegistryOptions): McpRegistry {
  const registeredTools = registerTools(options.integrations);
  const toolsById = new Map(registeredTools.map((tool) => [tool.toolId, tool]));
  const transactionalConsumersByToolId = registerTransactionalApprovalConsumers(
    registeredTools,
    options.transactionalApprovalConsumers ?? [],
  );
  return {
    closeAsync: async () => {
      for (const integration of options.integrations) await integration.closeAsync?.();
    },
    executeAsync: async (toolId, input, context) => {
      const registeredTool = toolsById.get(toolId);
      if (registeredTool === undefined)
        return denyAsync(options.auditSink, toolId, context, null, 'unknown-tool');
      return await executeRegisteredToolAsync(
        registeredTool,
        toolId,
        input,
        context,
        options,
        transactionalConsumersByToolId.get(toolId),
      );
    },
    listTools: () => registeredTools,
  };
}

/*** Enforce one registered tool boundary before it reaches its provider implementation. */
async function executeRegisteredToolAsync(
  registeredTool: RegisteredMcpTool,
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  options: CreateMcpRegistryOptions,
  transactionalConsumer: McpTransactionalApprovalConsumer | undefined,
): Promise<unknown> {
  try {
    return await executeAuthorizedToolAsync(
      registeredTool,
      toolId,
      input,
      context,
      options,
      transactionalConsumer,
    );
  } catch (error) {
    if (!(error instanceof McpRequestError))
      await recordMcpAuditBestEffortAsync(options.auditSink, {
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

/** Authorize one registered tool and record its durable write intent before provider execution. */
async function executeAuthorizedToolAsync(
  registeredTool: RegisteredMcpTool,
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  options: CreateMcpRegistryOptions,
  transactionalConsumer: McpTransactionalApprovalConsumer | undefined,
): Promise<unknown> {
  assertMcpJsonSchema(input, registeredTool.tool.inputSchema, 'input');
  const accountId = await getAuthorizedAccountId(registeredTool, input, context, options.auditSink);
  const executionContext = await assertWriteApprovalAsync(
    registeredTool,
    input,
    context,
    options.approvalVerifier,
    accountId,
    options.now ?? (() => new Date()),
    transactionalConsumer,
  );
  if (registeredTool.tool.risk === 'write')
    await recordMcpAuditRequiredAsync(options.auditSink, {
      accountId,
      actorId: context.actorId,
      outcome: 'intent',
      risk: 'write',
      toolId,
    });
  return await executeAndAuditAsync(
    registeredTool,
    input,
    executionContext,
    accountId,
    options.auditSink,
  );
}

/*** Execute one authorized tool and durably record write outcomes without exposing provider failures. */
async function executeAndAuditAsync(
  registeredTool: RegisteredMcpTool,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  accountId: string | null,
  auditSink: McpAuditSink | undefined,
): Promise<unknown> {
  let output: unknown;
  try {
    output = await registeredTool.tool.executeAsync(input, context);
    if (registeredTool.tool.outputSchema !== undefined)
      assertMcpJsonSchema(output, registeredTool.tool.outputSchema, 'output');
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
  if (registeredTool.tool.risk === 'write')
    return await recordMcpAuditRequiredAsync(auditSink, event);
  await recordMcpAuditBestEffortAsync(auditSink, event);
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
    if (!isMcpToolIdentifier(integration.id) || integrationIds.has(integration.id))
      throw new Error(`Invalid or duplicate MCP integration identifier: ${integration.id}`);
    integrationIds.add(integration.id);
    return integration.tools.map((tool) => {
      if (!isMcpToolIdentifier(tool.id))
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
  context: McpInvocationContext,
  verifier: McpApprovalVerifier | undefined,
  accountId: string | null,
  now: () => Date,
  transactionalConsumer: McpTransactionalApprovalConsumer | undefined,
): Promise<McpToolExecutionContext> {
  if (registeredTool.tool.risk === 'read') return context;
  if (
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
  const proposal = await createApprovalProposalAsync(
    registeredTool,
    input,
    context,
    accountId,
    now,
    change,
  );
  if (transactionalConsumer !== undefined) {
    const consumedApproval =
      await transactionalConsumer.consumeApprovalAndCreateIntentAsync(proposal);
    if (consumedApproval === null)
      throw new McpRequestError(
        'The supplied approval is denied, expired, replayed, or bound to another operation.',
      );
    return { ...context, consumedApproval };
  }
  if (verifier === undefined)
    throw new McpRequestError(
      'Write tools require an externally issued, durable approval and provider state verification.',
    );
  if (!(await verifier.verifyAndConsumeAsync(proposal)))
    throw new McpRequestError(
      'The supplied approval is denied, expired, replayed, or bound to another operation.',
    );
  return context;
}

/** Build the exact immutable approval binding after provider state has been verified. */
async function createApprovalProposalAsync(
  registeredTool: RegisteredMcpTool,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  accountId: string,
  now: () => Date,
  change: McpApprovalProposal['change'],
): Promise<McpApprovalProposal> {
  return {
    accountId,
    actorId: context.actorId,
    change,
    expiresAt: new Date(now().getTime() + 60_000).toISOString(),
    fingerprint:
      (await registeredTool.tool.approvalFingerprintAsync?.(input, context, change)) ??
      createMcpApprovalFingerprint(input),
    operation: registeredTool.tool.id,
    toolId: registeredTool.toolId,
  };
}

/*** Record a denial before returning a deterministic boundary error. */
async function denyAsync(
  auditSink: McpAuditSink | undefined,
  toolId: string,
  context: McpInvocationContext,
  accountId: string | null,
  errorCode: string,
): Promise<never> {
  await recordMcpAuditBestEffortAsync(auditSink, {
    accountId,
    actorId: context.actorId,
    errorCode,
    outcome: 'denied',
    risk: 'read',
    toolId,
  });
  throw new McpRequestError(`MCP request denied: ${errorCode}`);
}
