import assert from 'node:assert/strict'
import test from 'node:test'
import { beautifyArchitectureScene } from '../src/architectureDesign.js'
import type { CanvasScene } from '../src/canvas.js'

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
  assert.ok((arrows.get('a2')?.points?.length ?? 0) >= 2)
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
