import type { CanvasArrow, CanvasElement } from './canvas.js'
import type { CanvasPatchHistoryEntry, CanvasPatchHistorySummary } from './canvasHistory.js'
import type { CanvasSubgraphPatchInput } from './canvasPatch.js'

export interface CanvasPatchGraphNode {
  id: string
  dependsOnIds: string[]
  dependentIds: string[]
  depth: number
}

export interface CanvasPatchCompositionResult {
  patch: CanvasSubgraphPatchInput
  conflicts: string[]
}

export function inferCanvasPatchDependencies(
  entry: CanvasPatchHistoryEntry,
  previous: CanvasPatchHistorySummary[],
): string[] {
  const active = previous.filter((item) => item.path === entry.path && !item.undoneAt)
  const dependencies = new Set<string>()
  const entryById = new Map(entry.changes.map((change) => [change.id, change]))
  const referencedIds = new Set(entry.changes.flatMap((change) => relationshipReferences(change.after)))

  for (const prior of active) {
    let depends = false
    for (const priorChange of prior.changes) {
      const currentChange = entryById.get(priorChange.id)
      if (currentChange && changesDepend(currentChange.before, currentChange.after, priorChange.before, priorChange.after, priorChange.kind)) {
        depends = true
        break
      }
      if (priorChange.kind === 'add' && priorChange.after?.type !== 'arrow' && referencedIds.has(priorChange.id)) {
        depends = true
        break
      }
    }
    if (depends) dependencies.add(prior.id)
  }
  return [...dependencies]
}

export function buildCanvasPatchGraph(entries: CanvasPatchHistorySummary[]): Map<string, CanvasPatchGraphNode> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const nodes = new Map<string, CanvasPatchGraphNode>()
  for (const entry of entries) {
    const dependsOnIds = (entry.dependsOnIds ?? []).filter((id) => byId.has(id))
    nodes.set(entry.id, { id: entry.id, dependsOnIds, dependentIds: [], depth: 0 })
  }
  for (const node of nodes.values()) {
    for (const parentId of node.dependsOnIds) nodes.get(parentId)?.dependentIds.push(node.id)
  }
  const depthMemo = new Map<string, number>()
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const node = nodes.get(id)
    const depth = !node?.dependsOnIds.length ? 0 : 1 + Math.max(...node.dependsOnIds.map((parent) => depthOf(parent, new Set(seen))))
    depthMemo.set(id, depth)
    return depth
  }
  for (const node of nodes.values()) node.depth = depthOf(node.id)
  return nodes
}

export function canvasPatchDependentClosure(entries: CanvasPatchHistorySummary[], rootId: string): string[] {
  const graph = buildCanvasPatchGraph(entries)
  if (!graph.has(rootId)) return []
  const result = new Set<string>()
  const visit = (id: string) => {
    if (result.has(id)) return
    result.add(id)
    for (const child of graph.get(id)?.dependentIds ?? []) visit(child)
  }
  visit(rootId)
  return [...result]
}

export function composeCanvasSubgraphPatches(patches: CanvasSubgraphPatchInput[]): CanvasPatchCompositionResult {
  if (patches.length < 2) throw new Error('至少需要两个 Canvas Patch 才能组合。')
  const scope = new Set<string>()
  const updates = new Map<string, Record<string, unknown>>()
  const adds = new Map<string, { id: string; type: 'node' | 'note' | 'arrow'; properties: Record<string, unknown> }>()
  const removals = new Set<string>()
  const conflicts = new Set<string>()
  let local = false

  for (const patch of patches) {
    patch.scopeElementIds.forEach((id) => scope.add(id))
    local ||= patch.layout === 'local'
    for (const id of patch.removeIds ?? []) {
      if (updates.has(id) || adds.has(id)) conflicts.add(`${id} 同时被修改/新增和删除`)
      removals.add(id)
    }
    for (const update of patch.updates ?? []) {
      if (removals.has(update.id) || adds.has(update.id)) {
        conflicts.add(`${update.id} 同时被修改和删除/新增`)
        continue
      }
      const merged = { ...(updates.get(update.id) ?? {}) }
      for (const [field, value] of Object.entries(update.changes)) {
        if (Object.prototype.hasOwnProperty.call(merged, field) && !sameValue(merged[field], value)) conflicts.add(`${update.id}.${field}`)
        else merged[field] = value
      }
      updates.set(update.id, merged)
    }
    for (const add of patch.adds ?? []) {
      if (removals.has(add.id) || updates.has(add.id)) {
        conflicts.add(`${add.id} 同时被新增和修改/删除`)
        continue
      }
      const previous = adds.get(add.id)
      if (previous && !sameValue(previous, add)) conflicts.add(`${add.id} 存在不同的新增定义`)
      else adds.set(add.id, { ...add, properties: { ...add.properties } })
    }
  }

  return {
    patch: {
      scopeElementIds: [...scope],
      updates: [...updates].map(([id, changes]) => ({ id, changes })),
      adds: [...adds.values()],
      removeIds: [...removals],
      layout: local ? 'local' : 'preserve',
    },
    conflicts: [...conflicts],
  }
}

function changesDepend(
  before: CanvasElement | undefined,
  after: CanvasElement | undefined,
  priorBefore: CanvasElement | undefined,
  priorAfter: CanvasElement | undefined,
  priorKind: 'add' | 'remove' | 'update',
): boolean {
  if (priorKind === 'add') return Boolean(after || before)
  if (priorKind === 'remove') return Boolean(after && !priorAfter)
  if (!before || !after || !priorBefore || !priorAfter || before.type !== after.type || priorBefore.type !== priorAfter.type) return false
  const currentFields = changedFields(before, after)
  const priorFields = new Set(changedFields(priorBefore, priorAfter))
  return currentFields.some((field) => priorFields.has(field))
}

function relationshipReferences(element: CanvasElement | undefined): string[] {
  if (!element || element.type !== 'arrow') return []
  const arrow = element as CanvasArrow
  return [arrow.from, arrow.to]
}

function changedFields(before: CanvasElement, after: CanvasElement): string[] {
  const left = before as unknown as Record<string, unknown>
  const right = after as unknown as Record<string, unknown>
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => key !== 'id' && key !== 'type' && !sameValue(left[key], right[key]))
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  return JSON.stringify(left) === JSON.stringify(right)
}
