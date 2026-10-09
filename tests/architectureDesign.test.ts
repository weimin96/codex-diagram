import assert from 'node:assert/strict'
import test from 'node:test'
import { beautifyArchitectureScene, routeArchitectureArrowIds, routeArchitectureEdgesIncremental } from '../src/architectureDesign.js'
import { anchorPoint, canvasBundleTrunks, type CanvasScene } from '../src/canvas.js'

function sampleScene(): CanvasScene {
  return {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Architecture',
    width: 1200,
    height: 800,
    elements: [
      { id: 'client', type: 'node', x: 40, y: 100, width: 220, height: 96, text: '员工浏览器' },
      { id: 'web', type: 'node', x: 340, y: 100, width: 220, height: 96, text: 'Web React' },
      { id: 'service', type: 'node', x: 640, y: 100, width: 220, height: 96, text: 'Spring Boot Service' },
      { id: 'queue', type: 'node', x: 640, y: 300, width: 220, height: 96, text: 'Kafka Event Bus' },
      { id: 'db', type: 'node', x: 940, y: 100, width: 220, height: 96, text: 'PostgreSQL' },
      { id: 'a1', type: 'arrow', from: 'client', to: 'web' },
      { id: 'a2', type: 'arrow', from: 'web', to: 'service' },
      { id: 'a3', type: 'arrow', from: 'service', to: 'queue' },
      { id: 'a4', type: 'arrow', from: 'service', to: 'db' },
    ],
  }
}

test('beautifies architecture into semantic partitions with technology roles', () => {
  const result = beautifyArchitectureScene(sampleScene(), { theme: 'enterprise' })
  const scene = result.scene
  const nodes = new Map(scene.elements.filter((item) => item.type !== 'arrow').map((item) => [item.id, item]))

  assert.equal(scene.lanes?.length ?? 0, 0)
  assert.ok((scene.groups?.filter((group) => group.id.startsWith('arch-')).length ?? 0) >= 4)
  assert.equal(nodes.get('web')?.stencil, 'react')
  assert.equal(nodes.get('web')?.icon, 'web')
  assert.equal(nodes.get('service')?.stencil, 'spring')
  assert.equal(nodes.get('service')?.icon, 'service')
  assert.equal(nodes.get('queue')?.stencil, 'kafka')
  assert.equal(nodes.get('queue')?.icon, 'queue')
  assert.equal(nodes.get('db')?.stencil, 'postgres')
  assert.equal(nodes.get('db')?.icon, 'database')
  assert.notEqual(nodes.get('web')?.groupId, nodes.get('db')?.groupId)
  assert.ok(result.summary.partitions >= 4)
})

test('spreads architecture relationships with orthogonal channels and async styling', () => {
  const scene = beautifyArchitectureScene(sampleScene()).scene
  const arrows = new Map(scene.elements.filter((item) => item.type === 'arrow').map((item) => [item.id, item]))

  assert.equal(arrows.get('a2')?.routing, 'orthogonal')
  assert.ok(['left', 'right', 'top', 'bottom'].includes(arrows.get('a2')?.fromAnchor ?? ''))
  assert.ok(['left', 'right', 'top', 'bottom'].includes(arrows.get('a2')?.toAnchor ?? ''))
  assert.equal(arrows.get('a3')?.lineStyle, 'dashed')
  assert.ok(['left', 'right', 'top', 'bottom'].includes(arrows.get('a4')?.fromAnchor ?? ''))
})

test('keeps locked architecture nodes at their authored coordinates', () => {
  const scene = sampleScene()
  const client = scene.elements.find((item) => item.id === 'client')
  if (!client || client.type === 'arrow') throw new Error('missing client')
  client.locked = true
  client.x = 77
  client.y = 233

  const result = beautifyArchitectureScene(scene).scene
  const after = result.elements.find((item) => item.id === 'client')
  assert.ok(after && after.type !== 'arrow')
  assert.equal(after.x, 77)
  assert.equal(after.y, 233)
})

test('marks a connected entry-to-data backbone as the primary architecture path', () => {
  const scene = beautifyArchitectureScene(sampleScene()).scene
  const elements = new Map(scene.elements.map((item) => [item.id, item]))

  for (const id of ['client', 'web', 'service', 'db']) {
    const item = elements.get(id)
    assert.ok(item && item.type !== 'arrow')
    assert.equal(item.emphasis, 'primary')
  }
  for (const id of ['a1', 'a2', 'a4']) {
    const item = elements.get(id)
    assert.ok(item && item.type === 'arrow')
    assert.equal(item.emphasis, 'primary')
  }
  const asyncBranch = elements.get('a3')
  assert.ok(asyncBranch && asyncBranch.type === 'arrow')
  assert.equal(asyncBranch.emphasis, 'secondary')
})

test('bundles fan-out relationships through a shared source trunk when the corridor is clear', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Bundle',
    width: 1400,
    height: 800,
    elements: [
      { id: 'service', type: 'node', x: 160, y: 320, width: 200, height: 90, text: 'Application Service', icon: 'service' },
      { id: 'db', type: 'node', x: 900, y: 160, width: 200, height: 90, text: 'PostgreSQL', icon: 'database' },
      { id: 'cache', type: 'node', x: 900, y: 320, width: 200, height: 90, text: 'Redis', icon: 'cache' },
      { id: 'search', type: 'node', x: 900, y: 480, width: 200, height: 90, text: 'OpenSearch', icon: 'search' },
      { id: 'a-db', type: 'arrow', from: 'service', to: 'db' },
      { id: 'a-cache', type: 'arrow', from: 'service', to: 'cache' },
      { id: 'a-search', type: 'arrow', from: 'service', to: 'search' },
    ],
  }

  const result = beautifyArchitectureScene(scene, { repartition: false, relayout: false }).scene
  const arrows = result.elements.filter((item) => item.type === 'arrow')
  assert.equal(arrows.length, 3)
  assert.ok(arrows.every((item) => item.bundleKey === 'from:service'))
  const firstPoints = arrows.map((item) => item.points?.[0]).filter(Boolean)
  assert.ok(firstPoints.length >= 2)
  assert.ok(firstPoints.every((point) => point?.x === firstPoints[0]?.x))
  assert.ok(canvasBundleTrunks(result).some((trunk) => trunk.count >= 2))
})

test('routes downward fan-out into one architecture group through a shared data bus', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Shared data bus',
    width: 1200,
    height: 760,
    groups: [{ id: 'data', label: 'Data', kind: 'boundary' }],
    elements: [
      { id: 'service', type: 'node', x: 480, y: 100, width: 180, height: 80, text: 'Core', icon: 'service' },
      { id: 'redis', type: 'node', x: 240, y: 520, width: 160, height: 72, text: 'Redis', icon: 'cache', groupId: 'data' },
      { id: 'search', type: 'node', x: 500, y: 520, width: 160, height: 72, text: 'Search', icon: 'search', groupId: 'data' },
      { id: 'db', type: 'node', x: 760, y: 520, width: 160, height: 72, text: 'Database', icon: 'database', groupId: 'data' },
      { id: 'to-redis', type: 'arrow', from: 'service', to: 'redis' },
      { id: 'to-search', type: 'arrow', from: 'service', to: 'search' },
      { id: 'to-db', type: 'arrow', from: 'service', to: 'db' },
    ],
  }

  const result = beautifyArchitectureScene(scene, { repartition: false, relayout: false }).scene
  const arrows = result.elements.filter((item) => item.type === 'arrow')
  assert.equal(arrows.length, 3)
  assert.ok(arrows.every((arrow) => arrow.bundleKey === 'from:service'))
  assert.ok(arrows.every((arrow) => arrow.fromAnchor === 'bottom' && arrow.toAnchor === 'top'))
  const firstBends = arrows.map((arrow) => arrow.points?.[0]).filter(Boolean)
  assert.equal(firstBends.length, 3)
  assert.ok(firstBends.every((point) => point?.x === firstBends[0]?.x && point?.y === firstBends[0]?.y))
})

test('uses tight local architecture boundaries by default while keeping external providers separate', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Knowledge Platform',
    width: 1200,
    height: 800,
    elements: [
      { id: 'oidc', type: 'node', x: 60, y: 120, width: 200, height: 90, text: 'Enterprise OIDC Provider' },
      { id: 'web', type: 'node', x: 340, y: 120, width: 200, height: 90, text: 'React Web App' },
      { id: 'api', type: 'node', x: 620, y: 120, width: 200, height: 90, text: 'REST API Gateway' },
      { id: 'db', type: 'node', x: 900, y: 120, width: 200, height: 90, text: 'PostgreSQL' },
      { id: 'auth', type: 'arrow', from: 'web', to: 'oidc' },
      { id: 'call', type: 'arrow', from: 'web', to: 'api' },
      { id: 'persist', type: 'arrow', from: 'api', to: 'db' },
    ],
  }

  const result = beautifyArchitectureScene(scene).scene
  const system = result.groups?.find((group) => group.c4Type === 'software-system')
  assert.equal(system, undefined)
  const nodes = new Map(result.elements.filter((item) => item.type !== 'arrow').map((item) => [item.id, item]))
  assert.equal(nodes.get('oidc')?.icon, 'auth')
  assert.equal(nodes.get('oidc')?.groupId, 'arch-external')
  assert.equal(nodes.get('web')?.groupId, 'arch-experience')
  assert.equal(nodes.get('api')?.groupId, 'arch-application')
  assert.equal(nodes.get('db')?.groupId, 'arch-data')
  assert.ok(result.groups?.filter((group) => group.id.startsWith('arch-')).every((group) => !group.parentId))
})

test('preserves an explicit software-system boundary around generated local architecture groups', () => {
  const scene = sampleScene()
  scene.groups = [{ id: 'platform', label: 'Platform', kind: 'boundary', c4Type: 'software-system' }]

  const result = beautifyArchitectureScene(scene).scene
  const system = result.groups?.find((group) => group.id === 'platform')
  assert.ok(system)
  const internalGroups = result.groups?.filter((group) => group.id.startsWith('arch-') && group.id !== 'arch-external') ?? []
  assert.ok(internalGroups.length >= 3)
  assert.ok(internalGroups.every((group) => group.parentId === 'platform'))
})

test('routes architecture relationships around blocking nodes', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Obstacle routing',
    width: 1200,
    height: 700,
    elements: [
      { id: 'from', type: 'node', x: 80, y: 240, width: 180, height: 90, text: 'API Gateway', icon: 'gateway' },
      { id: 'blocker', type: 'node', x: 450, y: 210, width: 220, height: 150, text: 'Application Service', icon: 'service' },
      { id: 'to', type: 'node', x: 860, y: 240, width: 180, height: 90, text: 'PostgreSQL', icon: 'database' },
      { id: 'edge', type: 'arrow', from: 'from', to: 'to' },
    ],
  }
  const result = beautifyArchitectureScene(scene, { repartition: false, relayout: false, reroute: true }).scene
  const boxes = new Map(result.elements.filter((item) => item.type !== 'arrow').map((item) => [item.id, item]))
  const edge = result.elements.find((item) => item.id === 'edge')
  assert.ok(edge?.type === 'arrow')
  const from = boxes.get('from')!
  const to = boxes.get('to')!
  const start = anchorPoint(from, edge.fromAnchor, { x: to.x, y: to.y })
  const end = anchorPoint(to, edge.toAnchor, { x: from.x, y: from.y })
  const route = [start, ...(edge.points ?? []), end]
  assert.ok(route.length >= 4)
  for (let index = 0; index < route.length - 1; index += 1) {
    assert.equal(segmentCutsBox(route[index], route[index + 1], boxes.get('blocker')!), false)
  }
})

test('routes through two corridors when an intermediate node and stacked target column block simple doglegs', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Stacked target routing',
    width: 1900,
    height: 800,
    elements: [
      { id: 'core', type: 'node', x: 800, y: 260, width: 220, height: 94, text: 'Core', icon: 'service' },
      { id: 'blocker', type: 'node', x: 1190, y: 260, width: 236, height: 94, text: 'Worker', icon: 'worker' },
      { id: 'above', type: 'node', x: 1580, y: 110, width: 220, height: 94, text: 'Redis', icon: 'cache' },
      { id: 'target', type: 'node', x: 1580, y: 260, width: 220, height: 94, text: 'OpenSearch', icon: 'search' },
      { id: 'below', type: 'node', x: 1580, y: 410, width: 220, height: 94, text: 'Qdrant', icon: 'vector' },
      { id: 'edge', type: 'arrow', from: 'core', to: 'target', label: '同步检索' },
    ],
  }

  const result = routeArchitectureEdgesIncremental(scene, ['core'])
  const edge = result.elements.find((item) => item.id === 'edge')
  assert.ok(edge?.type === 'arrow')
  assert.equal(edge.routing, 'orthogonal')
  assert.ok((edge.points?.length ?? 0) >= 2)

  const boxes = new Map(result.elements.filter((item) => item.type !== 'arrow').map((item) => [item.id, item]))
  const start = anchorPoint(boxes.get('core')!, edge.fromAnchor, boxes.get('target')!)
  const end = anchorPoint(boxes.get('target')!, edge.toAnchor, boxes.get('core')!)
  const route = [start, ...(edge.points ?? []), end]
  const first = route[1]
  const beforeEnd = route[route.length - 2]
  if (edge.fromAnchor === 'right') assert.ok(first.x >= start.x)
  if (edge.fromAnchor === 'left') assert.ok(first.x <= start.x)
  if (edge.fromAnchor === 'bottom') assert.ok(first.y >= start.y)
  if (edge.fromAnchor === 'top') assert.ok(first.y <= start.y)
  if (edge.toAnchor === 'right') assert.ok(beforeEnd.x >= end.x)
  if (edge.toAnchor === 'left') assert.ok(beforeEnd.x <= end.x)
  if (edge.toAnchor === 'bottom') assert.ok(beforeEnd.y >= end.y)
  if (edge.toAnchor === 'top') assert.ok(beforeEnd.y <= end.y)
  for (const obstacleId of ['blocker', 'above', 'below']) {
    const obstacle = boxes.get(obstacleId)!
    for (let index = 0; index < route.length - 1; index += 1) {
      assert.equal(segmentCutsBox(route[index], route[index + 1], obstacle), false, `${obstacleId} should not be crossed`)
    }
  }
})

test('incremental routing preserves unrelated relationship geometry', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Incremental routing',
    width: 1600,
    height: 900,
    elements: [
      { id: 'a', type: 'node', x: 80, y: 120, width: 180, height: 90, text: 'A' },
      { id: 'b', type: 'node', x: 620, y: 120, width: 180, height: 90, text: 'B' },
      { id: 'c', type: 'node', x: 80, y: 520, width: 180, height: 90, text: 'C' },
      { id: 'd', type: 'node', x: 620, y: 520, width: 180, height: 90, text: 'D' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b', routing: 'orthogonal', fromAnchor: 'right', toAnchor: 'left', points: [{ x: 420, y: 165 }] },
      { id: 'cd', type: 'arrow', from: 'c', to: 'd', routing: 'orthogonal', fromAnchor: 'right', toAnchor: 'left', points: [{ x: 420, y: 565 }] },
    ],
  }
  const moved: CanvasScene = {
    ...scene,
    elements: scene.elements.map((item) => item.id === 'b' && item.type === 'node' ? { ...item, y: 260 } : item),
  }
  const result = routeArchitectureEdgesIncremental(moved, ['b'])
  const unrelated = result.elements.find((item) => item.id === 'cd')
  const affected = result.elements.find((item) => item.id === 'ab')
  assert.ok(unrelated?.type === 'arrow' && affected?.type === 'arrow')
  assert.deepEqual(unrelated.points, [{ x: 420, y: 565 }])
  assert.notDeepEqual(affected.points, [{ x: 420, y: 165 }])
})

test('routes only explicitly requested relationship ids', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Arrow subset',
    width: 1200,
    height: 700,
    elements: [
      { id: 'a', type: 'node', x: 80, y: 120, width: 180, height: 90, text: 'A' },
      { id: 'b', type: 'node', x: 760, y: 120, width: 180, height: 90, text: 'B' },
      { id: 'c', type: 'node', x: 80, y: 420, width: 180, height: 90, text: 'C' },
      { id: 'd', type: 'node', x: 760, y: 420, width: 180, height: 90, text: 'D' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b' },
      { id: 'cd', type: 'arrow', from: 'c', to: 'd', routing: 'orthogonal', points: [{ x: 520, y: 465 }] },
    ],
  }
  const result = routeArchitectureArrowIds(scene, ['ab'])
  const ab = result.elements.find((item) => item.id === 'ab')
  const cd = result.elements.find((item) => item.id === 'cd')
  assert.ok(ab?.type === 'arrow' && cd?.type === 'arrow')
  assert.equal(ab.routing, 'orthogonal')
  assert.deepEqual(cd.points, [{ x: 520, y: 465 }])
})

test('incremental routing reroutes a relationship that a moved node now blocks', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Incremental obstacle',
    width: 1400,
    height: 800,
    elements: [
      { id: 'from', type: 'node', x: 80, y: 180, width: 180, height: 90, text: 'From' },
      { id: 'to', type: 'node', x: 980, y: 180, width: 180, height: 90, text: 'To' },
      { id: 'blocker', type: 'node', x: 450, y: 520, width: 220, height: 120, text: 'Blocker' },
      { id: 'edge', type: 'arrow', from: 'from', to: 'to', routing: 'orthogonal', fromAnchor: 'right', toAnchor: 'left', points: [{ x: 520, y: 225 }] },
    ],
  }
  const moved: CanvasScene = {
    ...scene,
    elements: scene.elements.map((item) => item.id === 'blocker' && item.type === 'node' ? { ...item, y: 165 } : item),
  }
  const result = routeArchitectureEdgesIncremental(moved, ['blocker'])
  const edge = result.elements.find((item) => item.id === 'edge')
  assert.ok(edge?.type === 'arrow')
  assert.notDeepEqual(edge.points, [{ x: 520, y: 225 }])
})

test('incremental routing detects a moved obstacle crossing an existing straight relationship', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Straight obstacle',
    width: 1200,
    height: 700,
    elements: [
      { id: 'from', type: 'node', x: 80, y: 80, width: 160, height: 80, text: 'From' },
      { id: 'to', type: 'node', x: 880, y: 480, width: 160, height: 80, text: 'To' },
      { id: 'blocker', type: 'node', x: 420, y: 520, width: 180, height: 100, text: 'Blocker' },
      { id: 'edge', type: 'arrow', from: 'from', to: 'to', routing: 'straight' },
    ],
  }
  const moved: CanvasScene = {
    ...scene,
    elements: scene.elements.map((item) => item.id === 'blocker' && item.type === 'node' ? { ...item, x: 480, y: 280 } : item),
  }
  const result = routeArchitectureEdgesIncremental(moved, ['blocker'])
  const edge = result.elements.find((item) => item.id === 'edge')
  assert.ok(edge?.type === 'arrow')
  assert.equal(edge.routing, 'orthogonal')
})

test('recognizes architecture-specific roles beyond generic service and database', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Knowledge platform',
    width: 1400,
    height: 800,
    elements: [
      { id: 'mcp', type: 'node', x: 40, y: 40, width: 200, height: 90, text: 'MCP Server' },
      { id: 'worker', type: 'node', x: 40, y: 180, width: 200, height: 90, text: 'Parse Worker' },
      { id: 'search', type: 'node', x: 40, y: 320, width: 200, height: 90, text: 'OpenSearch' },
      { id: 'vector', type: 'node', x: 40, y: 460, width: 200, height: 90, text: 'Qdrant Vector DB' },
      { id: 'auth', type: 'node', x: 40, y: 600, width: 200, height: 90, text: 'Enterprise OIDC Provider' },
    ],
  }
  const result = beautifyArchitectureScene(scene, { relayout: false }).scene
  const nodes = new Map(result.elements.filter((item) => item.type !== 'arrow').map((item) => [item.id, item]))
  assert.equal(nodes.get('mcp')?.icon, 'mcp')
  assert.equal(nodes.get('worker')?.icon, 'worker')
  assert.equal(nodes.get('search')?.icon, 'search')
  assert.equal(nodes.get('vector')?.icon, 'vector')
  assert.equal(nodes.get('auth')?.icon, 'auth')
})

test('persists presentation architecture appearance without dashboard chrome', () => {
  const result = beautifyArchitectureScene(sampleScene(), { theme: 'presentation' }).scene
  const nodes = result.elements.filter((item) => item.type !== 'arrow')

  assert.deepEqual(result.architecture, { theme: 'presentation', presentation: true, view: 'detail', density: 'auto' })
  assert.ok(result.width >= 960)
  assert.ok(result.height >= 620)
  assert.ok(result.width < 1440)
  assert.ok(nodes.every((item) => item.locked || item.y >= 50))
})

test('switching away from presentation removes presentation chrome without changing canvas version', () => {
  const presentation = beautifyArchitectureScene(sampleScene(), { theme: 'presentation' }).scene
  const technical = beautifyArchitectureScene(presentation, { theme: 'technical', relayout: false }).scene

  assert.equal(technical.version, 1)
  assert.deepEqual(technical.architecture, { theme: 'technical', view: 'detail', density: 'auto' })
})

test('auto density compacts large architecture layouts without changing canvas protocol', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Large architecture',
    width: 1600,
    height: 1000,
    elements: Array.from({ length: 50 }, (_, index) => ({
      id: `service-${index}`,
      type: 'node' as const,
      x: 40 + (index % 5) * 240,
      y: 80 + Math.floor(index / 5) * 120,
      width: 220,
      height: 96,
      text: `Service ${index}`,
      icon: 'service' as const,
    })),
  }

  const result = beautifyArchitectureScene(scene, { density: 'auto' })
  const nodes = result.scene.elements.filter((item) => item.type !== 'arrow')
  assert.equal(result.scene.version, 1)
  assert.equal(result.scene.architecture?.density, 'auto')
  assert.ok(nodes.every((item) => item.width <= 150))
  assert.ok(nodes.every((item) => item.height <= 68))
})

function segmentCutsBox(a: { x: number; y: number }, b: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }): boolean {
  const left = box.x - 1
  const right = box.x + box.width + 1
  const top = box.y - 1
  const bottom = box.y + box.height + 1
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
  return false
}
