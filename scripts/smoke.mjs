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
console.log('Codex Diagram package smoke check passed.')
