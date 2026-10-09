import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { parseCanvasScene, serializeCanvasScene, type CanvasElement, type CanvasScene } from './canvas.js'

export type CanvasHistoryChangeKind = 'add' | 'remove' | 'update'

export interface CanvasHistoryElementChange {
  id: string
  kind: CanvasHistoryChangeKind
  before?: CanvasElement
  after?: CanvasElement
  automatic: boolean
  declared: boolean
}

export interface CanvasPatchHistoryEntry {
  kind: 'apply'
  version: 1
  id: string
  workspacePath: string
  path: string
  appliedAt: string
  beforeModifiedAt: string
  afterModifiedAt: string
  reason?: string
  layout: 'preserve' | 'local'
  rebased: boolean
  partial: boolean
  acceptedElementIds?: string[]
  scopeElementIds: string[]
  declaredElementIds: string[]
  automaticElementIds: string[]
  proposalBranchId?: string
  proposalBranchLabel?: string
  proposalBranchGroupId?: string
  changes: CanvasHistoryElementChange[]
}

export interface CanvasPatchHistoryUndoEvent {
  kind: 'undo'
  version: 1
  id: string
  workspacePath: string
  path: string
  appliedAt: string
  targetId: string
  beforeModifiedAt: string
  afterModifiedAt: string
}

export interface CanvasPatchHistoryRedoEvent {
  kind: 'redo'
  version: 1
  id: string
  workspacePath: string
  path: string
  appliedAt: string
  targetId: string
  beforeModifiedAt: string
  afterModifiedAt: string
}

type CanvasHistoryEvent = CanvasPatchHistoryEntry | CanvasPatchHistoryUndoEvent | CanvasPatchHistoryRedoEvent

export interface CanvasPatchHistorySummary extends CanvasPatchHistoryEntry {
  undoneAt?: string
  undoEventId?: string
  redoneAt?: string
  redoEventId?: string
}

export interface CanvasHistoryUndoResult {
  scene: CanvasScene
  revertedElementIds: string[]
}

export interface CanvasHistoryRedoResult {
  scene: CanvasScene
  reappliedElementIds: string[]
}

export function buildCanvasPatchHistoryEntry(input: {
  workspacePath: string
  path: string
  before: CanvasScene
  after: CanvasScene
  beforeModifiedAt: string
  afterModifiedAt: string
  reason?: string
  layout?: 'preserve' | 'local'
  rebased?: boolean
  acceptedElementIds?: string[]
  scopeElementIds?: string[]
  declaredElementIds?: string[]
  automaticElementIds?: string[]
  proposalBranchId?: string
  proposalBranchLabel?: string
  proposalBranchGroupId?: string
  appliedAt?: string
  id?: string
}): CanvasPatchHistoryEntry {
  const before = normalize(input.before)
  const after = normalize(input.after)
  const beforeById = new Map(before.elements.map((item) => [item.id, item]))
  const afterById = new Map(after.elements.map((item) => [item.id, item]))
  const declared = new Set(input.declaredElementIds ?? [])
  const automatic = new Set(input.automaticElementIds ?? [])
  const changes: CanvasHistoryElementChange[] = []
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const previous = beforeById.get(id)
    const next = afterById.get(id)
    if (!previous && next) changes.push({ id, kind: 'add', after: next, automatic: automatic.has(id), declared: declared.has(id) })
    else if (previous && !next) changes.push({ id, kind: 'remove', before: previous, automatic: automatic.has(id), declared: declared.has(id) })
    else if (previous && next && !deepEqual(previous, next)) changes.push({ id, kind: 'update', before: previous, after: next, automatic: automatic.has(id), declared: declared.has(id) })
  }
  return {
    kind: 'apply',
    version: 1,
    id: input.id ?? randomUUID(),
    workspacePath: input.workspacePath,
    path: input.path,
    appliedAt: input.appliedAt ?? new Date().toISOString(),
    beforeModifiedAt: input.beforeModifiedAt,
    afterModifiedAt: input.afterModifiedAt,
    reason: input.reason,
    layout: input.layout ?? 'preserve',
    rebased: Boolean(input.rebased),
    partial: Boolean(input.acceptedElementIds?.length),
    acceptedElementIds: input.acceptedElementIds?.length ? [...new Set(input.acceptedElementIds)] : undefined,
    scopeElementIds: [...new Set(input.scopeElementIds ?? [])],
    declaredElementIds: [...new Set(input.declaredElementIds ?? [])],
    automaticElementIds: [...new Set(input.automaticElementIds ?? [])],
    proposalBranchId: input.proposalBranchId,
    proposalBranchLabel: input.proposalBranchLabel,
    proposalBranchGroupId: input.proposalBranchGroupId,
    changes,
  }
}

/**
 * Reverse one AI patch transaction using field ownership rather than replacing
 * the whole document. Later edits to unrelated fields survive; later edits to
 * fields owned by the transaction are treated as conflicts.
 */
export function undoCanvasPatchHistory(current: CanvasScene, entry: CanvasPatchHistoryEntry): CanvasHistoryUndoResult {
  const normalized = normalize(current)
  const byId = new Map(normalized.elements.map((item) => [item.id, item]))
  const conflicts: string[] = []
  const reverted = new Set<string>()

  // Updates first so surviving nodes keep later unrelated semantic edits.
  for (const change of entry.changes.filter((item) => item.kind === 'update')) {
    if (!change.before || !change.after) continue
    const currentItem = byId.get(change.id)
    if (!currentItem) {
      conflicts.push(`${change.id} 已被后续删除`)
      continue
    }
    if (currentItem.type !== change.after.type) {
      conflicts.push(`${change.id}.type`)
      continue
    }
    const next = { ...currentItem } as unknown as Record<string, unknown>
    for (const key of changedKeys(change.before, change.after)) {
      const currentValue = (currentItem as unknown as Record<string, unknown>)[key]
      const afterValue = (change.after as unknown as Record<string, unknown>)[key]
      const beforeValue = (change.before as unknown as Record<string, unknown>)[key]
      if (deepEqual(currentValue, beforeValue)) continue
      if (!deepEqual(currentValue, afterValue)) {
        conflicts.push(`${change.id}.${key}`)
        continue
      }
      if (beforeValue === undefined) delete next[key]
      else next[key] = beforeValue
    }
    if (!conflicts.some((item) => item === `${change.id}.type` || item.startsWith(`${change.id}.`))) {
      byId.set(change.id, next as unknown as CanvasElement)
      reverted.add(change.id)
    }
  }

  // Added elements can only be removed when nobody changed them afterwards.
  const additions = entry.changes
    .filter((item) => item.kind === 'add')
    .sort((left, right) => Number(right.after?.type === 'arrow') - Number(left.after?.type === 'arrow'))
  for (const change of additions) {
    if (!change.after) continue
    const currentItem = byId.get(change.id)
    if (!currentItem) continue
    if (!deepEqual(currentItem, change.after)) {
      conflicts.push(`${change.id} 已被后续修改`)
      continue
    }
    if (currentItem.type !== 'arrow') {
      const laterReferences = [...byId.values()].filter((item) => item.type === 'arrow' && (item.from === change.id || item.to === change.id))
      if (laterReferences.length) {
        conflicts.push(`${change.id} 已被后续关系 ${laterReferences.slice(0, 3).map((item) => item.id).join('、')} 引用`)
        continue
      }
    }
    byId.delete(change.id)
    reverted.add(change.id)
  }

  // Removed nodes are restored before removed arrows so references are valid.
  const removals = entry.changes
    .filter((item) => item.kind === 'remove' && item.before)
    .sort((left, right) => Number(left.before?.type === 'arrow') - Number(right.before?.type === 'arrow'))
  for (const change of removals) {
    if (!change.before) continue
    const currentItem = byId.get(change.id)
    if (currentItem) {
      if (!deepEqual(currentItem, change.before)) conflicts.push(`${change.id} 已被后续复用`)
      continue
    }
    byId.set(change.id, change.before)
    reverted.add(change.id)
  }

  if (conflicts.length) {
    throw new Error(`无法安全撤销该 AI 修改，以下内容后来又发生了变化：${[...new Set(conflicts)].slice(0, 12).join('、')}${conflicts.length > 12 ? '…' : ''}`)
  }
  const order = new Map(normalized.elements.map((item, index) => [item.id, index]))
  const restoredOrder = new Map(entry.changes.flatMap((change, index) => change.before ? [[change.before.id, normalized.elements.length + index] as const] : []))
  const elements = [...byId.values()].sort((left, right) => (order.get(left.id) ?? restoredOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? restoredOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER))
  return { scene: normalize({ ...normalized, elements }), revertedElementIds: [...reverted] }
}

/**
 * Reapply one previously undone AI patch transaction. This is the mirror of
 * undoCanvasPatchHistory: fields owned by the original transaction may only be
 * changed when they still match the pre-patch value. Later edits to unrelated
 * fields survive, while later edits to owned fields are conflicts.
 */
export function redoCanvasPatchHistory(current: CanvasScene, entry: CanvasPatchHistoryEntry): CanvasHistoryRedoResult {
  const normalized = normalize(current)
  const byId = new Map(normalized.elements.map((item) => [item.id, item]))
  const conflicts: string[] = []
  const reapplied = new Set<string>()

  for (const change of entry.changes.filter((item) => item.kind === 'update')) {
    if (!change.before || !change.after) continue
    const currentItem = byId.get(change.id)
    if (!currentItem) {
      conflicts.push(`${change.id} 已被后续删除`)
      continue
    }
    if (currentItem.type !== change.before.type) {
      conflicts.push(`${change.id}.type`)
      continue
    }
    const next = { ...currentItem } as unknown as Record<string, unknown>
    let elementConflict = false
    for (const key of changedKeys(change.before, change.after)) {
      const currentValue = (currentItem as unknown as Record<string, unknown>)[key]
      const beforeValue = (change.before as unknown as Record<string, unknown>)[key]
      const afterValue = (change.after as unknown as Record<string, unknown>)[key]
      if (deepEqual(currentValue, afterValue)) continue
      if (!deepEqual(currentValue, beforeValue)) {
        conflicts.push(`${change.id}.${key}`)
        elementConflict = true
        continue
      }
      if (afterValue === undefined) delete next[key]
      else next[key] = afterValue
    }
    if (!elementConflict) {
      byId.set(change.id, next as unknown as CanvasElement)
      reapplied.add(change.id)
    }
  }

  // Recreate additions after updates. Existing ids are only acceptable when
  // they already exactly equal the transaction result (idempotent retry).
  for (const change of entry.changes.filter((item) => item.kind === 'add')) {
    if (!change.after) continue
    const currentItem = byId.get(change.id)
    if (currentItem) {
      if (!deepEqual(currentItem, change.after)) conflicts.push(`${change.id} 已被后续复用或修改`)
      continue
    }
    byId.set(change.id, change.after)
    reapplied.add(change.id)
  }

  // Remove arrows before nodes. A node cannot be removed if a later relation
  // outside this transaction now depends on it.
  const removals = entry.changes
    .filter((item) => item.kind === 'remove' && item.before)
    .sort((left, right) => Number(left.before?.type !== 'arrow') - Number(right.before?.type !== 'arrow'))
  const removalIds = new Set(removals.map((item) => item.id))
  for (const change of removals) {
    if (!change.before) continue
    const currentItem = byId.get(change.id)
    if (!currentItem) continue
    if (!deepEqual(currentItem, change.before)) {
      conflicts.push(`${change.id} 已被后续修改`)
      continue
    }
    if (currentItem.type !== 'arrow') {
      const laterReferences = [...byId.values()].filter((item) => item.type === 'arrow'
        && !removalIds.has(item.id)
        && (item.from === change.id || item.to === change.id))
      if (laterReferences.length) {
        conflicts.push(`${change.id} 已被后续关系 ${laterReferences.slice(0, 3).map((item) => item.id).join('、')} 引用`)
        continue
      }
    }
    byId.delete(change.id)
    reapplied.add(change.id)
  }

  if (conflicts.length) {
    throw new Error(`无法安全重做该 AI 修改，以下内容后来又发生了变化：${[...new Set(conflicts)].slice(0, 12).join('、')}${conflicts.length > 12 ? '…' : ''}`)
  }
  const order = new Map(normalized.elements.map((item, index) => [item.id, index]))
  const transactionOrder = new Map(entry.changes.flatMap((change, index) => change.after ? [[change.after.id, normalized.elements.length + index] as const] : []))
  const elements = [...byId.values()].sort((left, right) => (order.get(left.id) ?? transactionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? transactionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER))
  return { scene: normalize({ ...normalized, elements }), reappliedElementIds: [...reapplied] }
}

export class CanvasPatchHistoryStore {
  constructor(readonly workspacePath: string) {}

  async appendApply(entry: CanvasPatchHistoryEntry): Promise<void> {
    await this.append(entry)
  }

  async appendUndo(input: Omit<CanvasPatchHistoryUndoEvent, 'kind' | 'version' | 'id' | 'workspacePath' | 'appliedAt'>): Promise<CanvasPatchHistoryUndoEvent> {
    const event: CanvasPatchHistoryUndoEvent = {
      kind: 'undo',
      version: 1,
      id: randomUUID(),
      workspacePath: this.workspacePath,
      appliedAt: new Date().toISOString(),
      ...input,
    }
    await this.append(event)
    return event
  }

  async appendRedo(input: Omit<CanvasPatchHistoryRedoEvent, 'kind' | 'version' | 'id' | 'workspacePath' | 'appliedAt'>): Promise<CanvasPatchHistoryRedoEvent> {
    const event: CanvasPatchHistoryRedoEvent = {
      kind: 'redo',
      version: 1,
      id: randomUUID(),
      workspacePath: this.workspacePath,
      appliedAt: new Date().toISOString(),
      ...input,
    }
    await this.append(event)
    return event
  }

  async list(diagramPath?: string, limit = 80): Promise<CanvasPatchHistorySummary[]> {
    const events = await this.readEvents()
    const state = historyState(events)
    return events
      .filter((event): event is CanvasPatchHistoryEntry => event.kind === 'apply' && (!diagramPath || event.path === diagramPath))
      .slice()
      .reverse()
      .slice(0, Math.max(1, Math.min(200, limit)))
      .map((entry) => {
        const current = state.get(entry.id)
        if (current?.kind === 'undo') return { ...entry, undoneAt: current.appliedAt, undoEventId: current.id }
        if (current?.kind === 'redo') return { ...entry, redoneAt: current.appliedAt, redoEventId: current.id }
        return entry
      })
  }

  async get(id: string): Promise<CanvasPatchHistorySummary | undefined> {
    const events = await this.readEvents()
    const entry = events.find((event): event is CanvasPatchHistoryEntry => event.kind === 'apply' && event.id === id)
    if (!entry) return undefined
    const current = historyState(events).get(id)
    if (current?.kind === 'undo') return { ...entry, undoneAt: current.appliedAt, undoEventId: current.id }
    if (current?.kind === 'redo') return { ...entry, redoneAt: current.appliedAt, redoEventId: current.id }
    return entry
  }

  private async append(event: CanvasHistoryEvent): Promise<void> {
    const file = historyFile(this.workspacePath)
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await appendFile(file, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'a' })
  }

  private async readEvents(): Promise<CanvasHistoryEvent[]> {
    const text = await readFile(historyFile(this.workspacePath), 'utf8').catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    })
    return text.split('\n').flatMap((line) => {
      if (!line.trim()) return []
      try {
        const parsed = JSON.parse(line) as CanvasHistoryEvent
        return parsed?.version === 1 && (parsed.kind === 'apply' || parsed.kind === 'undo' || parsed.kind === 'redo') ? [parsed] : []
      } catch {
        return []
      }
    })
  }
}

function historyState(events: CanvasHistoryEvent[]): Map<string, CanvasPatchHistoryUndoEvent | CanvasPatchHistoryRedoEvent> {
  const state = new Map<string, CanvasPatchHistoryUndoEvent | CanvasPatchHistoryRedoEvent>()
  for (const event of events) {
    if (event.kind === 'undo' || event.kind === 'redo') state.set(event.targetId, event)
  }
  return state
}

function historyFile(workspacePath: string): string {
  const key = createHash('sha256').update(path.resolve(workspacePath)).digest('hex').slice(0, 24)
  return path.join(os.homedir(), '.codex-diagram', 'history', `${key}.jsonl`)
}

function normalize(scene: CanvasScene): CanvasScene {
  return parseCanvasScene(serializeCanvasScene(scene))
}

function changedKeys(before: CanvasElement, after: CanvasElement): string[] {
  const left = before as unknown as Record<string, unknown>
  const right = after as unknown as Record<string, unknown>
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => key !== 'id' && key !== 'type' && !deepEqual(left[key], right[key]))
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  return JSON.stringify(left) === JSON.stringify(right)
}
