import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const marketplace = 'codex-diagram-local'
const plugin = `codex-diagram@${marketplace}`

const marketplaces = await codex(['plugin', 'marketplace', 'list'])
if (!marketplaces.includes(marketplace)) await codex(['plugin', 'marketplace', 'add', root])
await codex(['plugin', 'remove', plugin]).catch(() => '')
const installed = await codex(['plugin', 'add', plugin, '--json'])
process.stdout.write(installed.endsWith('\n') ? installed : `${installed}\n`)

async function codex(args) {
  const result = await execFileAsync('codex', args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  return result.stdout
}
