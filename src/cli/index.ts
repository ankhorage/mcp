import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import { add } from './commands/add.js';
import { doctor } from './commands/doctor.js';
import { list } from './commands/list.js';
import { serve } from './commands/serve.js';

/*** Expose MCP management commands through the Ankh provider mechanism. */
const provider: AnkhRuntimeCommandProvider = {
  capabilities: [
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
  ],
  category: 'mcp',
  commands: [
    { capability: 'mcp.add', path: ['add'], summary: 'Add an installed MCP provider package.' },
    { capability: 'mcp.list', path: ['list'], summary: 'List configured MCP provider packages.' },
    {
      capability: 'mcp.doctor',
      path: ['doctor'],
      summary: 'Validate configured MCP provider packages.',
    },
    { capability: 'mcp.serve', path: ['serve'], summary: 'Serve configured MCP tools over STDIO.' },
  ],
  handlers: [
    { handler: add, path: ['add'] },
    { handler: list, path: ['list'] },
    { handler: doctor, path: ['doctor'] },
    { handler: serve, path: ['serve'] },
  ],
  id: '@ankhorage/mcp',
  version: '0.1.0',
};

export default provider;
