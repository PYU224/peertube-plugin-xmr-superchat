import esbuild from 'esbuild'
import { readdir } from 'fs/promises'
import { join } from 'path'

const clientDir = 'client'
const outDir = 'dist/client'

async function build() {
  const files = await readdir(clientDir)
  const entryPoints = files
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map(f => join(clientDir, f))

  await esbuild.build({
    entryPoints,
    bundle: true,
    outdir: outDir,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    sourcemap: false,
    minify: false,
    outExtension: { '.js': '.js' },
    external: ['socket.io-client']
  })

  console.log('✓ Client files built successfully')
}

build().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
