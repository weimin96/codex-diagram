import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasScene } from '../src/canvas.js'
import { buildCanvasPatchHistoryEntry, redoCanvasPatchHistory, undoCanvasPatchHistory } from '../src/canvasHistory.js'

function scene(): CanvasScene {
  return {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'History',
    width: 1400,
    height: 900,
    architecture: { theme: 'technical', view: 'detail', density: 'auto' },
    elements: [
      { id: 'api', type: 'node', x: 200, y: 200, width: 220, height: 96, text: 'API', subtitle: 'Spring Boot' },
      { id: 'db', type: 'node', x: 720, y: 200, width: 220, height: 96, text: 'DB' },
      { id: 'api-db', type: 'arrow', from: 'api', to: 'db', label: 'SQL', routing: 'orthogonal', points: [{ x: 580, y: 248 }] },
    ],
  }
}

function entry(before: CanvasScene, after: CanvasScene) {
  return buildCanvasPatchHistoryEntry({
    workspacePath: '/tmp/workspace',
    path: 'docs/diagrams/system.diagram.json',
    before,
    after,
    beforeModifiedAt: '2026-10-09T00:00:00.000Z',
    afterModifiedAt: '2026-10-09T00:00:01.000Z',
    reason: '调整 API',
    declaredElementIds: ['api'],
    automaticElementIds: ['api-db'],
  })
}

test('history undo reverts owned fields while preserving later unrelated edits', () => {
  const before = scene()
  const after = scene()
  after.elements = after.elements.map((item) => item.id === 'api' && item.type === 'node'
    ? { ...item, text: 'Public API', x: 280 }
    : item.id === 'api-db' && item.type === 'arrow'
      ? { ...item, points: [{ x: 620, y: 248 }] }
      : item)
  const history = entry(before, after)
  const current: CanvasScene = {
    ...after,
    elements: after.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, subtitle: 'Spring Boot 4' } : item),
  }
  const result = undoCanvasPatchHistory(current, history)
  const api = result.scene.elements.find((item) => item.id === 'api')
  const edge = result.scene.elements.find((item) => item.id === 'api-db')
  assert.ok(api && api.type === 'node' && edge && edge.type === 'arrow')
  assert.equal(api.text, 'API')
  assert.equal(api.x, 200)
  assert.equal(api.subtitle, 'Spring Boot 4')
  assert.deepEqual(edge.points, [{ x: 580, y: 248 }])
})

test('history undo rejects later edits to a field owned by the transaction', () => {
  const before = scene()
  const after = scene()
  after.elements = after.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Public API' } : item)
  const history = entry(before, after)
  const current: CanvasScene = {
    ...after,
    elements: after.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Gateway API' } : item),
  }
  assert.throws(() => undoCanvasPatchHistory(current, history), /api\.text/)
})

test('history undo removes an added element only when it was not edited later', () => {
  const before = scene()
  const after = scene()
  after.elements.push({ id: 'cache', type: 'node', x: 480, y: 480, width: 200, height: 90, text: 'Redis' })
  const history = entry(before, after)
  const result = undoCanvasPatchHistory(after, history)
  assert.equal(result.scene.elements.some((item) => item.id === 'cache'), false)

  const edited: CanvasScene = {
    ...after,
    elements: after.elements.map((item) => item.id === 'cache' && item.type === 'node' ? { ...item, text: 'Shared Redis' } : item),
  }
  assert.throws(() => undoCanvasPatchHistory(edited, history), /cache 已被后续修改/)
})

test('history undo refuses to remove an added node that later relationships depend on', () => {
  const before = scene()
  const after = scene()
  after.elements.push({ id: 'cache', type: 'node', x: 480, y: 480, width: 200, height: 90, text: 'Redis' })
  const history = entry(before, after)
  const current: CanvasScene = {
    ...after,
    elements: [...after.elements, { id: 'db-cache', type: 'arrow', from: 'db', to: 'cache', label: 'invalidate' }],
  }
  assert.throws(() => undoCanvasPatchHistory(current, history), /cache 已被后续关系 db-cache 引用/)
})

test('history undo restores removed nodes and their relationships', () => {
  const before = scene()
  const after: CanvasScene = { ...before, elements: before.elements.filter((item) => !['api', 'api-db'].includes(item.id)) }
  const history = entry(before, after)
  const result = undoCanvasPatchHistory(after, history)
  assert.ok(result.scene.elements.some((item) => item.id === 'api'))
  assert.ok(result.scene.elements.some((item) => item.id === 'api-db'))
})

test('history entry stores only changed elements instead of the whole canvas', () => {
  const before = scene()
  const after = scene()
  after.elements = after.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Public API' } : item)
  const history = entry(before, after)
  assert.deepEqual(history.changes.map((item) => item.id), ['api'])
  assert.equal(history.changes[0].declared, true)
  assert.equal(history.changes[0].automatic, false)
})

test('history entry retains the accepted AI proposal branch identity', () => {
  const before = scene()
  const after = scene()
  after.elements = after.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Public API' } : item)
  const history = buildCanvasPatchHistoryEntry({
    workspacePath: '/tmp/workspace',
    path: 'docs/diagrams/system.diagram.json',
    before,
    after,
    beforeModifiedAt: '2026-10-09T00:00:00.000Z',
    afterModifiedAt: '2026-10-09T00:00:01.000Z',
    proposalBranchId: 'branch-a',
    proposalBranchLabel: '保守方案',
    proposalBranchGroupId: 'group-1',
  })
  assert.equal(history.proposalBranchId, 'branch-a')
  assert.equal(history.proposalBranchLabel, '保守方案')
  assert.equal(history.proposalBranchGroupId, 'group-1')
})

test('history entry remains sparse for a 5000-node canvas', () => {
  const before: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Large history',
    width: 120000,
    height: 12000,
    elements: [],
  }
  for (let index = 0; index < 5000; index += 1) {
    before.elements.push({
      id: `node-${index}`,
      type: 'node',
      x: (index % 100) * 240,
      y: Math.floor(index / 100) * 150,
      width: 180,
      height: 80,
      text: `Node ${index}`,
    })
  }
  const after: CanvasScene = {
    ...before,
    elements: before.elements.map((item) => item.id === 'node-2500' && item.type === 'node' ? { ...item, text: 'Changed node' } : item),
  }
  const history = entry(before, after)
  assert.equal(history.changes.length, 1)
  assert.equal(history.changes[0].id, 'node-2500')
})

test('history redo reapplies owned fields while preserving later unrelated edits', () => {
  const before = scene()
  const after = scene()
  after.elements = after.elements.map((item) => item.id === 'api' && item.type === 'node'
    ? { ...item, text: 'Public API', x: 280 }
    : item.id === 'api-db' && item.type === 'arrow'
      ? { ...item, points: [{ x: 620, y: 248 }] }
      : item)
  const history = entry(before, after)
  const undone = undoCanvasPatchHistory(after, history).scene
  const current: CanvasScene = {
    ...undone,
    elements: undone.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, subtitle: 'Spring Boot 4' } : item),
  }
  const result = redoCanvasPatchHistory(current, history)
  const api = result.scene.elements.find((item) => item.id === 'api')
  const edge = result.scene.elements.find((item) => item.id === 'api-db')
  assert.ok(api && api.type === 'node' && edge && edge.type === 'arrow')
  assert.equal(api.text, 'Public API')
  assert.equal(api.x, 280)
  assert.equal(api.subtitle, 'Spring Boot 4')
  assert.deepEqual(edge.points, [{ x: 620, y: 248 }])
})

test('history redo rejects later edits to a field owned by the transaction', () => {
  const before = scene()
  const after = scene()
  after.elements = after.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Public API' } : item)
  const history = entry(before, after)
  const undone = undoCanvasPatchHistory(after, history).scene
  const current: CanvasScene = {
    ...undone,
    elements: undone.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Hand edited API' } : item),
  }
  assert.throws(() => redoCanvasPatchHistory(current, history), /api\.text/)
})

test('history redo refuses to remove a restored node that gained a later relationship', () => {
  const before = scene()
  const after: CanvasScene = { ...before, elements: before.elements.filter((item) => !['api', 'api-db'].includes(item.id)) }
  const history = entry(before, after)
  const restored = undoCanvasPatchHistory(after, history).scene
  const current: CanvasScene = {
    ...restored,
    elements: [...restored.elements, { id: 'api-db-later', type: 'arrow', from: 'api', to: 'db', label: 'later' }],
  }
  assert.throws(() => redoCanvasPatchHistory(current, history), /api 已被后续关系 api-db-later 引用/)
})

test('dependent patch chains round-trip in reverse undo and forward redo order', () => {
  const base = scene()
  const first: CanvasScene = {
    ...base,
    elements: base.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Public API' } : item),
  }
  const second: CanvasScene = {
    ...first,
    elements: first.elements.map((item) => item.id === 'api' && item.type === 'node' ? { ...item, text: 'Gateway API' } : item),
  }
  const root = entry(base, first)
  const child = { ...entry(first, second), dependsOnIds: [root.id] }

  const afterChildUndo = undoCanvasPatchHistory(second, child).scene
  const afterRootUndo = undoCanvasPatchHistory(afterChildUndo, root).scene
  const apiAfterUndo = afterRootUndo.elements.find((item) => item.id === 'api')
  assert.ok(apiAfterUndo && apiAfterUndo.type === 'node')
  assert.equal(apiAfterUndo.text, 'API')

  const afterRootRedo = redoCanvasPatchHistory(afterRootUndo, root).scene
  const afterChildRedo = redoCanvasPatchHistory(afterRootRedo, child).scene
  const apiAfterRedo = afterChildRedo.elements.find((item) => item.id === 'api')
  assert.ok(apiAfterRedo && apiAfterRedo.type === 'node')
  assert.equal(apiAfterRedo.text, 'Gateway API')
})
