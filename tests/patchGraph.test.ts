import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasPatchHistoryEntry, CanvasPatchHistorySummary } from '../src/canvasHistory.js'
import type { CanvasScene } from '../src/canvas.js'
import { buildCanvasSubgraphPatch } from '../src/canvasPatch.js'
import { buildCanvasPatchGraph, canvasPatchDependentClosure, composeCanvasSubgraphPatches, inferCanvasPatchDependencies } from '../src/patchGraph.js'

function entry(id: string, changes: CanvasPatchHistoryEntry['changes'], dependsOnIds: string[] = []): CanvasPatchHistorySummary {
  return {
    kind: 'apply', version: 1, id, workspacePath: '/tmp/ws', path: 'docs/diagrams/a.diagram.json',
    appliedAt: `2026-10-09T00:00:0${id.length}.000Z`, beforeModifiedAt: 'a', afterModifiedAt: 'b',
    layout: 'preserve', rebased: false, partial: false, scopeElementIds: [], declaredElementIds: [], automaticElementIds: [],
    dependsOnIds, changes,
  }
}

test('infers field and structural patch dependencies without serializing unrelated subgraphs', () => {
  const parent = entry('p1', [
    { id: 'api', kind: 'update', before: { id: 'api', type: 'node', x: 0, y: 0, width: 100, height: 60, text: 'API' }, after: { id: 'api', type: 'node', x: 0, y: 0, width: 100, height: 60, text: 'Public API' }, automatic: false, declared: true },
    { id: 'cache', kind: 'add', after: { id: 'cache', type: 'node', x: 200, y: 0, width: 100, height: 60, text: 'Cache' }, automatic: false, declared: true },
  ])
  const child = entry('p2', [
    { id: 'api', kind: 'update', before: { id: 'api', type: 'node', x: 0, y: 0, width: 100, height: 60, text: 'Public API' }, after: { id: 'api', type: 'node', x: 0, y: 0, width: 100, height: 60, text: 'Gateway API' }, automatic: false, declared: true },
    { id: 'api-cache', kind: 'add', after: { id: 'api-cache', type: 'arrow', from: 'api', to: 'cache' }, automatic: false, declared: true },
  ])
  assert.deepEqual(inferCanvasPatchDependencies(child, [parent]), ['p1'])

  const independent = entry('p3', [
    { id: 'db', kind: 'update', before: { id: 'db', type: 'node', x: 500, y: 0, width: 100, height: 60, text: 'DB' }, after: { id: 'db', type: 'node', x: 500, y: 0, width: 100, height: 60, text: 'Primary DB' }, automatic: false, declared: true },
  ])
  assert.deepEqual(inferCanvasPatchDependencies(independent, [parent]), [])
})

test('builds a dependency graph and dependent closure', () => {
  const entries = [entry('a', [], []), entry('b', [], ['a']), entry('c', [], ['b']), entry('x', [], [])]
  const graph = buildCanvasPatchGraph(entries)
  assert.deepEqual(graph.get('a')?.dependentIds, ['b'])
  assert.equal(graph.get('c')?.depth, 2)
  assert.deepEqual(new Set(canvasPatchDependentClosure(entries, 'a')), new Set(['a', 'b', 'c']))
  assert.deepEqual(canvasPatchDependentClosure(entries, 'x'), ['x'])
})

test('composes independent patches and merges disjoint fields on the same element', () => {
  const result = composeCanvasSubgraphPatches([
    { scopeElementIds: ['api'], updates: [{ id: 'api', changes: { text: 'Public API' } }], layout: 'preserve' },
    { scopeElementIds: ['api', 'db'], updates: [{ id: 'api', changes: { subtitle: 'Spring Boot' } }, { id: 'db', changes: { text: 'Primary DB' } }], layout: 'preserve' },
  ])
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(new Set(result.patch.scopeElementIds), new Set(['api', 'db']))
  assert.deepEqual(result.patch.updates?.find((item) => item.id === 'api')?.changes, { text: 'Public API', subtitle: 'Spring Boot' })
})

test('rejects conflicting patch composition instead of using last-write-wins', () => {
  const result = composeCanvasSubgraphPatches([
    { scopeElementIds: ['api'], updates: [{ id: 'api', changes: { text: 'Public API' } }] },
    { scopeElementIds: ['api'], updates: [{ id: 'api', changes: { text: 'Internal API' } }] },
  ])
  assert.deepEqual(result.conflicts, ['api.text'])
})

test('composed independent subgraphs build one valid candidate from the shared base', () => {
  const base: CanvasScene = {
    type: 'codex-diagram-canvas', version: 1, title: 'Compose', width: 1600, height: 900,
    elements: [
      { id: 'api', type: 'node', x: 100, y: 100, width: 180, height: 80, text: 'API' },
      { id: 'db', type: 'node', x: 700, y: 100, width: 180, height: 80, text: 'DB' },
    ],
  }
  const composed = composeCanvasSubgraphPatches([
    { scopeElementIds: ['api'], updates: [{ id: 'api', changes: { text: 'Public API' } }] },
    { scopeElementIds: ['db'], updates: [{ id: 'db', changes: { text: 'Primary DB' } }] },
  ])
  assert.deepEqual(composed.conflicts, [])
  const result = buildCanvasSubgraphPatch(base, composed.patch)
  assert.equal((result.scene.elements.find((item) => item.id === 'api') as { text: string }).text, 'Public API')
  assert.equal((result.scene.elements.find((item) => item.id === 'db') as { text: string }).text, 'Primary DB')
  assert.deepEqual(new Set(result.declaredElementIds), new Set(['api', 'db']))
})
