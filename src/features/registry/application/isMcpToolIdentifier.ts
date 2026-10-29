/** Restrict public integration and tool identifiers to portable MCP names. */
export function isMcpToolIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}
