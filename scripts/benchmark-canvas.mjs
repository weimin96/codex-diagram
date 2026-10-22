import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodesArg = process.argv.indexOf('--nodes')
const nodeCount = nodesArg < 0 ? 360 : Number(process.argv[nodesArg + 1])
if (!Number.isInteger(nodeCount) || nodeCount < 1 || nodeCount > 10000) throw new Error('--nodes expects an integer between 1 and 10000')
const dragMode = process.argv.includes('--drag')
const panMode = process.argv.includes('--pan')
const selectMode = process.argv.includes('--select')
if (Number(dragMode) + Number(panMode) + Number(selectMode) > 1) throw new Error('Choose one of --drag, --pan or --select')
const detailMode = process.argv.includes('--detail')
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
  await writeFile(entry, browserSource(nodeCount), 'utf8')
  await build({
    entryPoints: [entry], outfile: script, bundle: true, platform: 'browser', format: 'esm',
    nodePaths: [path.join(root, 'node_modules')],
    // Benchmark the actual production React runtime, never the JSX development instrumentation.
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  // Use the same compiled stylesheet as the actual plugin. Without it the selection
  // inspector overlays the entire canvas and the benchmark clicks only one node.
  const stylesheetPath = path.join(root, 'src/styles.css')
  const compiledStylesheet = await postcss([tailwindcss()]).process(await readFile(stylesheetPath, 'utf8'), {
    from: stylesheetPath, to: path.join(temp, 'bench.css'),
  })
  const css = compiledStylesheet.css
  const html = '<!doctype html><html><head><link rel="stylesheet" href="/bench.css"></head><body><div id="root" style="display:flex"></div><script type="module" src="/bench.js"></script></body></html>'
  server = createServer(async (req, res) => {
    if (req.url === '/bench.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' })
      res.end(await readFile(script))
    } else if (req.url === '/bench.css') {
      res.writeHead(200, { 'content-type': 'text/css' })
      res.end(css)
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
  await client.send('Performance.enable')
  await until(async () => {
    const result = await client.send('Runtime.evaluate', { expression: 'window.__canvasBench?.ready === true && Boolean(document.querySelector(\'button[aria-label="缩小画布"]\'))', returnByValue: true })
    return result.result?.value === true
  }, 'Canvas benchmark mounted')

  if (detailMode) {
    const detail = await client.send('Runtime.evaluate', {
      expression: 'window.__canvasBench.enterDetail()', awaitPromise: true, returnByValue: true,
    })
    if (detail.exceptionDetails) throw new Error(detail.exceptionDetails.text)
    if (nodeCount >= 3000 && !detail.result?.value?.level?.includes('细节')) {
      throw new Error(`Did not enter Canvas detail view: ${JSON.stringify(detail.result?.value)}`)
    }
  }

  const before = await client.send('Performance.getMetrics')
  const events = []
  const complete = new Promise((resolve) => client.on('Tracing.tracingComplete', resolve))
  client.on('Tracing.dataCollected', (message) => events.push(...message.value))
  await client.send('Tracing.start', { categories: 'devtools.timeline,blink,v8,cc', transferMode: 'ReportEvents' })
  let response
  if (panMode) {
    const target = (await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.panTarget()', returnByValue: true })).result?.value
    if (!target) throw new Error('No available Canvas background pan target')
    const { x, y } = target
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'middle', buttons: 4, clickCount: 1 })
    for (let step = 1; step <= 20; step += 1) {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - step * 10, y: y - step * 5, button: 'middle', buttons: 4 })
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - 200, y: y - 100, button: 'middle', buttons: 0, clickCount: 1 })
    await new Promise((resolve) => setTimeout(resolve, 200))
    response = await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.panResult()', returnByValue: true })
  } else if (selectMode) {
    const targets = (await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.selectionTargets()', returnByValue: true })).result?.value
    if (!targets?.length) throw new Error('No visible nodes for Canvas selection benchmark')
    const selections = []
    for (let step = 0; step < 16; step += 1) {
      const { x, y } = targets[step % targets.length]
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
      await new Promise((resolve) => setTimeout(resolve, 65))
      selections.push((await client.send('Runtime.evaluate', {
        expression: 'document.querySelector("g.freeform-box.is-selected")?.textContent', returnByValue: true,
      })).result?.value)
    }
    response = await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.selectionResult()', returnByValue: true })
    const distinctSelections = new Set(selections.filter(Boolean)).size
    if (distinctSelections < 8) {
      throw new Error(`Canvas selection benchmark did not exercise 8 distinct nodes: ${JSON.stringify({ selections, targets: targets.slice(0, 16) })}`)
    }
    response.result.value.distinctSelections = distinctSelections
  } else if (dragMode) {
    const position = await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.dragTarget()', returnByValue: true })
    const target = position.result?.value
    if (!target) throw new Error('No visible drag target')
    const { x, y } = target
    const labelBefore = detailMode ? (await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.sampleConnectedLabel()', returnByValue: true })).result?.value : null
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
    let labelDuring = null
    for (let step = 1; step <= 16; step += 1) {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + step * 3, y: y + step * 2, button: 'left', buttons: 1 })
      await new Promise((resolve) => setTimeout(resolve, 35))
      if (step === 8 && detailMode) {
        labelDuring = (await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.sampleConnectedLabel()', returnByValue: true })).result?.value
      }
    }
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 48, y: y + 32, button: 'left', buttons: 0, clickCount: 1 })
    await new Promise((resolve) => setTimeout(resolve, 250))
    response = await client.send('Runtime.evaluate', { expression: 'window.__canvasBench.dragResult()', returnByValue: true })
    if (detailMode && nodeCount >= 3000 && (!labelBefore || !labelDuring
      || Math.hypot(labelDuring.x - labelBefore.x, labelDuring.y - labelBefore.y) < 0.1)) {
      throw new Error(`Connected arrow label did not follow the moving node: ${JSON.stringify({ labelBefore, labelDuring, drag: response.result?.value, target })}`)
    }
  } else {
    response = await client.send('Runtime.evaluate', {
      expression: 'window.__canvasBench.run()', awaitPromise: true, returnByValue: true,
    })
  }
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  const result = response.result?.value
  if (!dragMode && !panMode && !selectMode && (!result?.zooms || !result.visibleNodesStable)) {
    throw new Error('Canvas zoom fixture did not render consistently')
  }
  if (dragMode && (!result?.moved || !result.committed)) {
    throw new Error(`Canvas drag did not update and commit a node: ${JSON.stringify(result)}`)
  }
  if (panMode && !result?.moved) throw new Error(`Canvas pan did not move viewport: ${JSON.stringify(result)}`)
  if (selectMode && (!result?.changed || !result?.labelsStable)) throw new Error(`Canvas selection or unchanged label positions failed: ${JSON.stringify(result)}`)
  await client.send('Tracing.end')
  await Promise.race([complete, new Promise((_, reject) => setTimeout(() => reject(new Error('Chrome trace timeout')), 15000))])
  if (traceFile) await writeFile(traceFile, JSON.stringify({ traceEvents: events }))
  const after = await client.send('Performance.getMetrics')
  const heap = (metrics) => metrics.metrics.find((item) => item.name === 'JSHeapUsedSize')?.value ?? 0
  if (!dragMode && !panMode && !selectMode) {
    const anchorCheck = await client.send('Runtime.evaluate', {
      expression: 'window.__canvasBench.checkAnchors()', awaitPromise: true, returnByValue: true,
    })
    if (anchorCheck.exceptionDetails) throw new Error(anchorCheck.exceptionDetails.text)
    if (anchorCheck.result?.value?.connecting !== result.nodes * 4 || anchorCheck.result?.value?.selecting !== 0) {
      throw new Error('Canvas anchor visibility changed across select/connect modes')
    }
    if (nodeCount >= 3000) {
      const transition = await client.send('Runtime.evaluate', {
        expression: 'window.__canvasBench.checkDetail()', awaitPromise: true, returnByValue: true,
      })
      if (transition.exceptionDetails) throw new Error(transition.exceptionDetails.text)
      if (transition.result?.value?.detail <= 640 || transition.result?.value?.overview > 640
        || !transition.result?.value?.detailLevel?.includes('紧凑') || !transition.result?.value?.overviewLevel?.includes('概览')) {
        throw new Error(`Canvas detail/overview LOD transition failed: ${JSON.stringify(transition.result?.value)}`)
      }
    }
  }
  const metrics = Object.fromEntries(['FunctionCall', 'Layout', 'Paint', 'UpdateLayoutTree'].map((name) => {
    const times = events.filter((event) => event.ph === 'X' && event.name === name).map((event) => event.dur / 1000)
    return [name, { count: times.length, totalMs: +times.reduce((sum, time) => sum + time, 0).toFixed(1), maxMs: +Math.max(0, ...times).toFixed(1) }]
  }))
  console.log(JSON.stringify({ mode: 'production', view: detailMode ? 'detail' : 'default', interaction: dragMode ? 'drag' : panMode ? 'pan' : selectMode ? 'select' : 'zoom', configuredNodes: nodeCount, ...result, metrics,
    heapMB: { before: +(heap(before) / 1048576).toFixed(1), after: +(heap(after) / 1048576).toFixed(1) },
    ...(traceFile ? { traceFile } : {}) }, null, 2))
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

function browserSource(nodeCount) {
  return `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { CanvasEditor } from ${JSON.stringify(path.join(root, 'src/CanvasEditor.tsx'))}
    const elements = []
    const cols = ${nodeCount} === 360 ? 36 : Math.ceil(Math.sqrt(${nodeCount} * 2))
    for (let i = 0; i < ${nodeCount}; i += 1) {
      const col = i % cols, row = Math.floor(i / cols), id = 'n-' + i
      elements.push({ id, type: 'node', x: 50 + col * 240, y: 50 + row * 160, width: 170, height: 92,
        text: 'Service ' + i, subtitle: 'Runtime ' + i, icon: 'service', tone: 'accent' })
      if (col) elements.push({ id: 'e-' + i, type: 'arrow', from: 'n-' + (i - 1), to: id, label: 'service route ' + i, routing: 'orthogonal' })
      if (row && col % 2 === 0) elements.push({ id: 'v-' + i, type: 'arrow', from: 'n-' + (i - cols), to: id, label: 'data flow ' + i, routing: 'orthogonal' })
    }
    const scene = { type: 'diagram-plugin-canvas', version: 1, title: 'Benchmark', width: cols * 240 + 100, height: Math.ceil(${nodeCount} / cols) * 160 + 120, elements }
    let committed = null
    createRoot(document.getElementById('root')).render(React.createElement(CanvasEditor, { source: JSON.stringify(scene), onChange: next => { committed = JSON.parse(next) } }))
    window.__canvasBench = {
      ready: false,
      panTarget() {
        const svg = document.querySelector('svg.freeform-svg')
        if (!svg) return null
        this.startView = svg.getAttribute('viewBox')
        const bounds = svg.getBoundingClientRect()
        for (let y = bounds.top + 220; y < bounds.bottom - 20; y += 29) {
          for (let x = bounds.left + 310; x < bounds.right - 20; x += 37) {
            if (document.elementFromPoint(x, y) === svg) return { x: Math.round(x), y: Math.round(y) }
          }
        }
        return null
      },
      panResult() {
        const svg = document.querySelector('svg.freeform-svg')
        return { moved: Boolean(this.startView && svg?.getAttribute('viewBox') !== this.startView),
          startView: this.startView, endView: svg?.getAttribute('viewBox'),
          nodes: document.querySelectorAll('g.freeform-box').length,
          arrows: document.querySelectorAll('g.freeform-arrow').length,
          svgElements: document.querySelectorAll('svg *').length }
      },
      selectionTargets() {
        const nodes = [...document.querySelectorAll('g.freeform-box')].filter(item => {
          const rect = item.getBoundingClientRect()
          return rect.width > 6 && rect.height > 6 && rect.x > 0 && rect.y > 0
            && rect.right < window.innerWidth && rect.bottom < window.innerHeight
            && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('g.freeform-box') === item
        })
        this.initialSelected = document.querySelector('g.freeform-box.is-selected')?.textContent
        this.labelPositionsBefore = [...document.querySelectorAll('.freeform-arrow-label')].slice(0, 16).map(item => item.outerHTML)
        return nodes.filter((_, index) => index % Math.max(1, Math.floor(nodes.length / 32)) === 0).slice(0, 24).map(item => {
          const bounds = item.getBoundingClientRect()
          return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) }
        })
      },
      selectionResult() {
        const selected = [...document.querySelectorAll('g.freeform-box.is-selected')].map(item => item.textContent)
        return { changed: selected.length > 0 && selected[0] !== this.initialSelected,
          labelsStable: JSON.stringify(this.labelPositionsBefore) === JSON.stringify([...document.querySelectorAll('.freeform-arrow-label')].slice(0, 16).map(item => item.outerHTML)),
          selectionCount: selected.length, steps: 16, nodes: document.querySelectorAll('g.freeform-box').length,
          arrows: document.querySelectorAll('g.freeform-arrow').length,
          svgElements: document.querySelectorAll('svg *').length }
      },
      async enterDetail() {
        const zoom = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === '放大画布')
        if (!zoom) throw new Error('Zoom button missing')
        for (let i = 0; i < 3; i += 1) {
          zoom.click()
          await new Promise(resolve => setTimeout(resolve, 160))
        }
        return { level: document.querySelector('.freeform-large-scene-hint')?.textContent,
          nodes: document.querySelectorAll('g.freeform-box').length,
          arrows: document.querySelectorAll('g.freeform-arrow').length,
          svgElements: document.querySelectorAll('svg *').length }
      },
      dragTarget() {
        const box = [...document.querySelectorAll('g.freeform-box')].find(node => {
          const r = node.getBoundingClientRect()
          return r.width > 5 && r.height > 5 && r.left > 0 && r.top > 0 && r.right < window.innerWidth - 2 && r.bottom < window.innerHeight - 2
            && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('g.freeform-box') === node
        })
        if (!box) return null
        const r = box.getBoundingClientRect()
        this.dragId = box.textContent?.match(/Service\\s*(\\d+)/i)?.[1]
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      },
      sampleConnectedLabel() {
        const index = Number(this.dragId)
        const connectedRoute = 'service route ' + (index % cols === 0 ? index + 1 : index)
        const arrow = [...document.querySelectorAll('g.freeform-arrow')].find(item => item.querySelector('title')?.textContent === connectedRoute)
        const label = arrow?.querySelector('.freeform-arrow-label')
        if (!label) return null
        const rect = label.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      },
      dragResult() {
        const boxes = document.querySelectorAll('g.freeform-box')
        const id = 'n-' + this.dragId
        const original = scene.elements.find(item => item.id === id)
        const moved = committed?.elements.find(item => item.id === id)
        return { nodes: boxes.length, arrows: document.querySelectorAll('g.freeform-arrow').length,
          moved: Boolean(moved && original && (moved.x !== original.x || moved.y !== original.y)),
          movedNodeId: id,
          committed: Boolean(committed && committed.elements.filter(item => item.type !== 'arrow').length === ${nodeCount}), steps: 16,
          svgElements: document.querySelectorAll('svg *').length }
      },
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
      async checkDetail() {
        const button = label => [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label)
        button('放大画布').click()
        await new Promise(resolve => setTimeout(resolve, 180))
        const detail = document.querySelectorAll('g.freeform-box').length
        const detailLevel = document.querySelector('.freeform-large-scene-hint')?.textContent
        button('缩小画布').click()
        await new Promise(resolve => setTimeout(resolve, 180))
        return { detail, detailLevel, overview: document.querySelectorAll('g.freeform-box').length,
          overviewLevel: document.querySelector('.freeform-large-scene-hint')?.textContent }
      },
    }
    window.__canvasBench.ready = true
  `
}
