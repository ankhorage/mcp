import type { McpAuditSink } from '../../../types/public.js';

/** Record reads and denials opportunistically without changing their authorization decision. */
export async function recordMcpAuditBestEffortAsync(
  auditSink: McpAuditSink | undefined,
  event: Parameters<McpAuditSink['recordAsync']>[0],
): Promise<void> {
  try {
    await auditSink?.recordAsync(event);
  } catch {
    // Audit delivery must not alter an authorization decision or expose sink failures to clients.
  }
}
