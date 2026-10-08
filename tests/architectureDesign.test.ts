import assert from 'node:assert/strict'
import test from 'node:test'
import { beautifyArchitectureScene } from '../src/architectureDesign.js'
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

  assert.ok((scene.lanes?.length ?? 0) >= 4)
  assert.equal(nodes.get('web')?.stencil, 'react')
  assert.equal(nodes.get('web')?.icon, 'web')
  assert.equal(nodes.get('service')?.stencil, 'spring')
  assert.equal(nodes.get('service')?.icon, 'service')
  assert.equal(nodes.get('queue')?.stencil, 'kafka')
  assert.equal(nodes.get('queue')?.icon, 'queue')
  assert.equal(nodes.get('db')?.stencil, 'postgres')
  assert.equal(nodes.get('db')?.icon, 'database')
  assert.notEqual(nodes.get('web')?.laneId, nodes.get('db')?.laneId)
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

test('adds a software-system boundary while keeping external providers outside it', () => {
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
  assert.ok(system)
  const nodes = new Map(result.elements.filter((item) => item.type !== 'arrow').map((item) => [item.id, item]))
  assert.equal(nodes.get('oidc')?.icon, 'auth')
  assert.notEqual(nodes.get('oidc')?.groupId, system.id)
  assert.equal(nodes.get('web')?.groupId, system.id)
  assert.equal(nodes.get('api')?.groupId, system.id)
  assert.equal(nodes.get('db')?.groupId, system.id)
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

function segmentCutsBox(a: { x: number; y: number }, b: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }): boolean {
  const left = box.x - 1
  const right = box.x + box.width + 1
  const top = box.y - 1
  const bottom = box.y + box.height + 1
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
  return false
}
