import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-visual-'))
const sourceDir = readSourceDirArg(process.argv.slice(2))

try {
  const chrome = await findChrome()
  if (!chrome) {
    console.log('Codex Diagram visual smoke skipped: Chrome/Chromium not found.')
  } else {
    const externalCases = sourceDir ? await loadExternalCases(sourceDir) : undefined
    await runVisualSmoke(chrome, externalCases)
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}

async function runVisualSmoke(chrome, externalCases) {
  const publicDir = path.join(temp, 'public')
  const entry = path.join(temp, 'visual-smoke.ts')
  const port = 18765 + Math.floor(Math.random() * 1000)
  await mkdir(publicDir, { recursive: true })
  await writeFile(entry, browserEntry(externalCases), 'utf8')
  await build({
    entryPoints: [entry],
    outfile: path.join(publicDir, 'test.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    nodePaths: [path.join(root, 'node_modules')],
    logLevel: 'silent',
  })
  await writeFile(
    path.join(publicDir, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/test.js"></script></body></html>',
    'utf8',
  )

  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', publicDir], { stdio: 'ignore' })
  try {
    await delay(350)
    const dom = await captureDom(chrome, `http://127.0.0.1:${port}/`)
    const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
    if (!match) throw new Error('Visual smoke browser did not return a result payload.')
    const result = JSON.parse(decodeHtml(match[1]))
    const failed = result.filter((item) => !item.ok)
    const oversized = result.filter((item) => item.ok && (item.width > 1800 || item.height > 1400))
    for (const mode of ['light', 'dark']) {
      const rows = result.filter((item) => item.mode === mode)
      console.log(`${mode}: ${rows.filter((item) => item.ok).length}/${rows.length} rendered`)
    }
    if (failed.length) {
      throw new Error(`Visual smoke render failures:\n${failed.map((item) => `${item.mode}/${item.type}: ${item.error}`).join('\n')}`)
    }
    if (oversized.length) {
      throw new Error(`Visual smoke oversized diagrams:\n${oversized.map((item) => `${item.mode}/${item.type}: ${item.width}x${item.height}`).join('\n')}`)
    }
    console.log(`Codex Diagram visual smoke passed: ${result.length} browser renders${externalCases ? ' from external cases' : ''}.`)
  } finally {
    server.kill('SIGTERM')
  }
}

function readSourceDirArg(args) {
  const index = args.indexOf('--source-dir')
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value) throw new Error('--source-dir requires a directory path.')
  return path.resolve(value)
}

async function loadExternalCases(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const cases = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.m(?:md|ermaid)$/i.test(entry.name)) continue
    const type = entry.name.replace(/\.m(?:md|ermaid)$/i, '')
    cases.push({ type, source: await readFile(path.join(dir, entry.name), 'utf8') })
  }
  if (!cases.length) throw new Error(`No .mmd/.mermaid visual cases found in ${dir}`)
  return cases.sort((a, b) => a.type.localeCompare(b.type))
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }
  return undefined
}

function captureDom(chrome, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--virtual-time-budget=12000',
      '--dump-dom',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`Chrome exited ${code}: ${stderr.slice(-1200)}`))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decodeHtml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function browserEntry(externalCases) {
  const templates = path.join(root, 'src/templates.ts')
  const types = path.join(root, 'src/types.ts')
  const grammar = path.join(root, 'src/mermaidVisualGrammar.ts')
  return `
import mermaid from 'mermaid'
import { createTemplate } from ${JSON.stringify(templates)}
import { mermaidDiagramTypes } from ${JSON.stringify(types)}
import { mermaidVisualConfig } from ${JSON.stringify(grammar)}

const palettes = {
  light: { background:'#ffffff', surface:'#fafafa', raised:'#f4f4f5', muted:'#eeeeef', text:'#18181b', secondaryText:'#6b7280', border:'#d4d4d8', strongBorder:'#a1a1aa', accent:'#2563eb', success:'#16803a', warning:'#b45309', danger:'#c9362b' },
  dark: { background:'#18181b', surface:'#202024', raised:'#27272a', muted:'#303036', text:'#f4f4f5', secondaryText:'#a1a1aa', border:'#3f3f46', strongBorder:'#52525b', accent:'#60a5fa', success:'#4ade80', warning:'#f59e0b', danger:'#f87171' },
}
const output = []
const externalCases = ${JSON.stringify(externalCases ?? null)}
for (const mode of ['light', 'dark']) {
  const cases = externalCases || mermaidDiagramTypes.map(({ type }) => ({ type, source: createTemplate(type, '测试图表') }))
  for (const { type, source } of cases) {
    try {
      mermaid.initialize({ ...mermaidVisualConfig(type, palettes[mode], source), fontFamily: 'Arial, sans-serif' })
      const { svg } = await mermaid.render('smoke-' + mode + '-' + type + '-' + Math.random().toString(36).slice(2), source)
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      const root = doc.documentElement
      const viewBox = (root.getAttribute('viewBox') || '').split(/\\s+/).map(Number)
      const width = viewBox.length === 4 ? viewBox[2] : Number.parseFloat(root.getAttribute('width') || '0')
      const height = viewBox.length === 4 ? viewBox[3] : Number.parseFloat(root.getAttribute('height') || '0')
      output.push({ mode, type, ok: true, width: Math.round(width), height: Math.round(height) })
    } catch (error) {
      output.push({ mode, type, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    document.body.replaceChildren()
  }
}
const pre = document.createElement('pre')
pre.id = 'result'
pre.textContent = JSON.stringify(output)
document.body.appendChild(pre)
`
}
