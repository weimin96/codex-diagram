import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasArrowLabelLayouts, canvasSceneToSvg, createCanvasSource, parseCanvasScene, serializeCanvasScene, type CanvasScene } from '../src/canvas.js'

test('round-trips a Canvas scene and renders standalone SVG', () => {
  const source = createCanvasSource('Architecture')
  const scene = parseCanvasScene(source)
  assert.equal(scene.type, 'codex-diagram-canvas')
  assert.equal(scene.title, 'Architecture')
  assert.equal(scene.elements.filter((item) => item.type === 'node').length, 2)
  assert.equal(parseCanvasScene(serializeCanvasScene(scene)).elements.length, scene.elements.length)

  const svg = canvasSceneToSvg(scene)
  assert.match(svg, /^<svg /)
  assert.match(svg, /Architecture/)
  assert.match(svg, /marker-end="url\(#arrow\)"/)
})

test('rejects malformed Canvas documents', () => {
  assert.throws(() => parseCanvasScene('{bad json'), /JSON 格式无效/)
  assert.throws(() => parseCanvasScene('{"type":"other","version":1,"elements":[]}'), /受支持/)
})

test('round-trips optional architecture presentation metadata on version 1 canvases', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Platform',
    width: 1400,
    height: 900,
    elements: [],
    architecture: { theme: 'presentation', presentation: true },
  }

  const parsed = parseCanvasScene(serializeCanvasScene(scene))
  assert.equal(parsed.version, 1)
  assert.deepEqual(parsed.architecture, { theme: 'presentation', presentation: true })
})

test('places relationship labels on routed segments without stacking them at the same point', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Labels',
    width: 1200,
    height: 700,
    elements: [
      { id: 'api', type: 'node', x: 100, y: 280, width: 180, height: 90, text: 'API' },
      { id: 'db', type: 'node', x: 900, y: 180, width: 180, height: 90, text: 'Database' },
      { id: 'search', type: 'node', x: 900, y: 380, width: 180, height: 90, text: 'Search' },
      { id: 'persist', type: 'arrow', from: 'api', to: 'db', label: 'writes', routing: 'orthogonal', fromAnchor: 'right', toAnchor: 'left', points: [{ x: 520, y: 325 }, { x: 520, y: 225 }] },
      { id: 'query', type: 'arrow', from: 'api', to: 'search', label: 'queries', routing: 'orthogonal', fromAnchor: 'right', toAnchor: 'left', points: [{ x: 520, y: 325 }, { x: 520, y: 425 }] },
    ],
  }

  const labels = canvasArrowLabelLayouts(scene)
  const persist = labels.get('persist')
  const query = labels.get('query')
  assert.ok(persist)
  assert.ok(query)
  assert.notDeepEqual({ x: persist.x, y: persist.y }, { x: query.x, y: query.y })
})

test('renders presentation title, legend and architecture card metadata in SVG export', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Unified Knowledge Platform',
    width: 1440,
    height: 900,
    architecture: { theme: 'presentation', presentation: true },
    elements: [
      { id: 'api', type: 'node', x: 120, y: 180, width: 220, height: 100, text: 'Knowledge API', icon: 'api', stencil: 'grpc', emphasis: 'primary' },
      { id: 'db', type: 'node', x: 720, y: 180, width: 220, height: 100, text: 'PostgreSQL', icon: 'database', stencil: 'postgres' },
      { id: 'edge', type: 'arrow', from: 'api', to: 'db', label: 'gRPC', routing: 'orthogonal', emphasis: 'primary' },
    ],
  }

  const svg = canvasSceneToSvg(scene)
  assert.match(svg, /SYSTEM ARCHITECTURE/)
  assert.match(svg, /主链路/)
  assert.match(svg, /Unified Knowledge Platform/)
  assert.match(svg, />gRPC</)
  assert.match(svg, />PG</)
})
