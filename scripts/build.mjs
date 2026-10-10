import { build } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = path.join(root, 'package')
const dist = path.join(packageRoot, 'dist')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)

await rm(packageRoot, { recursive: true, force: true })
await mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true })
await mkdir(path.join(packageRoot, 'assets'), { recursive: true })
await mkdir(dist, { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/server.ts')],
  outfile: path.join(dist, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  define: { __CODEX_DIAGRAM_VERSION__: JSON.stringify(version) },
})

await build({
  entryPoints: [path.join(root, 'src/app.tsx')],
  outfile: path.join(dist, 'app.js'),
  bundle: true,
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: true,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    __CODEX_DIAGRAM_VERSION__: JSON.stringify(version),
  },
})

const stylesheetPath = path.join(root, 'src/styles.css')
const stylesheet = await readFile(stylesheetPath, 'utf8')
const compiledStylesheet = await postcss([tailwindcss()]).process(stylesheet, {
  from: stylesheetPath,
  to: path.join(dist, 'app.css'),
})
await writeFile(path.join(dist, 'app.css'), compiledStylesheet.css)
const pluginManifest = JSON.parse(await readFile(path.join(root, 'manifest/plugin.json'), 'utf8'))
pluginManifest.version = version
await writeFile(path.join(packageRoot, '.codex-plugin/plugin.json'), `${JSON.stringify(pluginManifest, null, 2)}\n`)
await cp(path.join(root, 'manifest/mcp.json'), path.join(packageRoot, '.mcp.json'))
await cp(path.join(root, 'assets/icon.svg'), path.join(packageRoot, 'assets/icon.svg'))
await cp(path.join(root, 'assets/icon-dark.svg'), path.join(packageRoot, 'assets/icon-dark.svg'))

console.log(`Built Codex Diagram plugin: ${packageRoot}`)
