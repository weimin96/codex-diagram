import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasGroupFrames, type CanvasScene } from '../src/canvas.js'
import { buildCanvasPlaybackPlan } from '../src/CanvasEditor.js'

test('schedules a reverse cross-region arrow only after both endpoint nodes are placed', () => {
  const scene: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'cross-region',
    width: 2600,
    height: 900,
    groups: [
      { id: 'left', label: 'Left', kind: 'boundary' },
      { id: 'middle', label: 'Middle', kind: 'boundary' },
      { id: 'right', label: 'Right', kind: 'boundary' },
    ],
    elements: [
      { id: 'a', type: 'node', x: 160, y: 220, width: 180, height: 84, text: 'A', groupId: 'left' },
      { id: 'b', type: 'node', x: 1060, y: 220, width: 180, height: 84, text: 'B', groupId: 'middle' },
      { id: 'c', type: 'node', x: 1960, y: 220, width: 180, height: 84, text: 'C', groupId: 'right' },
      { id: 'c-to-a', type: 'arrow', from: 'c', to: 'a', fromAnchor: 'left', toAnchor: 'right', routing: 'orthogonal' },
    ],
  }

  const plan = buildCanvasPlaybackPlan(undefined, scene, 'create')
  const arrowIndex = plan.actions.findIndex((action) => action.kind === 'arrow' && action.id === 'c-to-a')
  const sourceIndex = plan.actions.findIndex((action) => action.kind === 'box' && action.id === 'c')
  const targetIndex = plan.actions.findIndex((action) => action.kind === 'box' && action.id === 'a')

  assert.ok(arrowIndex > sourceIndex)
  assert.ok(arrowIndex > targetIndex)
})

test('stages previous node, arrow and boundary presentation until update actions run', () => {
  const previous: CanvasScene = {
    type: 'codex-diagram-canvas',
    version: 1,
    title: 'before-after',
    width: 1600,
    height: 900,
    groups: [{ id: 'system', label: 'System', kind: 'boundary', tone: 'muted' }],
    elements: [
      { id: 'api', type: 'node', x: 180, y: 240, width: 200, height: 90, text: 'API', tone: 'default', groupId: 'system' },
      { id: 'db', type: 'node', x: 560, y: 240, width: 200, height: 90, text: 'DB', groupId: 'system' },
      { id: 'api-db', type: 'arrow', from: 'api', to: 'db', label: 'reads', fromAnchor: 'right', toAnchor: 'left' },
    ],
  }
  const next = structuredClone(previous)
  const api = next.elements.find((item) => item.id === 'api')
  const db = next.elements.find((item) => item.id === 'db')
  const arrow = next.elements.find((item) => item.id === 'api-db')
  assert.ok(api && api.type === 'node')
  assert.ok(db && db.type === 'node')
  assert.ok(arrow && arrow.type === 'arrow')
  api.text = 'API v2'
  api.tone = 'warning'
  api.shape = 'pill'
  db.x = 820
  arrow.label = 'queries'
  arrow.fromAnchor = 'bottom'

  const beforeFrame = canvasGroupFrames(previous).find((group) => group.id === 'system')
  const afterFrame = canvasGroupFrames(next).find((group) => group.id === 'system')
  assert.ok(beforeFrame && afterFrame)
  assert.notEqual(beforeFrame.width, afterFrame.width)

  const plan = buildCanvasPlaybackPlan(previous, next, 'update')
  assert.equal(plan.initialBoxOverrides.api?.text, 'API')
  assert.equal(plan.initialBoxOverrides.api?.tone, 'default')
  assert.equal(plan.initialArrowOverrides['api-db']?.label, 'reads')
  assert.equal(plan.initialArrowOverrides['api-db']?.fromAnchor, 'right')
  assert.equal(plan.initialGroupFrameOverrides.system?.width, beforeFrame.width)
  assert.notEqual(plan.initialGroupFrameOverrides.system?.width, afterFrame.width)
})
