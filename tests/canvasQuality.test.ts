import assert from 'node:assert/strict'
import test from 'node:test'
import { assessCanvasVisualQuality } from '../src/canvasQuality.js'
import type { CanvasScene } from '../src/canvas.js'

test('Canvas quality gate catches overlap, edge-through-node and long labels', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Quality',
    width: 1200,
    height: 700,
    architecture: { theme: 'technical', view: 'detail', density: 'auto' },
    elements: [
      { id: 'a', type: 'node', x: 60, y: 180, width: 180, height: 90, text: 'API Gateway' },
      { id: 'overlap', type: 'node', x: 180, y: 200, width: 180, height: 90, text: 'Overlapping Service' },
      { id: 'blocker', type: 'node', x: 430, y: 170, width: 200, height: 110, text: 'Worker' },
      { id: 'b', type: 'node', x: 820, y: 180, width: 180, height: 90, text: 'PostgreSQL' },
      { id: 'long', type: 'node', x: 820, y: 420, width: 180, height: 90, text: 'This node title is intentionally much longer than a diagram card should normally contain because it belongs in description' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b', routing: 'straight', label: 'HTTP' },
    ],
  }

  const quality = assessCanvasVisualQuality(scene)
  assert.equal(quality.needsRevision, true)
  assert.ok(quality.metrics.nodeOverlaps >= 1)
  assert.ok(quality.metrics.edgeNodeIntersections >= 1)
  assert.ok(quality.metrics.longLabels >= 1)
  assert.ok(quality.issues.some((issue) => issue.code === 'node-overlap'))
  assert.ok(quality.issues.some((issue) => issue.code === 'edge-through-node'))
  assert.ok(quality.issues.some((issue) => issue.code === 'long-label'))
})

test('Canvas quality gate identifies crossing independent relationships', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Crossing',
    width: 1000,
    height: 700,
    elements: [
      { id: 'a', type: 'node', x: 60, y: 80, width: 120, height: 70, text: 'A' },
      { id: 'b', type: 'node', x: 780, y: 500, width: 120, height: 70, text: 'B' },
      { id: 'c', type: 'node', x: 60, y: 500, width: 120, height: 70, text: 'C' },
      { id: 'd', type: 'node', x: 780, y: 80, width: 120, height: 70, text: 'D' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b', routing: 'straight' },
      { id: 'cd', type: 'arrow', from: 'c', to: 'd', routing: 'straight' },
    ],
  }

  const quality = assessCanvasVisualQuality(scene)
  assert.equal(quality.metrics.edgeCrossings, 1)
  assert.ok(quality.issues.some((issue) => issue.code === 'edge-crossing'))
})

test('同一 bundle 的非共线路段交叉仍然需要报告', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Bundled crossing',
    width: 1000,
    height: 700,
    architecture: { theme: 'enterprise', view: 'detail', density: 'compact' },
    elements: [
      { id: 'a', type: 'node', x: 60, y: 80, width: 120, height: 70, text: 'A' },
      { id: 'b', type: 'node', x: 780, y: 500, width: 120, height: 70, text: 'B' },
      { id: 'c', type: 'node', x: 60, y: 500, width: 120, height: 70, text: 'C' },
      { id: 'd', type: 'node', x: 780, y: 80, width: 120, height: 70, text: 'D' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b', routing: 'straight', bundleKey: 'group:left->right' },
      { id: 'cd', type: 'arrow', from: 'c', to: 'd', routing: 'straight', bundleKey: 'group:left->right' },
    ],
  }

  const quality = assessCanvasVisualQuality(scene)
  assert.equal(quality.metrics.edgeCrossings, 1)
  assert.equal(quality.issues.some((issue) => issue.code === 'edge-crossing'), true)
})

test('质量检查区分独立连线重叠与共享总线', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas', version: 1, title: '重叠线路', width: 600, height: 300,
    elements: [
      { id: 'a', type: 'node', x: 0, y: 0, width: 40, height: 40, text: 'A' },
      { id: 'b', type: 'node', x: 400, y: 0, width: 40, height: 40, text: 'B' },
      { id: 'c', type: 'node', x: 0, y: 200, width: 40, height: 40, text: 'C' },
      { id: 'd', type: 'node', x: 400, y: 200, width: 40, height: 40, text: 'D' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b', fromAnchor: 'bottom', toAnchor: 'bottom', routing: 'orthogonal', points: [{ x: 20, y: 100 }, { x: 420, y: 100 }] },
      { id: 'cd', type: 'arrow', from: 'c', to: 'd', fromAnchor: 'top', toAnchor: 'top', routing: 'orthogonal', points: [{ x: 20, y: 100 }, { x: 420, y: 100 }] },
    ],
  }
  assert.equal(assessCanvasVisualQuality(scene).metrics.edgeOverlaps, 1)
  assert.equal(assessCanvasVisualQuality(scene).needsRevision, true)
  const bundled = { ...scene, elements: scene.elements.map((item) => item.type === 'arrow' ? { ...item, bundleKey: 'group:shared' } : item) }
  assert.equal(assessCanvasVisualQuality(bundled).metrics.edgeOverlaps, 0)
})

test('Canvas quality gate passes a simple clean diagram', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'Clean',
    width: 900,
    height: 500,
    elements: [
      { id: 'a', type: 'node', x: 80, y: 180, width: 180, height: 90, text: 'Client' },
      { id: 'b', type: 'node', x: 560, y: 180, width: 180, height: 90, text: 'API' },
      { id: 'ab', type: 'arrow', from: 'a', to: 'b', routing: 'straight', label: 'HTTPS' },
    ],
  }

  const quality = assessCanvasVisualQuality(scene)
  assert.equal(quality.needsRevision, false)
  assert.deepEqual(quality.issues, [])
})
