---
'@ankhorage/mcp': major
---

Add a host-fenced, read-only prepared-write recovery API with immutable execution binding and durable recovery settlement.

This intentionally removes the public `McpPreparedWriteStore.reconcilePreparedWriteAsync()` contract published in MCP 0.4.0. It is a security-driven breaking change: consumers must migrate their host stores to the authorized `readPreparedWriteRecoveryAsync` recovery read and its host-issued recovery-fence settlement contract. Direct callers of the removed method cannot type-check against 1.0.0 and must migrate; no legacy recovery shim or parallel recovery contract is provided.
