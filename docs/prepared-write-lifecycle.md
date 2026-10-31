# Prepared-write lifecycle

Write providers implement `prepareWriteAsync` once and return a versioned serialized payload, exact change snapshot, original `createdAt`, operation, and provider fingerprint. The MCP runtime adds account, actor, and tool identity and gives that immutable record to `McpPreparedWriteStore.createPreparedWriteAsync`.

The host persists it atomically and performs human approval outside MCP. Execution accepts only `approvalId`; `claimApprovedWriteAndCreateIntentAsync` atomically validates approval, consumes it, records durable intent, and returns the original proposal plus one execution claim. The runtime checks tool, account, operation, snapshot fingerprint and provider verification before invoking `executePreparedWriteAsync` with that exact proposal.

This guarantees at-most-once provider invocation after an execution claim, not exactly-once external effect: an interrupted or timed-out provider call is `indeterminate` and must be reconciled using the stored claim, never retried as a mutation.

`@ankhorage/ads-google@0.4.0` uses the superseded direct write-tool contract and cannot be used for mutations with this MCP release. Its migration is to map `GoogleAdsMutationProposal` to `McpPreparedWrite`, implement `prepareWriteAsync`, `verifyPreparedWriteAsync`, and `executePreparedWriteAsync`, and execute only the host-returned original proposal with its claim. It must persist/reconcile timeout and crash outcomes from that claim and must not issue a second Google Ads mutation during recovery.

`api-gateway/apps/ads` should adapt its PostgreSQL proposal snapshot and #67 atomic approval-consume/intent functions as `McpPreparedWriteStore`; it must retain the original serialized payload and fingerprints unchanged. Gateway #67/#69 are intentionally not changed by this PR.

Release in dependency order: publish the compatible `@ankhorage/mcp` minor first; then publish the migrated `@ankhorage/ads-google` against that released public API; then upgrade and acceptance-test the host/gateway and the packed consumer. Keep the cross-repository issue open until that final Ads write acceptance has completed.
