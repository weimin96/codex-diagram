import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const traceArg = process.argv.indexOf('--trace')
if (traceArg >= 0 && !process.argv[traceArg + 1]) throw new Error('--trace requires an output filename')
const traceFile = traceArg >= 0 ? path.resolve(process.argv[traceArg + 1]) : null
const temp = await mkdtemp(path.join(os.tmpdir(), 'diagram-canvas-bench-'))

let server
let chrome
let socket
try {
  const chromePath = await findChrome()
  const entry = path.join(temp, 'bench.tsx')
  const script = path.join(temp, 'bench.js')
  await writeFile(entry, browserSource(), 'utf8')
  await build({
    entryPoints: [entry], outfile: script, bundle: true, platform: 'browser', format: 'esm',
    nodePaths: [path.join(root, 'node_modules')],
    // Benchmark the actual production React runtime, never the JSX development instrumentation.
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  const html = '<!doctype html><html><body><div id="root"></div><script type="module" src="/bench.js"></script></body></html>'
  server = createServer(async (req, res) => {
    if (req.url === '/bench.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' })
      res.end(await readFile(script))
    } else {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html)
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const profile = path.join(temp, 'chrome')
  chrome = spawn(chromePath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, '--window-size=1365,850', `http://127.0.0.1:${port}/`,
  ], { stdio: 'ignore' })

  const activePort = path.join(profile, 'DevToolsActivePort')
  await until(async () => {
    try { await access(activePort); return true } catch { return false }
  }, 'Chrome debugging port')
  const [debugPort] = (await readFile(activePort, 'utf8')).split('\n')
  let page
  await until(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    page = targets.find((target) => target.type === 'page' && target.url.includes(`:${port}/`))
    return Boolean(page)
  }, 'benchmark Chrome page')
  const client = await connectCdp(page.webSocketDebuggerUrl)
  socket = client.socket
  await client.send('Runtime.enable')
  await until(async () => {
    const result = await client.send('Runtime.evaluate', { expression: 'window.__canvasBench?.ready === true && Boolean(document.querySelector(\'button[aria-label="缩小画布"]\'))', returnByValue: true })
    return result.result?.value === true
  }, 'Canvas benchmark mounted')

  const events = []
  const complete = new Promise((resolve) => client.on('Tracing.tracingComplete', resolve))
  client.on('Tracing.dataCollected', (message) => events.push(...message.value))
  await client.send('Tracing.start', { categories: 'devtools.timeline,blink,v8,cc', transferMode: 'ReportEvents' })
  const response = await client.send('Runtime.evaluate', {
    expression: 'window.__canvasBench.run()', awaitPromise: true, returnByValue: true,
  })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  const result = response.result?.value
  if (result?.nodes !== 360 || result?.arrows !== 512 || !result.visibleNodesStable) {
    throw new Error('Canvas benchmark fixture did not render consistently')
  }
  await client.send('Tracing.end')
  await Promise.race([complete, new Promise((_, reject) => setTimeout(() => reject(new Error('Chrome trace timeout')), 15000))])
  if (traceFile) await writeFile(traceFile, JSON.stringify({ traceEvents: events }))
  const anchorCheck = await client.send('Runtime.evaluate', {
    expression: 'window.__canvasBench.checkAnchors()', awaitPromise: true, returnByValue: true,
  })
  if (anchorCheck.exceptionDetails) throw new Error(anchorCheck.exceptionDetails.text)
  if (anchorCheck.result?.value?.connecting !== result.nodes * 4 || anchorCheck.result?.value?.selecting !== 0) {
    throw new Error('Canvas anchor visibility changed across select/connect modes')
  }
  const metrics = Object.fromEntries(['FunctionCall', 'Layout', 'Paint', 'UpdateLayoutTree'].map((name) => {
    const times = events.filter((event) => event.ph === 'X' && event.name === name).map((event) => event.dur / 1000)
    return [name, { count: times.length, totalMs: +times.reduce((sum, time) => sum + time, 0).toFixed(1), maxMs: +Math.max(0, ...times).toFixed(1) }]
  }))
  console.log(JSON.stringify({ mode: 'production', ...result, metrics, ...(traceFile ? { traceFile } : {}) }, null, 2))
} finally {
  socket?.close()
  chrome?.kill('SIGTERM')
  if (server) await new Promise((resolve) => server.close(resolve))
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

async function until(check, what) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if (await check()) return } catch { /* Chrome may not be listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${what}`)
}

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
  for (const candidate of candidates) {
    try { await access(candidate); return candidate } catch { /* Try the next known installation */ }
  }
  throw new Error('Chrome not found; set CHROME_BIN to its executable path')
}

async function connectCdp(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  const listeners = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(message.error.message))
      else request?.resolve(message.result)
    } else for (const listener of listeners.get(message.method) ?? []) listener(message.params)
  })
  return {
    socket,
    send(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    on(event, callback) { listeners.set(event, [...(listeners.get(event) ?? []), callback]) },
  }
}

function browserSource() {
  return `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { CanvasEditor } from ${JSON.stringify(path.join(root, 'src/CanvasEditor.tsx'))}
    const elements = []
    for (let i = 0; i < 360; i += 1) {
      const col = i % 36, row = Math.floor(i / 36), id = 'n-' + i
      elements.push({ id, type: 'node', x: 50 + col * 240, y: 50 + row * 160, width: 170, height: 92,
        text: 'Service ' + i, subtitle: 'Runtime ' + i, icon: 'service', tone: 'accent' })
      if (col) elements.push({ id: 'e-' + i, type: 'arrow', from: 'n-' + (i - 1), to: id, label: 'service route ' + i, routing: 'orthogonal' })
      if (row && col % 2 === 0) elements.push({ id: 'v-' + i, type: 'arrow', from: 'n-' + (i - 36), to: id, label: 'data flow ' + i, routing: 'orthogonal' })
    }
    const scene = { type: 'diagram-plugin-canvas', version: 1, title: 'Benchmark', width: 9150, height: 2100, elements }
    createRoot(document.getElementById('root')).render(React.createElement(CanvasEditor, { source: JSON.stringify(scene), onChange: () => {} }))
    window.__canvasBench = {
      ready: false,
      async run() {
        const buttons = ['缩小画布', '放大画布'].map(label => [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label))
        if (buttons.some(button => !button)) throw new Error('Canvas zoom controls not found')
        const counts = []
        for (let i = 0; i < 12; i += 1) {
          buttons[i % 2].click()
          await new Promise(resolve => setTimeout(resolve, 120))
          counts.push(document.querySelectorAll('g.freeform-box').length)
        }
        return { zooms: counts.length, nodes: counts.at(-1), visibleNodesStable: counts.every(count => count === counts[0]),
          arrows: document.querySelectorAll('g.freeform-arrow').length,
          svgElements: document.querySelectorAll('svg *').length,
          anchorCircles: document.querySelectorAll('.freeform-anchor-points circle').length }
      },
      async checkAnchors() {
        const button = label => [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label)
        const connect = button('节点连接 (C)'), select = button('选择 (V)')
        if (!connect || !select) throw new Error('Canvas connection tools missing')
        connect.click()
        await new Promise(resolve => setTimeout(resolve, 80))
        const connecting = document.querySelectorAll('.freeform-anchor-points circle').length
        select.click()
        await new Promise(resolve => setTimeout(resolve, 80))
        return { connecting, selecting: document.querySelectorAll('.freeform-anchor-points circle').length }
      },
    }
    window.__canvasBench.ready = true
  `
}
