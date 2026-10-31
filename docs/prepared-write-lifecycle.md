# Prepared-write lifecycle

Write providers implement `prepareWriteAsync` once and return a versioned serialized payload, exact change snapshot, original `createdAt`, operation, and provider fingerprint. The MCP runtime adds account, actor, and tool identity and gives that immutable record to `McpPreparedWriteStore.createPreparedWriteAsync`.

The host persists it atomically and performs human approval outside MCP. Execution accepts only `approvalId`; `claimApprovedWriteAndCreateIntentAsync` atomically validates approval, consumes it, records durable intent, and returns the original proposal plus one execution claim. The runtime checks tool, account, operation, snapshot fingerprint and provider verification before invoking `executePreparedWriteAsync` with that exact proposal.

This guarantees at-most-once provider invocation after an execution claim, not exactly-once external effect: an interrupted or timed-out provider call is `indeterminate` and must be reconciled using the stored claim, never retried as a mutation.

`@ankhorage/ads-google` should map its existing `GoogleAdsMutationProposal` to `McpPreparedWrite` and use the received original proposal plus execution claim with its persisted execution/reconciliation flow. `api-gateway/apps/ads` should adapt its PostgreSQL proposal snapshot and #67 atomic approval-consume/intent functions as `McpPreparedWriteStore`; it must retain the original serialized payload and fingerprints unchanged.
