import type { McpAuditSink } from '../../../types/public.js';
import { McpRequestError } from './McpRequestError.js';

/** Require a durable audit record for each write intent and terminal write outcome. */
export async function recordMcpAuditRequiredAsync(
  auditSink: McpAuditSink | undefined,
  event: Parameters<McpAuditSink['recordAsync']>[0],
): Promise<void> {
  try {
    if (auditSink === undefined) throw new Error('audit sink is unavailable');
    await auditSink.recordAsync(event);
  } catch {
    try {
      // A host keys write events by eventId, so this covers a committed append whose response was lost.
      if (auditSink === undefined) throw new Error('audit sink is unavailable');
      await auditSink.recordAsync(event);
      return;
    } catch {
      throw new McpRequestError(
        'MCP write rejected because durable audit recording is unavailable.',
      );
    }
  }
}
