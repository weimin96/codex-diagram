import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = path.join(root, 'package')
for (const file of ['.codex-plugin/plugin.json', '.mcp.json', 'dist/server.mjs', 'dist/app.js', 'dist/app.css', 'assets/icon.svg']) {
  await access(path.join(packageRoot, file))
}
const manifest = JSON.parse(await readFile(path.join(packageRoot, '.codex-plugin/plugin.json'), 'utf8'))
if (manifest.name !== 'codex-diagram') throw new Error('Unexpected plugin manifest name.')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (manifest.version !== packageJson.version) throw new Error('Plugin manifest version does not match package.json.')

const serverBundle = await readFile(path.join(packageRoot, 'dist/server.mjs'), 'utf8')
for (const marker of [
  'ui://codex-diagram/thread-v',
  'diagram.threadState',
  'Open the full-screen Diagram library',
  '["model", "app"]',
  'current conversation workspace',
  'preferredDisplayMode: "fullscreen"',
  'diagram.thread is only the UI-open action',
  'A software/system/module/service architecture request is NOT a flowchart request',
  'dedicated analysis/data types (kanban/requirement/sankey/xychart/pie/radar/treemap/ishikawa)',
  'diagram.beautifyArchitecture',
  'diagram.routeArchitectureEdges',
  'deterministically adds architecture partitions',
  'primary node(s)',
  'bundled relation(s)',
]) {
  if (!serverBundle.includes(marker)) throw new Error(`Missing conversation companion server marker: ${marker}`)
}

const appBundle = await readFile(path.join(packageRoot, 'dist/app.js'), 'utf8')
for (const marker of ['thread-follow-toggle', 'thread-companion', 'diagram.threadState']) {
  if (!appBundle.includes(marker)) throw new Error(`Missing conversation companion app marker: ${marker}`)
}
const appCss = await readFile(path.join(packageRoot, 'dist/app.css'), 'utf8')
for (const marker of ['freeform-bundle-trunk', 'emphasis-primary', 'c4-software-system']) {
  if (!appCss.includes(marker)) throw new Error(`Missing architecture design style marker: ${marker}`)
}
console.log('Codex Diagram package smoke check passed.')
