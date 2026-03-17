import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/channels/cli.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  treeshake: true,
  minify: false,
  external: ['better-sqlite3'],
});
