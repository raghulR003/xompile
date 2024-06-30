import { build } from 'esbuild';

build({
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    bundle: true,
    platform: 'node',
    target: 'node16', 
    external: ['vscode'], 
    minify: false, 
    sourcemap: true,
    watch: process.argv.includes('--watch') && { // <-- Combine with conditional
      onRebuild(error, result) {
        if (error) {console.error('watch build failed:', error);}
        else {console.log('watch build succeeded:', result);}
      },
    }, 
  })
  .catch(() => process.exit(1));