import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasArrow, CanvasNode, CanvasScene } from '../src/canvas.js'
import { buildCanvasSubgraphContext, buildCanvasSubgraphPatch, mergeCanvasProposalSelection } from '../src/canvasPatch.js'
import { parseCanvasScene, serializeCanvasScene } from '../src/canvas.js'

function scene(): CanvasScene {
  return {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Patch test',
    width: 1800,
    height: 1000,
    architecture: { theme: 'technical', view: 'detail', density: 'auto' },
    elements: [
      { id: 'web', type: 'node', x: 120, y: 180, width: 220, height: 96, text: 'Web', icon: 'web', groupId: 'system' },
      { id: 'api', type: 'node', x: 520, y: 180, width: 220, height: 96, text: 'API', icon: 'api', groupId: 'system' },
      { id: 'db', type: 'node', x: 980, y: 180, width: 220, height: 96, text: 'DB', icon: 'database', groupId: 'system' },
      { id: 'locked', type: 'node', x: 520, y: 480, width: 220, height: 96, text: 'Locked', locked: true, groupId: 'system' },
      { id: 'web-api', type: 'arrow', from: 'web', to: 'api', label: 'HTTP', routing: 'orthogonal', points: [{ x: 420, y: 228 }], labelPosition: { x: 410, y: 190 } },
      { id: 'api-db', type: 'arrow', from: 'api', to: 'db', label: 'SQL', routing: 'orthogonal', points: [{ x: 840, y: 228 }], labelPosition: { x: 830, y: 190 }, bundleKey: 'from:api' },
    ],
    groups: [{ id: 'system', label: 'System', kind: 'boundary', c4Type: 'software-system' }],
  }
}

test('semantic patch preserves authored geometry and unrelated relationship geometry', () => {
  const source = scene()
  const result = buildCanvasSubgraphPatch(source, {
    scopeElementIds: ['api'],
    updates: [{ id: 'api', changes: { text: 'Public API', subtitle: 'Spring Boot' } }],
  })
  const api = result.scene.elements.find((item): item is CanvasNode => item.type === 'node' && item.id === 'api')
  const unrelated = result.scene.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === 'web-api')
  assert.ok(api && unrelated)
  assert.equal(api.x, 520)
  assert.equal(api.y, 180)
  assert.equal(api.text, 'Public API')
  assert.deepEqual(unrelated.points, [{ x: 420, y: 228 }])
  assert.deepEqual(unrelated.labelPosition, { x: 410, y: 190 })
  assert.deepEqual(result.automaticElementIds, [])
})

test('adds a stable node without authored coordinates and routes its declared relationship', () => {
  const result = buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api'],
    adds: [
      { id: 'cache', type: 'node', properties: { text: 'Redis Cache', icon: 'cache', stencil: 'redis', groupId: 'system' } },
      { id: 'api-cache', type: 'arrow', properties: { from: 'api', to: 'cache', label: 'lookup' } },
    ],
  })
  const cache = result.scene.elements.find((item): item is CanvasNode => item.type === 'node' && item.id === 'cache')
  const edge = result.scene.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === 'api-cache')
  assert.ok(cache && edge)
  assert.ok(cache.x >= 0 && cache.x + cache.width <= result.scene.width)
  assert.ok(cache.y >= 0 && cache.y + cache.height <= result.scene.height)
  assert.equal(edge.routing, 'orthogonal')
  assert.ok(result.addedElementIds.includes('cache'))
  assert.ok(result.addedElementIds.includes('api-cache'))
})

test('reconnecting an arrow through a patch clears stale authored route metadata', () => {
  const result = buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api-db'],
    updates: [{ id: 'api-db', changes: { to: 'locked' } }],
  })
  const edge = result.scene.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === 'api-db')
  assert.ok(edge)
  assert.equal(edge.to, 'locked')
  assert.equal(edge.labelPosition, undefined)
  assert.notDeepEqual(edge.points, [{ x: 840, y: 228 }])
})

test('relationship text-only updates preserve authored route and label geometry', () => {
  const result = buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api-db'],
    updates: [{ id: 'api-db', changes: { label: 'read/write SQL' } }],
  })
  const edge = result.scene.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === 'api-db')
  assert.ok(edge)
  assert.equal(edge.label, 'read/write SQL')
  assert.deepEqual(edge.points, [{ x: 840, y: 228 }])
  assert.deepEqual(edge.labelPosition, { x: 830, y: 190 })
  assert.equal(edge.bundleKey, 'from:api')
})

test('removing a node automatically removes its incident relationships and reports impact', () => {
  const result = buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api'],
    removeIds: ['api'],
  })
  const ids = new Set(result.scene.elements.map((item) => item.id))
  assert.equal(ids.has('api'), false)
  assert.equal(ids.has('web-api'), false)
  assert.equal(ids.has('api-db'), false)
  assert.ok(result.automaticElementIds.includes('web-api'))
  assert.ok(result.automaticElementIds.includes('api-db'))
})

test('rejects updates outside the declared subgraph scope', () => {
  assert.throws(() => buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api'],
    updates: [{ id: 'db', changes: { text: 'Other DB' } }],
  }), /scope 外元素/)
})

test('rejects AI geometry changes to locked nodes', () => {
  assert.throws(() => buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['locked'],
    updates: [{ id: 'locked', changes: { x: 700 } }],
  }), /锁定节点/)
})

test('rejects invalid semantic values instead of silently normalizing them away', () => {
  assert.throws(() => buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api'],
    updates: [{ id: 'api', changes: { tone: 'ultraviolet' } }],
  }), /字段值无效/)
  assert.throws(() => buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api-db'],
    updates: [{ id: 'api-db', changes: { fromAnchor: 'center' } }],
  }), /字段值无效/)
})

test('new nodes must provide both coordinates or let the patch engine place them', () => {
  assert.throws(() => buildCanvasSubgraphPatch(scene(), {
    scopeElementIds: ['api'],
    adds: [{ id: 'partial-position', type: 'node', properties: { text: 'Partial', x: 700 } }],
  }), /同时提供 x\/y/)
})

test('local layout reports moved neighbors as automatic impact and preserves locked geometry', () => {
  const source = scene()
  const lockedBefore = source.elements.find((item) => item.id === 'locked')
  const result = buildCanvasSubgraphPatch(source, {
    scopeElementIds: ['api'],
    updates: [{ id: 'api', changes: { subtitle: 'Restructure this neighborhood' } }],
    layout: 'local',
  })
  assert.ok(result.automaticElementIds.some((id) => id === 'web' || id === 'db' || id === 'web-api' || id === 'api-db'))
  assert.deepEqual(result.scene.elements.find((item) => item.id === 'locked'), lockedBefore)
})

test('strict partial acceptance does not silently include automatic relationship changes', () => {
  const base = scene()
  const candidate = buildCanvasSubgraphPatch(base, {
    scopeElementIds: ['api'],
    updates: [{ id: 'api', changes: { x: 620 } }],
  }).scene
  const merged = parseCanvasScene(mergeCanvasProposalSelection(
    serializeCanvasScene(base),
    serializeCanvasScene(candidate),
    ['api'],
    false,
  ))
  const api = merged.elements.find((item) => item.id === 'api')
  const baseEdge = base.elements.find((item) => item.id === 'api-db')
  const mergedEdge = merged.elements.find((item) => item.id === 'api-db')
  assert.ok(api && api.type === 'node')
  assert.equal(api.x, 620)
  assert.deepEqual(mergedEdge, baseEdge)
})

test('legacy partial acceptance can still include related relationship changes', () => {
  const base = scene()
  const candidate = buildCanvasSubgraphPatch(base, {
    scopeElementIds: ['api'],
    updates: [{ id: 'api', changes: { x: 620 } }],
  }).scene
  const merged = parseCanvasScene(mergeCanvasProposalSelection(
    serializeCanvasScene(base),
    serializeCanvasScene(candidate),
    ['api'],
    true,
  ))
  const baseEdge = base.elements.find((item) => item.id === 'api-db')
  const mergedEdge = merged.elements.find((item) => item.id === 'api-db')
  assert.notDeepEqual(mergedEdge, baseEdge)
})

test('subgraph context returns direct relationships and only relevant metadata', () => {
  const source = scene()
  source.lanes = [{ id: 'lane-runtime', label: 'Runtime', axis: 'vertical', start: 0, size: 1400 }]
  source.elements = source.elements.map((item) => item.type !== 'arrow' && ['web', 'api', 'db'].includes(item.id) ? { ...item, laneId: 'lane-runtime' } : item)
  const context = buildCanvasSubgraphContext(source, ['api'], 0, 20)
  const ids = new Set(context.elements.map((item) => item.id))
  assert.ok(ids.has('api'))
  assert.ok(ids.has('web'))
  assert.ok(ids.has('db'))
  assert.ok(ids.has('web-api'))
  assert.ok(ids.has('api-db'))
  assert.equal(ids.has('locked'), false)
  assert.deepEqual(context.groups?.map((item) => item.id), ['system'])
  assert.deepEqual(context.lanes?.map((item) => item.id), ['lane-runtime'])
})

test('subgraph context bounds high fan-out neighborhoods', () => {
  const source: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Fanout',
    width: 12000,
    height: 4000,
    elements: [{ id: 'hub', type: 'node', x: 100, y: 100, width: 200, height: 90, text: 'Hub', emphasis: 'primary' }],
  }
  for (let index = 0; index < 80; index += 1) {
    source.elements.push({ id: `node-${index}`, type: 'node', x: 500 + index * 120, y: 200, width: 100, height: 60, text: `N${index}` })
    source.elements.push({ id: `edge-${index}`, type: 'arrow', from: 'hub', to: `node-${index}`, emphasis: index < 2 ? 'primary' : 'secondary' })
  }
  const context = buildCanvasSubgraphContext(source, ['hub'], 0, 12)
  const nodeCount = context.elements.filter((item) => item.type !== 'arrow').length
  assert.ok(nodeCount <= 12)
  assert.ok(context.elements.some((item) => item.id === 'hub'))
  assert.ok(context.elements.some((item) => item.id === 'node-0'))
  assert.ok(context.hiddenNodes > 0)
  assert.ok(context.hiddenArrows > 0)
})

test('subgraph context also bounds dense relationship sets', () => {
  const source: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Dense',
    width: 6000,
    height: 3000,
    elements: [],
  }
  for (let index = 0; index < 30; index += 1) {
    source.elements.push({ id: `n-${index}`, type: 'node', x: 100 + index * 120, y: 100, width: 100, height: 60, text: `N${index}` })
  }
  for (let from = 0; from < 30; from += 1) {
    for (let to = from + 1; to < 30; to += 1) {
      source.elements.push({ id: `e-${from}-${to}`, type: 'arrow', from: `n-${from}`, to: `n-${to}` })
    }
  }
  const context = buildCanvasSubgraphContext(source, ['n-0'], 1, 30)
  const arrowCount = context.elements.filter((item) => item.type === 'arrow').length
  assert.ok(arrowCount <= 120)
  assert.ok(context.hiddenArrows > 0)
})

test('incremental patch refuses to degrade into a hidden whole-graph reroute', () => {
  const source: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Large fanout',
    width: 20000,
    height: 6000,
    architecture: { theme: 'technical', view: 'detail', density: 'auto' },
    elements: [{ id: 'hub', type: 'node', x: 100, y: 500, width: 200, height: 90, text: 'Hub', icon: 'service' }],
  }
  for (let index = 0; index < 130; index += 1) {
    source.elements.push({ id: `target-${index}`, type: 'node', x: 900 + (index % 10) * 500, y: 100 + Math.floor(index / 10) * 400, width: 180, height: 80, text: `Target ${index}`, icon: 'database' })
    source.elements.push({ id: `edge-${index}`, type: 'arrow', from: 'hub', to: `target-${index}` })
  }
  assert.throws(() => buildCanvasSubgraphPatch(source, {
    scopeElementIds: ['hub'],
    updates: [{ id: 'hub', changes: { x: 180 } }],
  }), /自动重排影响过大/)
})
