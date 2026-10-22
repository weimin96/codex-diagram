import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasArrowCrossesViewport } from '../src/canvasViewport.js'
import type { CanvasArrow, CanvasNode } from '../src/canvas.js'

const boxes = new Map<string, CanvasNode>([
  ['left', { id: 'left', type: 'node', x: -800, y: 150, width: 100, height: 80, text: 'Left' }],
  ['right', { id: 'right', type: 'node', x: 800, y: 150, width: 100, height: 80, text: 'Right' }],
])
const view = { x: 0, y: 0, width: 400, height: 400 }

test('保留两端离屏但穿过视口的直线和正交关系', () => {
  for (const routing of ['straight', 'orthogonal'] as const) {
    const arrow: CanvasArrow = { id: routing, type: 'arrow', from: 'left', to: 'right', routing }
    assert.equal(canvasArrowCrossesViewport(arrow, boxes, view), true, routing)
  }
})

test('不保留未穿过视口的远端连线，但保留穿屏手工折点', () => {
  const overhead = new Map([...boxes].map(([id, box]) => [id, { ...box, y: -500 }]))
  const outside: CanvasArrow = { id: 'outside', type: 'arrow', from: 'left', to: 'right', routing: 'straight', points: [{ x: 200, y: 200 }] }
  const far: CanvasArrow = { id: 'far', type: 'arrow', from: 'left', to: 'left', routing: 'straight', points: [{ x: -600, y: -900 }] }
  assert.equal(canvasArrowCrossesViewport(outside, overhead, view), true)
  assert.equal(canvasArrowCrossesViewport(far, boxes, view), false)
})

test('独立起止点连线按实际路径裁剪，边界相切仍可见', () => {
  const crossing: CanvasArrow = { id: 'free', type: 'arrow', from: '', to: '', start: { x: -200, y: 200 }, end: { x: 600, y: 200 } }
  const tangent: CanvasArrow = { ...crossing, id: 'tangent', start: { x: -200, y: 0 }, end: { x: 600, y: 0 } }
  const outside: CanvasArrow = { ...crossing, id: 'outside', start: { x: -200, y: 600 }, end: { x: 600, y: 600 } }
  assert.equal(canvasArrowCrossesViewport(crossing, boxes, view), true)
  assert.equal(canvasArrowCrossesViewport(tangent, boxes, view), true)
  assert.equal(canvasArrowCrossesViewport(outside, boxes, view), false)
})
