import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasArchitectureCardTemplate, canvasArchitectureProjection, canvasArchitectureScopeProjection, canvasArrowLabelLayouts, canvasBundleTrunks, canvasCollapsedConnections, canvasIconRefMarkup, canvasSemanticLodProjection, canvasSceneToSvg, createCanvasSource, parseCanvasScene, resolveCanvasSemanticLod, serializeCanvasScene, type CanvasScene } from '../src/canvas.js'

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

test('round-trips every built-in architecture visual theme', () => {
  for (const theme of ['enterprise', 'technical', 'presentation', 'cloud', 'editorial', 'sketch'] as const) {
    const scene: CanvasScene = {
      type: 'codex-diagram-canvas',
      version: 1,
      title: theme,
      width: 960,
      height: 620,
      architecture: { theme },
      elements: [],
    }
    assert.equal(parseCanvasScene(serializeCanvasScene(scene)).architecture?.theme, theme)
  }
})

test('renders selected AWS Azure and GCP architecture pack icons as embedded SVG images', () => {
  for (const ref of ['aws:lambda', 'azure:functionapps', 'gcp:cloud_run'] as const) {
    const markup = canvasIconRefMarkup(ref)
    assert.match(markup, /<image /)
    assert.match(markup, /data:image\/svg\+xml;base64,/)
    assert.match(markup, new RegExp(`data-icon-ref="${ref}"`))
  }
})

test('round-trips a visual icon override without changing node role or technology semantics', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Icon override',
    width: 960,
    height: 620,
    architecture: { theme: 'enterprise' },
    elements: [
      { id: 'api', type: 'node', x: 180, y: 220, width: 188, height: 80, text: 'Spring API', icon: 'service', stencil: 'spring', iconRef: 'lucide:server' },
    ],
  }

  const parsed = parseCanvasScene(serializeCanvasScene(scene))
  const node = parsed.elements.find((item) => item.id === 'api')
  assert.ok(node && node.type === 'node')
  assert.equal(node.icon, 'service')
  assert.equal(node.stencil, 'spring')
  assert.equal(node.iconRef, 'lucide:server')
  assert.match(canvasSceneToSvg(parsed), /width="20" height="8"/)

  const invalid = parseCanvasScene(JSON.stringify({ ...scene, elements: [{ ...scene.elements[0], iconRef: 'lucide:not-real' }] }))
  const invalidNode = invalid.elements.find((item) => item.id === 'api')
  assert.ok(invalidNode && invalidNode.type === 'node')
  assert.equal(invalidNode.iconRef, undefined)
})

test('architecture themes produce distinct SVG treatments without changing node semantics', () => {
  const base: Omit<CanvasScene, 'architecture'> = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Theme treatments',
    width: 960,
    height: 620,
    groups: [{ id: 'app', label: 'Application', kind: 'boundary' }],
    elements: [
      { id: 'api', type: 'node', x: 180, y: 220, width: 188, height: 80, text: 'Spring API', icon: 'service', stencil: 'spring', groupId: 'app' },
      { id: 'db', type: 'node', x: 590, y: 220, width: 188, height: 80, text: 'PostgreSQL', icon: 'database', stencil: 'postgres', groupId: 'app' },
      { id: 'edge', type: 'arrow', from: 'api', to: 'db', routing: 'orthogonal', emphasis: 'secondary' },
    ],
  }
  const engineering = canvasSceneToSvg({ ...base, architecture: { theme: 'enterprise' } })
  const cloud = canvasSceneToSvg({ ...base, architecture: { theme: 'cloud' } })
  const sketch = canvasSceneToSvg({ ...base, architecture: { theme: 'sketch' } })

  assert.notEqual(engineering, cloud)
  assert.notEqual(cloud, sketch)
  assert.match(engineering, /Spring API/)
  assert.match(cloud, /Spring API/)
  assert.match(sketch, /stroke-opacity="0.62"/)
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

test('round-trips and honors a manually positioned relationship label', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Manual label',
    width: 1000,
    height: 600,
    elements: [
      { id: 'a', type: 'node', x: 100, y: 200, width: 180, height: 90, text: 'A' },
      { id: 'b', type: 'node', x: 700, y: 200, width: 180, height: 90, text: 'B' },
      { id: 'edge', type: 'arrow', from: 'a', to: 'b', label: 'custom', labelPosition: { x: 510, y: 140 } },
    ],
  }
  const parsed = parseCanvasScene(serializeCanvasScene(scene))
  const arrow = parsed.elements.find((item) => item.id === 'edge')
  assert.ok(arrow && arrow.type === 'arrow')
  assert.deepEqual(arrow.labelPosition, { x: 510, y: 140 })
  const layout = canvasArrowLabelLayouts(parsed).get('edge')
  assert.ok(layout)
  assert.deepEqual({ x: layout.x, y: layout.y }, { x: 510, y: 140 })
})

test('renders compact presentation architecture without dashboard metadata in SVG export', () => {
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
      { id: 'noise', type: 'arrow', from: 'api', to: 'db', label: '写入', routing: 'orthogonal', emphasis: 'secondary' },
    ],
  }

  const svg = canvasSceneToSvg(scene)
  assert.doesNotMatch(svg, /SYSTEM ARCHITECTURE/)
  assert.doesNotMatch(svg, /主链路/)
  assert.doesNotMatch(svg, />Container</)
  assert.match(svg, />gRPC</)
  assert.doesNotMatch(svg, />写入</)
  assert.match(svg, /fill="#4169E1"/)
  assert.doesNotMatch(svg, />PG</)
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

test('architecture overview collapses dense semantic regions and aggregates their relationships', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Overview aggregation',
    width: 1700,
    height: 1000,
    architecture: { theme: 'enterprise', view: 'overview', density: 'compact' },
    groups: [
      { id: 'entry', label: 'Entry', kind: 'boundary' },
      { id: 'runtime', label: 'Runtime', kind: 'boundary' },
      { id: 'data', label: 'Data', kind: 'boundary' },
    ],
    elements: [
      { id: 'web', type: 'node', x: 100, y: 180, width: 180, height: 76, text: 'Web', icon: 'web', groupId: 'entry', emphasis: 'primary' },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `runtime-${index}`,
        type: 'node' as const,
        x: 480 + (index % 3) * 200,
        y: 140 + Math.floor(index / 3) * 130,
        width: 170,
        height: 76,
        text: `Runtime ${index}`,
        icon: 'service' as const,
        groupId: 'runtime',
        emphasis: index === 0 ? 'primary' as const : 'secondary' as const,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `data-${index}`,
        type: 'node' as const,
        x: 1080 + (index % 2) * 200,
        y: 140 + Math.floor(index / 2) * 130,
        width: 170,
        height: 76,
        text: `Data ${index}`,
        icon: 'database' as const,
        groupId: 'data',
        emphasis: index === 0 ? 'primary' as const : 'muted' as const,
      })),
      { id: 'web-runtime', type: 'arrow', from: 'web', to: 'runtime-0', emphasis: 'primary' },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `runtime-data-${index}`, type: 'arrow' as const, from: `runtime-${index}`, to: `data-${index}`, emphasis: 'secondary' as const, bundleKey: 'group:runtime->data' })),
    ],
  }

  const projection = canvasArchitectureProjection(scene)
  const runtime = projection.scene.groups?.find((group) => group.id === 'runtime')
  const data = projection.scene.groups?.find((group) => group.id === 'data')
  assert.equal(runtime?.collapsed, true)
  assert.equal(data?.collapsed, true)
  const aggregated = canvasCollapsedConnections(projection.scene)
  assert.ok(aggregated.some((connection) => connection.fromKey === 'node:web' && connection.toKey === 'group:runtime'))
  assert.ok(aggregated.some((connection) => connection.fromKey === 'group:runtime' && connection.toKey === 'group:data' && connection.count >= 4))
  assert.equal(canvasBundleTrunks(projection.scene).length, 0)
  assert.ok(projection.hiddenNodes >= 10)
  assert.ok(projection.hiddenArrows >= 4)
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
  assert.doesNotMatch(svg, /SYSTEM ARCHITECTURE/)
})

test('architecture group drill-down collapses immediate child boundaries and keeps boundary dependencies', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Drill down',
    width: 1800,
    height: 1000,
    architecture: { theme: 'presentation', view: 'overview', density: 'auto' },
    groups: [
      { id: 'system', label: 'Knowledge Platform', kind: 'boundary', c4Type: 'software-system' },
      { id: 'runtime', label: 'Runtime', kind: 'boundary', c4Type: 'container', parentId: 'system' },
      { id: 'data', label: 'Data', kind: 'boundary', c4Type: 'container', parentId: 'system' },
    ],
    elements: [
      { id: 'web', type: 'node', x: 120, y: 200, width: 200, height: 90, text: 'Web', groupId: 'system', icon: 'web' },
      { id: 'api', type: 'node', x: 500, y: 200, width: 200, height: 90, text: 'API', groupId: 'runtime', icon: 'api' },
      { id: 'worker', type: 'node', x: 500, y: 380, width: 200, height: 90, text: 'Worker', groupId: 'runtime', icon: 'worker' },
      { id: 'db', type: 'node', x: 900, y: 200, width: 200, height: 90, text: 'DB', groupId: 'data', icon: 'database' },
      { id: 'oidc', type: 'node', x: 120, y: 560, width: 200, height: 90, text: 'OIDC Provider', icon: 'external' },
      { id: 'web-api', type: 'arrow', from: 'web', to: 'api' },
      { id: 'api-db', type: 'arrow', from: 'api', to: 'db' },
      { id: 'web-oidc', type: 'arrow', from: 'web', to: 'oidc' },
    ],
  }

  const projection = canvasArchitectureScopeProjection(scene, { kind: 'group', id: 'system' })
  assert.deepEqual(projection.breadcrumbs.map((item) => item.label), ['Knowledge Platform'])
  assert.equal(projection.scene.groups?.find((group) => group.id === 'system')?.collapsed, undefined)
  assert.equal(projection.scene.groups?.find((group) => group.id === 'runtime')?.collapsed, true)
  assert.equal(projection.scene.groups?.find((group) => group.id === 'data')?.collapsed, true)
  assert.ok(projection.scene.elements.some((item) => item.id === 'oidc'))
  assert.ok(projection.scene.elements.some((item) => item.id === 'web-oidc'))
})

test('architecture node focus keeps a bounded neighborhood and group breadcrumbs', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Node focus',
    width: 1600,
    height: 900,
    architecture: { theme: 'technical', view: 'detail', density: 'auto' },
    groups: [
      { id: 'system', label: 'System', kind: 'boundary', c4Type: 'software-system' },
      { id: 'runtime', label: 'Runtime', kind: 'boundary', c4Type: 'container', parentId: 'system' },
    ],
    elements: [
      { id: 'a', type: 'node', x: 100, y: 200, width: 180, height: 80, text: 'A', groupId: 'runtime' },
      { id: 'b', type: 'node', x: 400, y: 200, width: 180, height: 80, text: 'B', groupId: 'runtime' },
      { id: 'c', type: 'node', x: 700, y: 200, width: 180, height: 80, text: 'C', groupId: 'runtime' },
      { id: 'd', type: 'node', x: 1000, y: 200, width: 180, height: 80, text: 'D', groupId: 'runtime' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b' },
      { id: 'bc', type: 'arrow', from: 'b', to: 'c' },
      { id: 'cd', type: 'arrow', from: 'c', to: 'd' },
    ],
  }

  const projection = canvasArchitectureScopeProjection(scene, { kind: 'node', id: 'b', depth: 1 })
  assert.deepEqual(projection.breadcrumbs.map((item) => item.label), ['System', 'Runtime', 'B'])
  assert.deepEqual(projection.scene.elements.filter((item) => item.type !== 'arrow').map((item) => item.id).sort(), ['a', 'b', 'c'])
  assert.ok(!projection.scene.elements.some((item) => item.id === 'd'))
})

test('semantic LOD becomes more aggressive for large scenes at the same zoom', () => {
  assert.equal(resolveCanvasSemanticLod(0.7, 40), 'compact')
  assert.equal(resolveCanvasSemanticLod(0.7, 1400), 'overview')
  assert.equal(resolveCanvasSemanticLod(0.34, 40), 'regions')
})

test('region LOD temporarily collapses semantic boundaries without mutating source state', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'LOD',
    width: 1800,
    height: 1000,
    groups: [
      { id: 'system', label: 'Platform', kind: 'boundary', c4Type: 'software-system' },
      { id: 'runtime', label: 'Runtime', kind: 'boundary', c4Type: 'container', parentId: 'system' },
    ],
    elements: [
      { id: 'web', type: 'node', x: 120, y: 180, width: 180, height: 80, text: 'Web', groupId: 'runtime' },
      { id: 'api', type: 'node', x: 420, y: 180, width: 180, height: 80, text: 'API', groupId: 'runtime' },
      { id: 'worker', type: 'node', x: 720, y: 180, width: 180, height: 80, text: 'Worker', groupId: 'runtime' },
      { id: 'db', type: 'node', x: 1020, y: 180, width: 180, height: 80, text: 'DB', groupId: 'system' },
      { id: 'a', type: 'arrow', from: 'web', to: 'api' },
      { id: 'b', type: 'arrow', from: 'api', to: 'worker' },
      { id: 'c', type: 'arrow', from: 'worker', to: 'db' },
    ],
  }
  const before = serializeCanvasScene(scene)
  const projection = canvasSemanticLodProjection(scene, 0.3)
  assert.equal(projection.level, 'regions')
  assert.deepEqual(projection.autoCollapsedGroupIds, ['system'])
  assert.equal(projection.scene.groups?.find((group) => group.id === 'system')?.collapsed, true)
  assert.ok(projection.hiddenNodes >= 4)
  assert.equal(serializeCanvasScene(scene), before)
})

test('region LOD keeps the selected region expanded', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'LOD selection',
    width: 1200,
    height: 700,
    groups: [{ id: 'runtime', label: 'Runtime', kind: 'boundary', c4Type: 'container' }],
    elements: [
      { id: 'a', type: 'node', x: 100, y: 100, width: 160, height: 80, text: 'A', groupId: 'runtime' },
      { id: 'b', type: 'node', x: 340, y: 100, width: 160, height: 80, text: 'B', groupId: 'runtime' },
      { id: 'c', type: 'node', x: 580, y: 100, width: 160, height: 80, text: 'C', groupId: 'runtime' },
    ],
  }
  const projection = canvasSemanticLodProjection(scene, 0.25, ['b'])
  assert.deepEqual(projection.autoCollapsedGroupIds, [])
  assert.equal(projection.scene.groups?.[0].collapsed, undefined)
})

test('semantic LOD samples very large ungrouped canvases while preserving selected nodes', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Huge canvas',
    width: 12000,
    height: 8000,
    elements: Array.from({ length: 5000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'node' as const,
      x: (index % 100) * 110,
      y: Math.floor(index / 100) * 110,
      width: 90,
      height: 70,
      text: `Node ${index}`,
      ...(index === 0 ? { emphasis: 'primary' as const } : {}),
    })),
  }
  const before = serializeCanvasScene(scene)
  const overview = canvasSemanticLodProjection(scene, 0.7, ['node-4999'])
  const overviewNodes = overview.scene.elements.filter((item) => item.type !== 'arrow')
  assert.equal(overview.level, 'overview')
  assert.ok(overviewNodes.length <= 640)
  assert.ok(overviewNodes.some((item) => item.id === 'node-0'))
  assert.ok(overviewNodes.some((item) => item.id === 'node-4999'))
  const regions = canvasSemanticLodProjection(scene, 0.3, ['node-4999'])
  assert.equal(regions.level, 'regions')
  assert.ok(regions.scene.elements.filter((item) => item.type !== 'arrow').length <= 220)
  assert.equal(serializeCanvasScene(scene), before)
})
