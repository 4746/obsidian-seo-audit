// Build/watch layout based on obsidianmd/obsidian-sample-plugin (0BSD).
import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
const production = process.argv[2] === 'production';
const context = await esbuild.context({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian', 'electron', ...builtinModules],
  format: 'cjs', target: 'es2021', logLevel: 'info', outfile: 'main.js',
  sourcemap: production ? false : 'inline', minify: production, treeShaking: true,
  banner: { js: '/* Obsidian SEO Audit — generated bundle. See src/ for source. */' },
});
if (production) { await context.rebuild(); await context.dispose(); }
else { await context.watch(); }
