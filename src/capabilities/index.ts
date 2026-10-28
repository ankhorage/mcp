/*** Publish the canonical MCP command capability surface for package discovery and metadata materialization. */
export const CAPABILITIES = [
  {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    id: 'mcp.add',
    owner: '@ankhorage/mcp',
  },
  {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    id: 'mcp.list',
    owner: '@ankhorage/mcp',
  },
  {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    id: 'mcp.doctor',
    owner: '@ankhorage/mcp',
  },
  {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    id: 'mcp.serve',
    owner: '@ankhorage/mcp',
  },
] as const;
