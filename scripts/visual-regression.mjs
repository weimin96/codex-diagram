import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-regression-'))
const fixtureDir = path.join(root, 'tests/fixtures/visual-stress')
const baselineDir = path.join(root, 'tests/fixtures/visual-baseline')
const resultDir = path.join(root, 'test-results/visual-regression')
const update = process.argv.includes('--update')
const probe = process.env.VISUAL_REGRESSION_PROBE === '1'

if (update && probe) throw new Error('VISUAL_REGRESSION_PROBE cannot be used while updating baselines.')

try {
  const chrome = await findChrome()
  if (!chrome) {
    throw new Error('视觉回归未执行：未找到 Chrome/Chromium。')
  }
  const cases = await loadCases(fixtureDir)
  await run(chrome, cases)
} finally {
  await rm(temp, { recursive: true, force: true })
}

async function run(chrome, cases) {
  const publicDir = path.join(temp, 'public')
  const entry = path.join(temp, 'visual-regression.ts')
  const port = 19820 + Math.floor(Math.random() * 600)
  await mkdir(publicDir, { recursive: true })
  if (!update) {
    try {
      await access(baselineDir)
      await cp(baselineDir, path.join(publicDir, 'baseline'), { recursive: true })
    } catch {
      throw new Error('Visual baselines are missing. Run `pnpm visual:regression:update` once to create them.')
    }
  }
  await writeFile(entry, browserEntry(cases, update, probe), 'utf8')
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
    if (!match) throw new Error('Visual regression browser did not return a result payload.')
    const result = JSON.parse(decodeHtml(match[1]))
    const failed = result.filter((item) => !item.ok)
    if (failed.length) {
      throw new Error(`Visual regression failures:\n${failed.map((item) => `${item.mode}/${item.name}: ${item.error}`).join('\n')}`)
    }

    if (update) {
      await rm(baselineDir, { recursive: true, force: true })
      for (const item of result) {
        if (!item.ok || !item.png) continue
        const target = path.join(baselineDir, item.mode, `${safeName(item.name)}.png`)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, Buffer.from(item.png.split(',', 2)[1], 'base64'))
      }
      const manifest = {
        version: 1,
        viewport: { width: 1400, height: 1000, padding: 48 },
        cases: result.filter((item) => item.ok).map(({ mode, type, name, diagramWidth, diagramHeight }) => ({ mode, type, name, diagramWidth, diagramHeight })),
      }
      await writeFile(path.join(baselineDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      console.log(`Updated ${result.filter((item) => item.ok).length} visual baselines in ${path.relative(root, baselineDir)}.`)
    } else {
      for (const mode of ['light', 'dark']) {
        const rows = result.filter((item) => item.mode === mode)
        const maxChanged = Math.max(...rows.map((item) => item.diff?.significantRatio ?? 0))
        const maxMacro = Math.max(...rows.map((item) => item.diff?.macroRatio ?? 0))
        console.log(`${mode}: ${rows.filter((item) => item.ok).length}/${rows.length} matched · maxPixels=${percent(maxChanged)} · maxMacro=${percent(maxMacro)}`)
      }
      const regressions = result.filter((item) => item.ok && item.diff?.regressed)
      if (regressions.length) {
        await writeRegressionArtifacts(regressions)
        throw new Error(`Visual regressions detected:\n${regressions.map((item) => `${item.mode}/${item.name}: pixels=${percent(item.diff.significantRatio)}, mean=${percent(item.diff.meanDelta)}, macro=${percent(item.diff.macroRatio)}`).join('\n')}`)
      }
      console.log(`Codex Diagram pixel visual regression passed: ${result.length} golden renders.`)
    }
  } finally {
    server.kill('SIGTERM')
  }
}

async function writeRegressionArtifacts(regressions) {
  await rm(resultDir, { recursive: true, force: true })
  await mkdir(resultDir, { recursive: true })
  for (const item of regressions) {
    const prefix = `${item.mode}__${safeName(item.name)}`
    const baseline = path.join(baselineDir, item.mode, `${safeName(item.name)}.png`)
    await cp(baseline, path.join(resultDir, `${prefix}.baseline.png`))
    if (item.currentPng) await writeDataUrl(path.join(resultDir, `${prefix}.current.png`), item.currentPng)
    if (item.diffPng) await writeDataUrl(path.join(resultDir, `${prefix}.diff.png`), item.diffPng)
  }
  console.error(`Visual regression artifacts: ${path.relative(root, resultDir)}`)
}

async function writeDataUrl(target, dataUrl) {
  const encoded = dataUrl.split(',', 2)[1]
  if (!encoded) return
  await writeFile(target, Buffer.from(encoded, 'base64'))
}

async function loadCases(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const cases = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.m(?:md|ermaid)$/i.test(entry.name)) continue
    const stem = entry.name.replace(/\.m(?:md|ermaid)$/i, '')
    const [type, suffix] = stem.split('__', 2)
    cases.push({ type, name: suffix ? `${type}/${suffix}` : type, source: await readFile(path.join(dir, entry.name), 'utf8') })
  }
  if (!cases.length) throw new Error(`No .mmd/.mermaid visual cases found in ${dir}`)
  return cases.sort((a, b) => a.name.localeCompare(b.name))
}

function safeName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, '__')
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`
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
      '--force-device-scale-factor=1',
      '--virtual-time-budget=18000',
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

function browserEntry(cases, update, probe) {
  const grammar = path.join(root, 'src/mermaidVisualGrammar.ts')
  return `
import mermaid from 'mermaid'
import { fitMermaidSvgToContent } from ${JSON.stringify(path.join(root, 'src/mermaidSvg.ts'))}
import { mermaidVisualConfig, normalizeMermaidSourceForRender } from ${JSON.stringify(grammar)}

const WIDTH = 1400
const HEIGHT = 1000
const PADDING = 48
const palettes = {
  light: { background:'#ffffff', surface:'#fafafa', raised:'#f4f4f5', muted:'#eeeeef', text:'#18181b', secondaryText:'#6b7280', border:'#d4d4d8', strongBorder:'#a1a1aa', accent:'#2563eb', success:'#16803a', warning:'#b45309', danger:'#c9362b' },
  dark: { background:'#18181b', surface:'#202024', raised:'#27272a', muted:'#303036', text:'#f4f4f5', secondaryText:'#a1a1aa', border:'#3f3f46', strongBorder:'#52525b', accent:'#60a5fa', success:'#4ade80', warning:'#f59e0b', danger:'#f87171' },
}
const cases = ${JSON.stringify(cases)}
const update = ${JSON.stringify(update)}
const probe = ${JSON.stringify(probe)}
const output = []

for (const mode of ['light', 'dark']) {
  for (const testCase of cases) {
    try {
      const current = await rasterize(testCase, mode)
      if (probe && mode === 'light' && testCase === cases[0]) {
        const ctx = current.canvas.getContext('2d')
        ctx.fillStyle = '#ff00ff'
        ctx.fillRect(80, 80, 220, 120)
      }
      if (update) {
        output.push({ mode, type: testCase.type, name: testCase.name, ok: true, png: current.canvas.toDataURL('image/png'), diagramWidth: current.diagramWidth, diagramHeight: current.diagramHeight })
        continue
      }
      const baseline = await loadImage('/baseline/' + mode + '/' + safeName(testCase.name) + '.png')
      const baselineCanvas = document.createElement('canvas')
      baselineCanvas.width = WIDTH
      baselineCanvas.height = HEIGHT
      baselineCanvas.getContext('2d').drawImage(baseline, 0, 0, WIDTH, HEIGHT)
      const diff = compareCanvases(baselineCanvas, current.canvas)
      output.push({
        mode,
        type: testCase.type,
        name: testCase.name,
        ok: true,
        diff: diff.metrics,
        currentPng: diff.metrics.regressed ? current.canvas.toDataURL('image/png') : undefined,
        diffPng: diff.metrics.regressed ? diff.canvas.toDataURL('image/png') : undefined,
        diagramWidth: current.diagramWidth,
        diagramHeight: current.diagramHeight,
      })
    } catch (error) {
      output.push({ mode, type: testCase.type, name: testCase.name, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

async function rasterize(testCase, mode) {
  const source = normalizeMermaidSourceForRender(testCase.type, testCase.source)
  const config = mermaidVisualConfig(testCase.type, palettes[mode], source)
  mermaid.initialize({ ...config, fontFamily: config.fontFamily ?? 'Arial, sans-serif' })
  const { svg: renderedSvg } = await mermaid.render('golden-' + mode + '-' + safeName(testCase.name) + '-' + Math.random().toString(36).slice(2), source)
  const svg = fitMermaidSvgToContent(renderedSvg, config.themeVariables?.background)
  document.body.replaceChildren()
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const svgEl = parsed.documentElement
  const viewBox = (svgEl.getAttribute('viewBox') || '').split(/\\s+/).map(Number)
  const diagramWidth = viewBox.length === 4 ? viewBox[2] : Number.parseFloat(svgEl.getAttribute('width') || '0')
  const diagramHeight = viewBox.length === 4 ? viewBox[3] : Number.parseFloat(svgEl.getAttribute('height') || '0')
  if (!(diagramWidth > 0) || !(diagramHeight > 0)) throw new Error('invalid SVG dimensions ' + diagramWidth + 'x' + diagramHeight)
  svgEl.setAttribute('width', String(diagramWidth))
  svgEl.setAttribute('height', String(diagramHeight))
  const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svgEl))
  const image = await loadImage(encoded)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.fillStyle = palettes[mode].background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const scale = Math.min((WIDTH - PADDING * 2) / diagramWidth, (HEIGHT - PADDING * 2) / diagramHeight, 1)
  const width = diagramWidth * scale
  const height = diagramHeight * scale
  ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height)
  return { canvas, diagramWidth: Math.round(diagramWidth), diagramHeight: Math.round(diagramHeight) }
}

function compareCanvases(expected, actual) {
  const a = expected.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data
  const b = actual.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data
  let significant = 0
  let totalDelta = 0
  const cell = 20
  const cols = Math.ceil(WIDTH / cell)
  const rows = Math.ceil(HEIGHT / cell)
  const macroA = new Float64Array(cols * rows)
  const macroB = new Float64Array(cols * rows)
  const counts = new Uint32Array(cols * rows)
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const pixel = (y * WIDTH + x) * 4
      const dr = Math.abs(a[pixel] - b[pixel])
      const dg = Math.abs(a[pixel + 1] - b[pixel + 1])
      const db = Math.abs(a[pixel + 2] - b[pixel + 2])
      const max = Math.max(dr, dg, db)
      if (max > 32) significant += 1
      totalDelta += dr + dg + db
      const bucket = Math.floor(y / cell) * cols + Math.floor(x / cell)
      macroA[bucket] += a[pixel] * 0.2126 + a[pixel + 1] * 0.7152 + a[pixel + 2] * 0.0722
      macroB[bucket] += b[pixel] * 0.2126 + b[pixel + 1] * 0.7152 + b[pixel + 2] * 0.0722
      counts[bucket] += 1
    }
  }
  let macroChanged = 0
  for (let index = 0; index < macroA.length; index += 1) {
    const delta = Math.abs(macroA[index] - macroB[index]) / Math.max(1, counts[index]) / 255
    if (delta > 0.025) macroChanged += 1
  }
  const significantRatio = significant / (WIDTH * HEIGHT)
  const meanDelta = totalDelta / (WIDTH * HEIGHT * 3 * 255)
  const macroRatio = macroChanged / macroA.length
  const regressed = meanDelta > 0.006 || macroRatio > 0.08 || (significantRatio > 0.025 && macroRatio > 0.025)
  const metrics = { significantRatio, meanDelta, macroRatio, regressed }
  if (!regressed) return { metrics }
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(WIDTH, HEIGHT)
  for (let pixel = 0; pixel < a.length; pixel += 4) {
    const dr = Math.abs(a[pixel] - b[pixel])
    const dg = Math.abs(a[pixel + 1] - b[pixel + 1])
    const db = Math.abs(a[pixel + 2] - b[pixel + 2])
    const changed = Math.max(dr, dg, db) > 32
    if (changed) {
      image.data[pixel] = 239
      image.data[pixel + 1] = 68
      image.data[pixel + 2] = 68
    } else {
      const gray = Math.round((a[pixel] + a[pixel + 1] + a[pixel + 2]) / 3 * 0.42 + 118)
      image.data[pixel] = gray
      image.data[pixel + 1] = gray
      image.data[pixel + 2] = gray
    }
    image.data[pixel + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return { metrics, canvas }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('failed to load image ' + src.slice(0, 120)))
    image.src = src
  })
}

function safeName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, '__')
}

const pre = document.createElement('pre')
pre.id = 'result'
pre.textContent = JSON.stringify(output)
document.body.appendChild(pre)
`
}
