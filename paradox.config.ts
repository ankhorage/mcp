import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    description: 'Secure, provider-neutral MCP runtime and Ankh CLI provider.',
    title: '@ankhorage/mcp',
  },
  output: { dir: './paradox' },
  package: {
    entrypoints: ['src/index.ts'],
    root: '.',
  },
});
