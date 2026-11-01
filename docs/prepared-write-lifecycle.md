# Prepared-write lifecycle

Write providers implement `prepareWriteAsync` once and return a versioned serialized payload, exact change snapshot, original `createdAt`, operation, and provider fingerprint. The MCP runtime adds account, actor, and tool identity and gives that immutable record to `McpPreparedWriteStore.createPreparedWriteAsync`.

The host persists it atomically and performs human approval outside MCP. Execution accepts only `approvalId`; `claimApprovedWriteAndCreateIntentAsync` atomically validates approval, consumes it, records durable intent, and returns the original proposal plus one execution claim. The runtime checks tool, account, operation, snapshot fingerprint and provider verification before invoking `executePreparedWriteAsync` with that exact proposal.

`McpPreparedWriteStore.settlePreparedWriteAsync` is bound to the authoritative execution claim and is idempotent for the same terminal outcome while rejecting contradictory terminal outcomes. A rejected or exceptional preflight settles the existing Gateway `not_applied` status with a safe reason code; no additional PostgreSQL status is required. If this settlement cannot be persisted, the already consumed intent remains locked and recoverable, and MCP makes no provider call. A provider call that may have started but has no confirmed result settles as `indeterminate`; recovery calls `reconcilePreparedWriteAsync`, which is read-only and must never retry a provider mutation.

Write audit events are append-only records with a stable `eventId`, `intentId`, approval ID, account and actor identities, full tool ID, operation, provider proposal fingerprint, snapshot-integrity fingerprint, outcome, and safe reason code. Recovery's `reconciliation_completed` event additionally carries its actual `recoveryOutcome` (`executed`, `not_applied`, or `indeterminate`), and that value is part of its deterministic event ID. Events deliberately exclude serialized provider payloads and secrets.

This guarantees at-most-once provider invocation after an execution claim, not exactly-once external effect: an interrupted or timed-out provider call is `indeterminate` and must be reconciled using the stored claim, never retried as a mutation.

`@ankhorage/ads-google@0.4.0` uses the superseded direct write-tool contract and cannot be used for mutations with this MCP release. Its migration is to map `GoogleAdsMutationProposal` to `McpPreparedWrite`, implement `prepareWriteAsync`, `verifyPreparedWriteAsync`, and `executePreparedWriteAsync`, and execute only the host-returned original proposal with its claim. It must persist/reconcile timeout and crash outcomes from that claim and must not issue a second Google Ads mutation during recovery.

`api-gateway/apps/ads` should adapt its PostgreSQL proposal snapshot and #67 atomic approval-consume/intent functions as `McpPreparedWriteStore`; it must retain the original serialized payload and fingerprints unchanged. Gateway #67 needs the idempotent, claim-bound `not_applied`/`executed`/`indeterminate` settlement and read-only reconciliation operations, plus the transactional audit outbox keyed by `eventId`. Gateway #69 must implement those operations in the host and prove PostgreSQL-17 concurrency, crash/timeout recovery, and STDIO E2E before production use. Gateway #67/#69 are intentionally not changed by this PR.

Release in dependency order: publish the compatible `@ankhorage/mcp` minor first; then publish the migrated `@ankhorage/ads-google` against that released public API; then upgrade and acceptance-test the host/gateway and the packed consumer. Keep the cross-repository issue open until that final Ads write acceptance has completed.

## Host recovery

`McpRegistry.reconcilePreparedWriteAsync` is a privileged host operation, not an MCP STDIO tool.
The host supplies the stored execution claim and process-owned invocation context. Before the
runtime asks a provider for evidence, the prepared-write store must issue a recovery claim that
fences both normal execution and other recoveries. The runtime revalidates the original tool,
actor, account, proposal fingerprint, approval ID, and intent ID before using the registered
write tool's optional `reconcilePreparedWriteAsync` evidence function.

That provider function is read-only: it must never call `executePreparedWriteAsync`. It may return
`executed` only with causal evidence, `not_applied` only when it can prove the mutation never
started, and `indeterminate` otherwise. Missing, failing, or inconclusive evidence is settled as
`indeterminate`. Before every recovery status read, the host's
`readPreparedWriteRecoveryAsync` must atomically validate the execution claim, process-owned actor
and allowed-account set, registered tool ID, and persisted account, actor, tool, proposal and
snapshot bindings. Unauthorized reads return no lifecycle state and make no provider call.

For recovery only, `settlePreparedWriteRecoveryAndRecordAuditAsync` must settle the matching
recovery fence and insert the full recovery audit event into a durable outbox in the same database
transaction. It must commit both or roll back both, make an identical settlement plus event
idempotent, reject a reused event ID with differing data, reject contradictory terminal outcomes,
and reject stale fences without changing either record. This is deliberately a recovery-only host
requirement: existing MCP 0.4.0 consumers keep their normal write contract, while hosts that opt
into recovery must implement both new optional methods with no non-atomic fallback.

Gateway follow-up: implement these two host operations in PostgreSQL with the proposal/account/
actor/tool/snapshot predicates in the authorized read, plus a single settlement-and-outbox SQL
transaction keyed by `eventId` and validated against `recoveryOutcome`. Prove stale-fence,
rollback, restart, and concurrency behavior in gateway integration tests. This PR does not change
Gateway SQL or the audit-outbox adapter. Agents cannot approve, claim normal execution, or retry an
indeterminate mutation by using recovery.
