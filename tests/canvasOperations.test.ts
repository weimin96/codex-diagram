import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasArrow, CanvasScene } from '../src/canvas.js'
import { alignCanvasSelection, copyCanvasSelection, deleteCanvasSelection, insertCanvasNodeOnArrow, layoutCanvasNeighborhood, pasteCanvasSelection, reconnectCanvasArrow, reflowCanvasNeighborhood, reverseCanvasArrow, separateCanvasSelection } from '../src/canvasOperations.js'

function scene(): CanvasScene {
  return {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'test',
    width: 1200,
    height: 800,
    elements: [
      { id: 'node-1', type: 'node', x: 100, y: 120, width: 200, height: 90, text: 'A' },
      { id: 'node-2', type: 'node', x: 500, y: 360, width: 200, height: 90, text: 'B' },
      { id: 'node-3', type: 'node', x: 850, y: 120, width: 200, height: 90, text: 'C' },
      { id: 'arrow-1', type: 'arrow', from: 'node-1', to: 'node-2' },
      { id: 'arrow-2', type: 'arrow', from: 'node-2', to: 'node-3' },
    ],
  }
}

test('copies and pastes a connected canvas selection with unique remapped arrows', () => {
  const source = scene()
  const copied = copyCanvasSelection(source, ['node-1', 'node-2', 'node-3'])
  assert.equal(copied.length, 5)

  const pasted = pasteCanvasSelection(source, copied)
  assert.equal(pasted.selectedIds.length, 3)
  assert.equal(pasted.scene.elements.length, 10)

  const newIds = new Set(pasted.selectedIds)
  const newArrows = pasted.scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow' && item.id !== 'arrow-1' && item.id !== 'arrow-2')
  assert.equal(newArrows.length, 2)
  assert.notEqual(newArrows[0].id, newArrows[1].id)
  for (const arrow of newArrows) {
    assert.ok(newIds.has(arrow.from))
    assert.ok(newIds.has(arrow.to))
  }
})

test('deleting a canvas node also deletes connected arrows', () => {
  const deleted = deleteCanvasSelection(scene(), ['node-2'])
  assert.deepEqual(deleted.elements.map((item) => item.id).sort(), ['node-1', 'node-3'])
})

test('aligns selected canvas boxes while retaining unrelated elements', () => {
  const aligned = alignCanvasSelection(scene(), ['node-1', 'node-2'], 'x', 16)
  const first = aligned.elements.find((item) => item.id === 'node-1')
  const second = aligned.elements.find((item) => item.id === 'node-2')
  assert.ok(first && first.type === 'node')
  assert.ok(second && second.type === 'node')
  assert.equal(first.x, second.x)
  assert.deepEqual(aligned.elements.find((item) => item.id === 'node-3'), scene().elements.find((item) => item.id === 'node-3'))
})

test('reconnects an arrow endpoint and clears stale manual routing', () => {
  const source = scene()
  source.elements = source.elements.map((item) => item.id === 'arrow-1' && item.type === 'arrow'
    ? { ...item, points: [{ x: 320, y: 200 }], labelPosition: { x: 350, y: 170 }, bundleKey: 'from:node-1' }
    : item)
  const next = reconnectCanvasArrow(source, 'arrow-1', 'to', 'node-3', 'left')
  const arrow = next.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === 'arrow-1')
  assert.ok(arrow)
  assert.equal(arrow.to, 'node-3')
  assert.equal(arrow.toAnchor, 'left')
  assert.equal(arrow.points, undefined)
  assert.equal(arrow.labelPosition, undefined)
  assert.equal(arrow.bundleKey, undefined)
})

test('inserts a node into an existing relationship without duplicating its label', () => {
  const source = scene()
  source.elements = source.elements.map((item) => item.id === 'arrow-1' && item.type === 'arrow' ? { ...item, label: 'request' } : item)
  const result = insertCanvasNodeOnArrow(source, 'node-3', 'arrow-1')
  assert.ok(result.newArrowId)
  const arrows = result.scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const first = arrows.find((item) => item.id === 'arrow-1')
  const second = arrows.find((item) => item.id === result.newArrowId)
  assert.ok(first && second)
  assert.equal(first.from, 'node-1')
  assert.equal(first.to, 'node-3')
  assert.equal(first.label, 'request')
  assert.equal(second.from, 'node-3')
  assert.equal(second.to, 'node-2')
  assert.equal(second.label, undefined)
})

test('separates overlapping selected nodes while leaving unrelated nodes fixed', () => {
  const source = scene()
  source.elements = source.elements.map((item) => {
    if (item.id === 'node-1' && item.type === 'node') return { ...item, x: 100, y: 100 }
    if (item.id === 'node-2' && item.type === 'node') return { ...item, x: 160, y: 130 }
    return item
  })
  const beforeThird = source.elements.find((item) => item.id === 'node-3')
  const next = separateCanvasSelection(source, ['node-1', 'node-2'], 24, 16)
  const first = next.elements.find((item) => item.id === 'node-1')
  const second = next.elements.find((item) => item.id === 'node-2')
  assert.ok(first && first.type === 'node')
  assert.ok(second && second.type === 'node')
  const overlaps = first.x < second.x + second.width + 24
    && first.x + first.width + 24 > second.x
    && first.y < second.y + second.height + 24
    && first.y + first.height + 24 > second.y
  assert.equal(overlaps, false)
  assert.deepEqual(next.elements.find((item) => item.id === 'node-3'), beforeThird)
})

test('reverses relationship direction while preserving manual bend geometry', () => {
  const source = scene()
  source.elements = source.elements.map((item) => item.id === 'arrow-1' && item.type === 'arrow'
    ? { ...item, fromAnchor: 'right', toAnchor: 'left', points: [{ x: 320, y: 160 }, { x: 420, y: 260 }] }
    : item)
  const next = reverseCanvasArrow(source, 'arrow-1')
  const arrow = next.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === 'arrow-1')
  assert.ok(arrow)
  assert.equal(arrow.from, 'node-2')
  assert.equal(arrow.to, 'node-1')
  assert.equal(arrow.fromAnchor, 'left')
  assert.equal(arrow.toAnchor, 'right')
  assert.deepEqual(arrow.points, [{ x: 420, y: 260 }, { x: 320, y: 160 }])
})

test('reflows only the collision neighborhood while keeping the dragged anchor and distant nodes stable', () => {
  const source = scene()
  source.elements = source.elements.map((item) => {
    if (item.id === 'node-1' && item.type === 'node') return { ...item, x: 100, y: 100 }
    if (item.id === 'node-2' && item.type === 'node') return { ...item, x: 180, y: 120 }
    if (item.id === 'node-3' && item.type === 'node') return { ...item, x: 900, y: 600 }
    return item
  })
  const beforeAnchor = source.elements.find((item) => item.id === 'node-1')
  const beforeDistant = source.elements.find((item) => item.id === 'node-3')
  const result = reflowCanvasNeighborhood(source, ['node-1'], 24, 16)
  assert.ok(result.movedIds.includes('node-2'))
  assert.deepEqual(result.scene.elements.find((item) => item.id === 'node-1'), beforeAnchor)
  assert.deepEqual(result.scene.elements.find((item) => item.id === 'node-3'), beforeDistant)
  const first = result.scene.elements.find((item) => item.id === 'node-1')
  const second = result.scene.elements.find((item) => item.id === 'node-2')
  assert.ok(first && first.type === 'node' && second && second.type === 'node')
  const overlaps = first.x < second.x + second.width + 24
    && first.x + first.width + 24 > second.x
    && first.y < second.y + second.height + 24
    && first.y + first.height + 24 > second.y
  assert.equal(overlaps, false)
})

test('neighborhood reflow keeps nodes inside their assigned vertical lane', () => {
  const source = scene()
  source.lanes = [{ id: 'lane-a', label: 'A', axis: 'vertical', start: 80, size: 360 }]
  source.elements = source.elements.map((item) => item.type === 'node'
    ? { ...item, laneId: 'lane-a', x: item.id === 'node-1' ? 120 : item.id === 'node-2' ? 160 : item.x }
    : item)
  const result = reflowCanvasNeighborhood(source, ['node-1'], 24, 16)
  const second = result.scene.elements.find((item) => item.id === 'node-2')
  assert.ok(second && second.type === 'node')
  assert.ok(second.x >= 88)
  assert.ok(second.x + second.width <= 432)
})

test('lays out only the local graph neighborhood and preserves the selected anchor center', () => {
  const source = scene()
  source.elements.push({ id: 'node-4', type: 'node', x: 1040, y: 620, width: 120, height: 70, text: 'Distant' })
  const anchor = source.elements.find((item) => item.id === 'node-2')
  const distant = source.elements.find((item) => item.id === 'node-4')
  assert.ok(anchor && anchor.type === 'node')
  const beforeCenter = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 }
  const result = layoutCanvasNeighborhood(source, ['node-2'], 1, 12, 16)
  const after = result.scene.elements.find((item) => item.id === 'node-2')
  assert.ok(after && after.type === 'node')
  assert.ok(result.scopeIds.includes('node-1'))
  assert.ok(result.scopeIds.includes('node-3'))
  assert.ok(!result.scopeIds.includes('node-4'))
  assert.ok(Math.abs(after.x + after.width / 2 - beforeCenter.x) <= 16)
  assert.ok(Math.abs(after.y + after.height / 2 - beforeCenter.y) <= 16)
  assert.deepEqual(result.scene.elements.find((item) => item.id === 'node-4'), distant)
})
