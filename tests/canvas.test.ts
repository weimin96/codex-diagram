import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasArchitectureCardTemplate, canvasArchitectureProjection, canvasArrowLabelLayouts, canvasSceneToSvg, createCanvasSource, parseCanvasScene, serializeCanvasScene, type CanvasScene } from '../src/canvas.js'

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
    architecture: { theme: 'presentation', presentation: true, view: 'overview', density: 'compact' },
  }

  const parsed = parseCanvasScene(serializeCanvasScene(scene))
  assert.equal(parsed.version, 1)
  assert.deepEqual(parsed.architecture, { theme: 'presentation', presentation: true, view: 'overview', density: 'compact' })
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

test('overview projection keeps source data intact while reducing low-priority architecture detail', () => {
  const nodes = Array.from({ length: 30 }, (_, index) => ({
    id: `node-${index}`,
    type: 'node' as const,
    x: 80 + (index % 6) * 210,
    y: 140 + Math.floor(index / 6) * 120,
    width: 180,
    height: 82,
    text: `Service ${index}`,
    icon: index === 0 ? 'gateway' as const : index === 29 ? 'database' as const : 'service' as const,
    emphasis: index === 0 || index === 29 ? 'primary' as const : index < 12 ? 'secondary' as const : 'muted' as const,
    laneId: index < 15 ? 'arch-application' : 'arch-data',
  }))
  const arrows = Array.from({ length: 29 }, (_, index) => ({
    id: `edge-${index}`,
    type: 'arrow' as const,
    from: `node-${index}`,
    to: `node-${index + 1}`,
    emphasis: index === 0 || index === 28 ? 'primary' as const : index < 12 ? 'secondary' as const : 'muted' as const,
  }))
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Large Platform',
    width: 1600,
    height: 1000,
    architecture: { theme: 'technical', view: 'overview', density: 'auto' },
    elements: [...nodes, ...arrows],
  }

  const before = serializeCanvasScene(scene)
  const projection = canvasArchitectureProjection(scene)
  assert.equal(serializeCanvasScene(scene), before)
  assert.ok(projection.hiddenNodes > 0)
  assert.ok(projection.hiddenArrows > 0)
  assert.ok(projection.scene.elements.some((item) => item.id === 'node-0'))
  assert.ok(projection.scene.elements.some((item) => item.id === 'node-29'))
  assert.ok(projection.scene.elements.length < scene.elements.length)
})

test('architecture cards map roles into stable semantic templates', () => {
  assert.equal(canvasArchitectureCardTemplate({ id: 'u', type: 'node', x: 0, y: 0, width: 100, height: 80, text: 'User', icon: 'user' }).kind, 'actor')
  assert.equal(canvasArchitectureCardTemplate({ id: 'g', type: 'node', x: 0, y: 0, width: 100, height: 80, text: 'Gateway', icon: 'gateway' }).kind, 'entry')
  assert.equal(canvasArchitectureCardTemplate({ id: 'q', type: 'node', x: 0, y: 0, width: 100, height: 80, text: 'Kafka', icon: 'queue' }).kind, 'messaging')
  assert.equal(canvasArchitectureCardTemplate({ id: 'd', type: 'node', x: 0, y: 0, width: 100, height: 80, text: 'Postgres', icon: 'database' }).kind, 'data')
})

test('SVG export honors architecture overview projection', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Overview export',
    width: 1600,
    height: 900,
    architecture: { theme: 'presentation', presentation: true, view: 'overview', density: 'comfortable' },
    elements: [
      { id: 'web', type: 'node', x: 100, y: 180, width: 200, height: 90, text: 'Web', icon: 'web', emphasis: 'primary', laneId: 'arch-experience' },
      { id: 'api', type: 'node', x: 420, y: 180, width: 200, height: 90, text: 'API', icon: 'api', emphasis: 'primary', laneId: 'arch-application' },
      { id: 'db', type: 'node', x: 740, y: 180, width: 200, height: 90, text: 'DB', icon: 'database', emphasis: 'primary', laneId: 'arch-data' },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `muted-${index}`, type: 'node' as const, x: 1000 + (index % 4) * 120, y: 120 + Math.floor(index / 4) * 90, width: 110, height: 70, text: `Muted ${index}`, icon: 'service' as const, emphasis: 'muted' as const, laneId: 'arch-application' })),
      { id: 'web-api', type: 'arrow', from: 'web', to: 'api', emphasis: 'primary' },
      { id: 'api-db', type: 'arrow', from: 'api', to: 'db', emphasis: 'primary' },
    ],
  }

  const svg = canvasSceneToSvg(scene)
  assert.match(svg, />Web</)
  assert.match(svg, />API</)
  assert.match(svg, />DB</)
  assert.doesNotMatch(svg, />Muted 19</)
  assert.match(svg, /总览/)
})
