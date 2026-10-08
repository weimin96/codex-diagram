import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasArrow, CanvasScene } from '../src/canvas.js'
import { alignCanvasSelection, copyCanvasSelection, deleteCanvasSelection, pasteCanvasSelection } from '../src/canvasOperations.js'

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
