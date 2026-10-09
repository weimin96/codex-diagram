import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const sourceDir = readArg('--source-dir', args)
const outputDir = path.resolve(readArg('--output-dir', args) ?? path.join(root, 'test-results', 'visual-gallery'))
if (!sourceDir) throw new Error('render-gallery requires --source-dir <directory>.')
const resolvedSourceDir = path.resolve(sourceDir)
const temp = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-gallery-'))

try {
  const chrome = await findChrome()
  if (!chrome) throw new Error('Chrome/Chromium not found.')
  const cases = await loadCases(resolvedSourceDir)
  const result = await render(chrome, cases)
  await writeGallery(result)
  console.log(`Rendered ${result.length} gallery image(s) to ${path.relative(root, outputDir) || outputDir}.`)
  console.log(`Gallery: ${path.join(outputDir, 'index.html')}`)
} finally {
  await rm(temp, { recursive: true, force: true })
}

function readArg(name, values) {
  const index = values.indexOf(name)
  if (index < 0) return undefined
  const value = values[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`)
  return value
}

async function loadCases(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const cases = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const fullPath = path.join(dir, entry.name)
    if (/\.m(?:md|ermaid)$/i.test(entry.name)) {
      cases.push({ kind: 'mermaid', name: entry.name.replace(/\.m(?:md|ermaid)$/i, ''), source: await readFile(fullPath, 'utf8') })
    } else if (/\.diagram\.json$/i.test(entry.name)) {
      cases.push({ kind: 'canvas', name: entry.name.replace(/\.diagram\.json$/i, ''), source: await readFile(fullPath, 'utf8') })
    }
  }
  if (!cases.length) throw new Error(`No .mmd/.mermaid/.diagram.json cases found in ${dir}`)
  return cases.sort((a, b) => a.name.localeCompare(b.name))
}

async function render(chrome, cases) {
  const publicDir = path.join(temp, 'public')
  const entry = path.join(temp, 'gallery.ts')
  const port = 20500 + Math.floor(Math.random() * 500)
  await mkdir(publicDir, { recursive: true })
  await writeFile(entry, browserEntry(cases), 'utf8')
  await build({
    entryPoints: [entry],
    outfile: path.join(publicDir, 'gallery.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    nodePaths: [path.join(root, 'node_modules')],
    logLevel: 'silent',
  })
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><meta charset="utf-8"><script type="module" src="/gallery.js"></script>', 'utf8')
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', publicDir], { stdio: 'ignore' })
  try {
    await delay(350)
    const dom = await captureDom(chrome, `http://127.0.0.1:${port}/`)
    const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
    if (!match) throw new Error('Gallery browser did not return a result payload.')
    const result = JSON.parse(decodeHtml(match[1]))
    const failed = result.filter((item) => !item.ok)
    if (failed.length) throw new Error(`Gallery render failures:\n${failed.map((item) => `${item.mode}/${item.name}: ${item.error}`).join('\n')}`)
    return result
  } finally {
    server.kill('SIGTERM')
  }
}

async function writeGallery(result) {
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  for (const item of result) {
    const dir = path.join(outputDir, item.mode)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${safeName(item.name)}.png`), Buffer.from(item.png.split(',', 2)[1], 'base64'))
  }
  const manifest = result.map(({ png, ...item }) => item)
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const cards = result.map((item) => `
    <article>
      <img src="./${item.mode}/${safeName(item.name)}.png" alt="${escapeHtml(item.name)} ${item.mode}">
      <div><strong>${escapeHtml(item.name)}</strong><span>${item.kind} · ${item.mode} · ${item.diagramWidth}×${item.diagramHeight}${item.style ? ` · ${escapeHtml(item.style)}` : ''}</span></div>
    </article>`).join('\n')
  await writeFile(path.join(outputDir, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Codex Diagram Visual Gallery</title>
<style>
body{margin:0;padding:32px;background:#111113;color:#f4f4f5;font:14px ui-sans-serif,system-ui,sans-serif}h1{font-size:22px;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:20px}article{overflow:hidden;border:1px solid #303036;border-radius:10px;background:#1b1b1f}img{display:block;width:100%;aspect-ratio:7/5;object-fit:contain;background:#fff}article:nth-of-type(even) img{background:#18181b}article div{display:flex;justify-content:space-between;gap:16px;padding:12px 14px}span{color:#a1a1aa;font-size:12px}
</style></head><body><h1>Codex Diagram Visual Gallery</h1><main class="grid">${cards}</main></body></html>`, 'utf8')
}

function browserEntry(cases) {
  const grammar = path.join(root, 'src/mermaidVisualGrammar.ts')
  const templates = path.join(root, 'src/templates.ts')
  const canvas = path.join(root, 'src/canvas.ts')
  return `
import mermaid from 'mermaid'
import { mermaidVisualConfig, normalizeMermaidSourceForRender, resolveMermaidVisualStyle } from ${JSON.stringify(grammar)}
import { detectDiagramType } from ${JSON.stringify(templates)}
import { parseCanvasScene, canvasSceneToSvg } from ${JSON.stringify(canvas)}

const WIDTH = 1400
const HEIGHT = 1000
const PADDING = 56
const palettes = {
  light: { background:'#ffffff', surface:'#fafafa', raised:'#f4f4f5', muted:'#eeeeef', text:'#18181b', secondaryText:'#6b7280', border:'#d4d4d8', strongBorder:'#a1a1aa', accent:'#2563eb', success:'#16803a', warning:'#b45309', danger:'#c9362b' },
  dark: { background:'#18181b', surface:'#202024', raised:'#27272a', muted:'#303036', text:'#f4f4f5', secondaryText:'#a1a1aa', border:'#3f3f46', strongBorder:'#52525b', accent:'#60a5fa', success:'#4ade80', warning:'#f59e0b', danger:'#f87171' },
}
const cases = ${JSON.stringify(cases)}
const output = []
for (const mode of ['light','dark']) {
  for (const testCase of cases) {
    try {
      let svg
      let style
      if (testCase.kind === 'canvas') {
        const scene = parseCanvasScene(testCase.source)
        const p = palettes[mode]
        svg = canvasSceneToSvg(scene, { background:p.background, panel:p.raised, text:p.text, border:p.strongBorder, note:p.surface })
        style = scene.architecture?.theme
      } else {
        const type = detectDiagramType(testCase.source)
        if (type === 'unknown') throw new Error('unknown Mermaid type')
        const source = normalizeMermaidSourceForRender(type, testCase.source)
        style = resolveMermaidVisualStyle(source)
        mermaid.initialize({ ...mermaidVisualConfig(type, palettes[mode], source), fontFamily:'Arial, sans-serif' })
        svg = (await mermaid.render('gallery-' + mode + '-' + Math.random().toString(36).slice(2), source)).svg
        document.body.replaceChildren()
      }
      const raster = await rasterize(svg, palettes[mode].background)
      output.push({ mode, kind:testCase.kind, name:testCase.name, style, ok:true, png:raster.png, diagramWidth:raster.diagramWidth, diagramHeight:raster.diagramHeight })
    } catch (error) {
      output.push({ mode, kind:testCase.kind, name:testCase.name, ok:false, error:error instanceof Error ? error.message : String(error) })
    }
  }
}

async function rasterize(svg, background) {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const svgEl = parsed.documentElement
  const viewBox = (svgEl.getAttribute('viewBox') || '').split(/\\s+/).map(Number)
  const diagramWidth = viewBox.length === 4 ? viewBox[2] : Number.parseFloat(svgEl.getAttribute('width') || '0')
  const diagramHeight = viewBox.length === 4 ? viewBox[3] : Number.parseFloat(svgEl.getAttribute('height') || '0')
  if (!(diagramWidth > 0) || !(diagramHeight > 0)) throw new Error('invalid SVG dimensions ' + diagramWidth + 'x' + diagramHeight)
  svgEl.setAttribute('width', String(diagramWidth))
  svgEl.setAttribute('height', String(diagramHeight))
  const image = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svgEl)))
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha:false })
  ctx.fillStyle = background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const scale = Math.min((WIDTH-PADDING*2)/diagramWidth, (HEIGHT-PADDING*2)/diagramHeight, 1)
  const width = diagramWidth*scale
  const height = diagramHeight*scale
  ctx.drawImage(image, (WIDTH-width)/2, (HEIGHT-height)/2, width, height)
  return { png:canvas.toDataURL('image/png'), diagramWidth:Math.round(diagramWidth), diagramHeight:Math.round(diagramHeight) }
}

function loadImage(src) { return new Promise((resolve,reject) => { const image=new Image(); image.onload=()=>resolve(image); image.onerror=()=>reject(new Error('failed to load SVG image')); image.src=src }) }
const pre=document.createElement('pre'); pre.id='result'; pre.textContent=JSON.stringify(output); document.body.appendChild(pre)
`
}

async function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
  for (const candidate of candidates) {
    try { await access(candidate); return candidate } catch {}
  }
}

function captureDom(chrome, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--force-device-scale-factor=1','--virtual-time-budget=18000','--dump-dom',url], { stdio:['ignore','pipe','pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`Chrome exited ${code}: ${stderr.slice(-1200)}`)))
  })
}

function decodeHtml(value) { return value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&') }
function safeName(value) { return value.replace(/[^a-z0-9._-]+/gi, '__') }
function escapeHtml(value) { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;') }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
