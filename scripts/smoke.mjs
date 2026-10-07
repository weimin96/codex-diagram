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
]) {
  if (!serverBundle.includes(marker)) throw new Error(`Missing conversation companion server marker: ${marker}`)
}

const appBundle = await readFile(path.join(packageRoot, 'dist/app.js'), 'utf8')
for (const marker of ['thread-follow-toggle', 'thread-companion', 'diagram.threadState']) {
  if (!appBundle.includes(marker)) throw new Error(`Missing conversation companion app marker: ${marker}`)
}
console.log('Codex Diagram package smoke check passed.')
