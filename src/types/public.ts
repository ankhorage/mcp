export type McpRisk = 'read' | 'write';
export interface McpJsonSchema {
  readonly additionalProperties?: boolean;
  readonly properties?: Readonly<Record<string, McpJsonSchema>>;
  readonly required?: readonly string[];
  readonly type: 'boolean' | 'integer' | 'number' | 'object' | 'string';
}
export interface McpInvocationContext {
  readonly actorId: string;
  readonly allowedAccounts: readonly string[];
}
export interface McpExecutionClaim {
  readonly approvalId: string;
  readonly intentId: string;
}

/** An opaque host-issued fence that authorizes one read-only recovery attempt. */
export interface McpPreparedWriteRecoveryClaim extends McpExecutionClaim {
  readonly recoveryId: string;
}
export type McpPreparedWriteSettlementOutcome = 'executed' | 'indeterminate' | 'not_applied';
export interface McpPreparedWriteSettlement {
  readonly executionClaim: McpExecutionClaim;
  readonly outcome: McpPreparedWriteSettlementOutcome;
  readonly reasonCode?: string;
}
export interface McpPreparedWriteRecoveryRead {
  readonly outcome: McpPreparedWriteSettlementOutcome | 'executing';
}
export interface McpToolExecutionContext extends McpInvocationContext {
  readonly executionClaim?: McpExecutionClaim;
}
export type McpExecutionAuditOutcome = 'executed' | 'indeterminate';
export interface McpChangeDescriptor {
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly resourceId: string;
}
export interface McpPreparedWritePayload {
  readonly serialized: string;
  readonly version: string;
}
/** The immutable provider proposal persisted by the trusted host before human approval. */
export interface McpPreparedWriteProposal {
  readonly accountId: string;
  readonly actorId: string;
  readonly change: McpChangeDescriptor;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly operation: string;
  readonly payload: McpPreparedWritePayload;
  readonly toolId: string;
}
export interface McpPreparedWrite {
  readonly change: McpChangeDescriptor;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly operation: string;
  readonly payload: McpPreparedWritePayload;
}
export interface McpStoredPreparedWrite {
  readonly approvalId: string;
  readonly expiresAt: string;
  readonly proposal: McpPreparedWriteProposal;
  readonly snapshotFingerprint: string;
}
/** A trusted host must atomically authorize, consume, and persist an externally approved write intent. */
export interface McpPreparedWriteStore {
  createPreparedWriteAsync(proposal: McpPreparedWriteProposal): Promise<McpStoredPreparedWrite>;
  claimApprovedWriteAndCreateIntentAsync(input: {
    readonly approvalId: string;
    /** The process-owned invocation actor that must match the persisted proposal before consume. */
    readonly actorId: string;
    /** The process-owned account allow-list that must include the persisted proposal account before consume. */
    readonly allowedAccounts: readonly string[];
    readonly toolId: string;
  }): Promise<(McpStoredPreparedWrite & { readonly executionClaim: McpExecutionClaim }) | null>;
  /** Atomically settle one intent. Implementations must make same-outcome repeats idempotent and reject conflicts. */
  settlePreparedWriteAsync(settlement: McpPreparedWriteSettlement): Promise<void>;
  /**
   * Atomically authorize a recovery status read against the persisted approval, intent, account,
   * actor, tool, proposal, and snapshot bindings. This operation must never invoke a provider.
   */
  readPreparedWriteRecoveryAsync?(input: {
    readonly actorId: string;
    readonly allowedAccounts: readonly string[];
    readonly executionClaim: McpExecutionClaim;
    readonly toolId: string;
  }): Promise<McpPreparedWriteRecoveryRead | null>;
  /**
   * Atomically fence an expired or indeterminate execution before recovery evidence is read.
   * This claim must prevent normal execution and competing recovery until it is settled or expires.
   */
  claimPreparedWriteRecoveryAsync?(input: {
    readonly allowedAccounts: readonly string[];
    readonly actorId: string;
    readonly executionClaim: McpExecutionClaim;
  }): Promise<
    (McpStoredPreparedWrite & { readonly recoveryClaim: McpPreparedWriteRecoveryClaim }) | null
  >;
  /**
   * Atomically settle a matching recovery fence and persist its complete audit event in the host's
   * durable outbox. Same settlement plus event is idempotent; conflicting outcome or event data
   * must fail without changing either record.
   */
  settlePreparedWriteRecoveryAndRecordAuditAsync?(input: {
    readonly auditEvent: McpWriteAuditEvent;
    readonly outcome: McpPreparedWriteSettlementOutcome;
    readonly reasonCode?: string;
    readonly recoveryClaim: McpPreparedWriteRecoveryClaim;
  }): Promise<void>;
}
interface McpToolBase {
  readonly description: string;
  readonly id: string;
  readonly inputSchema: McpJsonSchema;
  readonly outputSchema?: McpJsonSchema;
  readonly title: string;
}
export interface McpReadTool extends McpToolBase {
  readonly risk: 'read';
  readonly scope: 'account' | 'global';
  accountId?(input: Readonly<Record<string, unknown>>): string | null;
  readonly executeAsync: (
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
  ) => Promise<unknown>;
}
/** Write providers prepare once, then execute only the persisted original proposal. */
export interface McpWriteTool extends McpToolBase {
  readonly risk: 'write';
  readonly scope: 'account';
  accountId(input: Readonly<Record<string, unknown>>): string | null;
  /** If absent, a regular execution return must guarantee that the mutation was actually verified. */
  auditOutcome?(output: unknown): McpExecutionAuditOutcome;
  prepareWriteAsync(
    input: Readonly<Record<string, unknown>>,
    context: McpInvocationContext,
  ): Promise<McpPreparedWrite>;
  verifyPreparedWriteAsync(
    proposal: McpPreparedWriteProposal,
    context: McpToolExecutionContext,
  ): Promise<boolean>;
  /**
   * Read provider evidence for an immutable persisted proposal after a host has fenced recovery.
   * Implementations must never call a provider mutation and return `indeterminate` without causal evidence.
   */
  reconcilePreparedWriteAsync?(
    proposal: McpPreparedWriteProposal,
    context: McpToolExecutionContext,
  ): Promise<McpPreparedWriteSettlementOutcome>;
  executePreparedWriteAsync(
    proposal: McpPreparedWriteProposal,
    context: McpToolExecutionContext,
  ): Promise<unknown>;
}
export type McpTool = McpReadTool | McpWriteTool;
export interface McpIntegration {
  closeAsync?(): Promise<void>;
  readonly id: string;
  readonly tools: readonly McpTool[];
}
export interface McpIntegrationModule {
  createIntegrationAsync?(): Promise<McpIntegration>;
  readonly integration?: McpIntegration;
}
export interface McpReadAuditEvent {
  readonly accountId: string | null;
  readonly actorId: string;
  readonly errorCode?: string;
  readonly outcome: 'denied' | 'failed';
  readonly risk: 'read';
  readonly toolId: string;
}
export type McpWriteAuditOutcome =
  | 'indeterminate'
  | 'intent_persisted'
  | 'mutation_verified'
  | 'preflight_rejected'
  | 'provider_call_started'
  | 'reconciliation_completed';
export interface McpWriteAuditEvent {
  readonly accountId: string;
  readonly actorId: string;
  readonly approvalId: string;
  /** Stable idempotency key. Hosts persist this append-only, normally through a transactionally written outbox. */
  readonly eventId: string;
  readonly intentId: string;
  readonly operation: string;
  readonly outcome: McpWriteAuditOutcome;
  readonly providerProposalFingerprint: string;
  readonly reasonCode?: string;
  /** The actual terminal state for a `reconciliation_completed` lifecycle event. */
  readonly recoveryOutcome?: McpPreparedWriteSettlementOutcome;
  readonly risk: 'write';
  readonly snapshotFingerprint: string;
  readonly toolId: string;
}
export type McpAuditEvent = McpReadAuditEvent | McpWriteAuditEvent;
export interface McpAuditSink {
  recordAsync(event: McpAuditEvent): Promise<void>;
}
export interface McpHost {
  readonly auditSink?: McpAuditSink;
  readonly context: McpInvocationContext;
  readonly preparedWriteStore?: McpPreparedWriteStore;
}
export interface McpHostModule {
  createMcpHostAsync(): Promise<McpHost>;
}
