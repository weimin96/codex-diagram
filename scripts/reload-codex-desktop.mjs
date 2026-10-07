import { execFile, spawn } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

if (process.platform !== 'darwin') {
  console.log('Codex Desktop reload helper is only required on macOS; skipping.')
  process.exit(0)
}

const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
const pids = stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    const match = line.match(/^(\d+)\s+(.+)$/)
    if (!match) return []
    const [, pid, command] = match
    return command.includes('/Applications/ChatGPT.app/') && command.includes(' app-server') && command.includes('/codex')
      ? [Number(pid)]
      : []
  })

if (pids.length === 0) {
  console.log('No ChatGPT Codex app-server process is running; nothing to reload.')
  process.exit(0)
}

const child = spawn(process.execPath, ['-e', `
  const pids = ${JSON.stringify(pids)};
  setTimeout(() => {
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM'); }
      catch (error) { if (error?.code !== 'ESRCH') console.error(error); }
    }
  }, 1200);
`], {
  detached: true,
  stdio: 'ignore',
})
child.unref()

console.log(`Scheduled reload of ${pids.length} ChatGPT Codex app-server process(es).`)
