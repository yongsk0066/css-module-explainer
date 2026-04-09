import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: { extension: 'client/src/extension.ts' },
    output: {
      dir: 'dist/client',
      format: 'cjs',
      sourcemap: 'hidden',
      entryFileNames: '[name].js',
    },
    external: ['vscode'],
    platform: 'node',
  },
  {
    input: { server: 'server/src/server.ts' },
    output: {
      dir: 'dist/server',
      format: 'cjs',
      sourcemap: 'hidden',
      entryFileNames: '[name].js',
    },
    platform: 'node',
  },
]);
