import type { CanvasArrow, CanvasC4Type, CanvasElement, CanvasGroup, CanvasIcon, CanvasLane, CanvasLaneAxis, CanvasNode, CanvasNote, CanvasScene, CanvasStencil } from './canvas.js'

export function copyCanvasSelection(scene: CanvasScene, ids: string[]): CanvasElement[] {
  const chosen = new Set(ids)
  return scene.elements
    .filter((item) => chosen.has(item.id) || (item.type === 'arrow' && chosen.has(item.from) && chosen.has(item.to)))
    .map((item) => ({ ...item }))
}

export function pasteCanvasSelection(scene: CanvasScene, copied: CanvasElement[], offset = 32): { scene: CanvasScene; selectedIds: string[] } {
  const idMap = new Map<string, string>()
  const groupMap = new Map<string, string>()
  const groupCounts = new Map<string, number>()
  copied.forEach((item) => {
    if (item.type !== 'arrow' && item.groupId) groupCounts.set(item.groupId, (groupCounts.get(item.groupId) ?? 0) + 1)
  })
  const used: Array<Pick<CanvasElement, 'id'>> = [...scene.elements]
  const boxes = copied.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => {
    const id = nextCanvasElementId(item.type, used)
    idMap.set(item.id, id)
    let groupId = item.groupId && (groupCounts.get(item.groupId) ?? 0) > 1 ? item.groupId : undefined
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, nextCanvasGroupId(scene, [...groupMap.values()]))
      groupId = groupMap.get(groupId)
    }
    const pasted = {
      ...item,
      id,
      ...(groupId ? { groupId } : {}),
      x: clamp(item.x + offset, 0, scene.width - item.width),
      y: clamp(item.y + offset, 0, scene.height - item.height),
    }
    used.push(pasted)
    return pasted
  })
  const arrows = copied.filter((item): item is CanvasArrow => item.type === 'arrow').flatMap((item) => {
    const from = idMap.get(item.from)
    const to = idMap.get(item.to)
    if (!from || !to) return []
    const pasted: CanvasArrow = { ...item, id: nextCanvasElementId('arrow', used), from, to }
    used.push(pasted)
    return [pasted]
  })
  const copiedGroups = [...groupMap.entries()].map(([oldId, newId]) => {
    const sourceGroup = scene.groups?.find((group) => group.id === oldId)
    if (!sourceGroup) return { id: newId }
    const remappedParent = sourceGroup.parentId ? groupMap.get(sourceGroup.parentId) : undefined
    return {
      ...sourceGroup,
      id: newId,
      label: sourceGroup.label ? `${sourceGroup.label} Copy` : undefined,
      ...(remappedParent ? { parentId: remappedParent } : { parentId: undefined }),
    }
  })
  return {
    scene: { ...scene, elements: [...scene.elements, ...boxes, ...arrows], groups: copiedGroups.length ? [...(scene.groups ?? []), ...copiedGroups] : scene.groups },
    selectedIds: boxes.map((item) => item.id),
  }
}

export function deleteCanvasSelection(scene: CanvasScene, ids: string[]): CanvasScene {
  const removed = new Set(ids)
  const elements = scene.elements.filter((item) => (
    !removed.has(item.id)
    && !(item.type === 'arrow' && (removed.has(item.from) || removed.has(item.to)))
  ))
  const usedGroups = new Set(elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && Boolean(item.groupId)).map((item) => item.groupId!))
  return {
    ...scene,
    elements,
    groups: scene.groups?.filter((group) => usedGroups.has(group.id)),
  }
}

export function alignCanvasSelection(scene: CanvasScene, ids: string[], axis: 'x' | 'y', grid = 16): CanvasScene {
  const chosen = scene.elements.filter((item): item is CanvasNode | CanvasNote => ids.includes(item.id) && item.type !== 'arrow' && !item.locked)
  if (chosen.length < 2) return scene
  const target = axis === 'x'
    ? chosen.reduce((sum, item) => sum + item.x + item.width / 2, 0) / chosen.length
    : chosen.reduce((sum, item) => sum + item.y + item.height / 2, 0) / chosen.length
  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || !ids.includes(item.id) || item.locked) return item
      return axis === 'x'
        ? { ...item, x: clamp(snap(target - item.width / 2, grid), 0, scene.width - item.width) }
        : { ...item, y: clamp(snap(target - item.height / 2, grid), 0, scene.height - item.height) }
    }),
  }
}

export function distributeCanvasSelection(scene: CanvasScene, ids: string[], axis: 'x' | 'y', grid = 16): CanvasScene {
  const chosen = scene.elements
    .filter((item): item is CanvasNode | CanvasNote => ids.includes(item.id) && item.type !== 'arrow' && !item.locked)
    .sort((a, b) => axis === 'x' ? a.x - b.x : a.y - b.y)
  if (chosen.length < 3) return scene

  const first = chosen[0]
  const last = chosen[chosen.length - 1]
  const firstCenter = axis === 'x' ? first.x + first.width / 2 : first.y + first.height / 2
  const lastCenter = axis === 'x' ? last.x + last.width / 2 : last.y + last.height / 2
  const step = (lastCenter - firstCenter) / (chosen.length - 1)
  const positions = new Map<string, number>()
  chosen.forEach((item, index) => {
    const center = firstCenter + step * index
    const value = axis === 'x' ? center - item.width / 2 : center - item.height / 2
    positions.set(item.id, snap(value, grid))
  })

  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow') return item
      const next = positions.get(item.id)
      if (next === undefined) return item
      return axis === 'x'
        ? { ...item, x: clamp(next, 0, scene.width - item.width) }
        : { ...item, y: clamp(next, 0, scene.height - item.height) }
    }),
  }
}

export function reorderCanvasSelection(scene: CanvasScene, ids: string[], direction: 'front' | 'back'): CanvasScene {
  const selected = new Set(ids)
  const arrows = scene.elements.filter((item) => item.type === 'arrow')
  const boxes = scene.elements.filter((item) => item.type !== 'arrow')
  const chosen = boxes.filter((item) => selected.has(item.id))
  if (chosen.length === 0) return scene
  const rest = boxes.filter((item) => !selected.has(item.id))
  return {
    ...scene,
    elements: direction === 'front'
      ? [...arrows, ...rest, ...chosen]
      : [...arrows, ...chosen, ...rest],
  }
}

export function groupCanvasSelection(scene: CanvasScene, ids: string[]): { scene: CanvasScene; groupId?: string } {
  const chosen = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && ids.includes(item.id))
  if (chosen.length < 2) return { scene }
  const existing = chosen.map((item) => item.groupId).filter((value): value is string => Boolean(value))
  const groupId = existing.length === chosen.length && existing.every((value) => value === existing[0])
    ? existing[0]
    : nextCanvasGroupId(scene)
  return {
    groupId,
    scene: {
      ...scene,
      elements: scene.elements.map((item) => item.type !== 'arrow' && ids.includes(item.id) ? { ...item, groupId } : item),
      groups: upsertCanvasGroup(scene.groups, { id: groupId, label: scene.groups?.find((group) => group.id === groupId)?.label ?? `Group ${groupId.replace(/^group-/, '')}` }),
    },
  }
}

export function ungroupCanvasSelection(scene: CanvasScene, ids: string[]): CanvasScene {
  const groupIds = new Set(scene.elements
    .filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && ids.includes(item.id) && Boolean(item.groupId))
    .map((item) => item.groupId!))
  if (groupIds.size === 0) return scene
  const nextElements = scene.elements.map((item) => {
    if (item.type === 'arrow' || !item.groupId || !groupIds.has(item.groupId)) return item
    const { groupId: _groupId, ...rest } = item
    return rest
  })
  const stillUsed = new Set(nextElements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && Boolean(item.groupId)).map((item) => item.groupId!))
  return {
    ...scene,
    elements: nextElements,
    groups: scene.groups?.filter((group) => !groupIds.has(group.id) || stillUsed.has(group.id)),
  }
}

export function updateCanvasGroup(scene: CanvasScene, groupId: string, patch: Partial<Omit<CanvasGroup, 'id'>>): CanvasScene {
  return { ...scene, groups: upsertCanvasGroup(scene.groups, { id: groupId, ...patch }) }
}

export function setCanvasGroupParent(scene: CanvasScene, groupId: string, parentId?: string): CanvasScene {
  if (parentId === groupId) return scene
  const groups = scene.groups ?? []
  if (!groups.some((group) => group.id === groupId)) return scene
  if (parentId && !groups.some((group) => group.id === parentId)) return scene
  if (parentId) {
    let current: string | undefined = parentId
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      if (current === groupId) return scene
      seen.add(current)
      current = groups.find((group) => group.id === current)?.parentId
    }
  }
  return {
    ...scene,
    groups: groups.map((group) => {
      if (group.id !== groupId) return group
      if (parentId) return { ...group, parentId }
      const { parentId: _parentId, ...rest } = group
      return rest
    }),
  }
}

export type CanvasLayoutMode = 'horizontal' | 'vertical' | 'grid'
export type CanvasArchitectureTemplate = 'web-service' | 'event-driven' | 'cache-aside'
export type CanvasTraceDirection = 'upstream' | 'downstream' | 'both'

export interface CanvasTraceResult {
  nodeIds: string[]
  arrowIds: string[]
  distanceById: Record<string, number>
}

export function traceCanvasGraph(scene: CanvasScene, seedIds: string[], direction: CanvasTraceDirection, depth = 1): CanvasTraceResult {
  const nodes = new Set(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => item.id))
  const seeds = [...new Set(seedIds.filter((id) => nodes.has(id)))]
  const maxDepth = Math.max(1, Math.min(8, Math.floor(depth)))
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const outgoing = new Map<string, Array<{ nodeId: string; arrowId: string }>>()
  const incoming = new Map<string, Array<{ nodeId: string; arrowId: string }>>()
  arrows.forEach((arrow) => {
    const out = outgoing.get(arrow.from) ?? []
    out.push({ nodeId: arrow.to, arrowId: arrow.id })
    outgoing.set(arrow.from, out)
    const inc = incoming.get(arrow.to) ?? []
    inc.push({ nodeId: arrow.from, arrowId: arrow.id })
    incoming.set(arrow.to, inc)
  })
  const distance = new Map<string, number>(seeds.map((id) => [id, 0]))
  const queue = [...seeds]
  const arrowIds = new Set<string>()

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    const currentDepth = distance.get(current) ?? 0
    if (currentDepth >= maxDepth) continue
    const candidates = [
      ...(direction === 'downstream' || direction === 'both' ? outgoing.get(current) ?? [] : []),
      ...(direction === 'upstream' || direction === 'both' ? incoming.get(current) ?? [] : []),
    ]
    for (const candidate of candidates) {
      if (!nodes.has(candidate.nodeId)) continue
      arrowIds.add(candidate.arrowId)
      const nextDepth = currentDepth + 1
      if ((distance.get(candidate.nodeId) ?? Number.POSITIVE_INFINITY) <= nextDepth) continue
      distance.set(candidate.nodeId, nextDepth)
      queue.push(candidate.nodeId)
    }
  }

  const nodeIds = [...distance.keys()]
  // Include internal relationships between visible traced nodes, even when a shorter
  // traversal path reached those nodes through another edge.
  const tracedNodes = new Set(nodeIds)
  arrows.forEach((arrow) => {
    if (tracedNodes.has(arrow.from) && tracedNodes.has(arrow.to)) arrowIds.add(arrow.id)
  })
  return {
    nodeIds,
    arrowIds: [...arrowIds],
    distanceById: Object.fromEntries(distance),
  }
}

export function insertCanvasArchitectureTemplate(scene: CanvasScene, template: CanvasArchitectureTemplate): { scene: CanvasScene; selectedIds: string[] } {
  const used: CanvasElement[] = [...scene.elements]
  const existingBoxes = scene.elements.filter((item) => item.type !== 'arrow').length
  const originX = 120 + (existingBoxes % 3) * 48
  const originY = 120 + (existingBoxes % 4) * 42
  const added: CanvasElement[] = []
  const node = (text: string, x: number, y: number, icon: CanvasIcon, stencil?: CanvasStencil, subtitle?: string, c4Type: CanvasC4Type = 'container') => {
    const id = nextCanvasElementId('node', [...used, ...added])
    added.push({ id, type: 'node', x: originX + x, y: originY + y, width: 210, height: 92, text, icon, stencil, subtitle, c4Type, tone: 'default' })
    return id
  }
  const arrow = (from: string, to: string, label?: string) => {
    const id = nextCanvasElementId('arrow', [...used, ...added])
    added.push({ id, type: 'arrow', from, to, label, routing: 'orthogonal', fromAnchor: 'right', toAnchor: 'left' })
  }

  if (template === 'web-service') {
    const web = node('Web App', 0, 140, 'web', 'react', 'UI / Client')
    const api = node('API Gateway', 300, 140, 'api', undefined, 'HTTP / Auth')
    const service = node('Application Service', 600, 140, 'service', 'spring', 'Business Logic')
    const db = node('Database', 900, 40, 'database', 'postgres')
    const cache = node('Cache', 900, 240, 'cache', 'redis')
    arrow(web, api, 'HTTPS')
    arrow(api, service, 'request')
    arrow(service, db, 'read/write')
    arrow(service, cache, 'cache')
  } else if (template === 'event-driven') {
    const producer = node('Producer Service', 0, 140, 'service', 'spring')
    const broker = node('Event Bus', 330, 140, 'queue', 'kafka')
    const consumer = node('Consumer Service', 660, 60, 'service', 'spring')
    const worker = node('Async Worker', 660, 240, 'service')
    const store = node('State Store', 960, 140, 'database', 'postgres')
    arrow(producer, broker, 'publish')
    arrow(broker, consumer, 'consume')
    arrow(broker, worker, 'consume')
    arrow(consumer, store, 'persist')
    arrow(worker, store, 'persist')
  } else {
    const client = node('Client', 0, 140, 'web', undefined, undefined, 'person')
    const service = node('Application Service', 300, 140, 'service', 'spring')
    const cache = node('Cache', 620, 40, 'cache', 'redis')
    const db = node('Database', 620, 240, 'database', 'postgres')
    arrow(client, service, 'request')
    arrow(service, cache, 'lookup')
    arrow(service, db, 'fallback')
  }

  const nodeIds = added.filter((item) => item.type !== 'arrow').map((item) => item.id)
  return { scene: { ...scene, elements: [...scene.elements, ...added] }, selectedIds: nodeIds }
}

export function layoutCanvasScene(scene: CanvasScene, mode: CanvasLayoutMode, grid = 16): CanvasScene {
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const mutable = boxes.filter((item) => !item.locked)
  if (mutable.length < 2) return scene

  if (scene.lanes?.length) return layoutCanvasWithinLanes(scene, mode, grid)

  if (mode === 'grid') {
    const columns = Math.max(2, Math.ceil(Math.sqrt(mutable.length)))
    const positions = new Map<string, { x: number; y: number }>()
    mutable.forEach((item, index) => {
      positions.set(item.id, {
        x: snap(96 + (index % columns) * 300, grid),
        y: snap(96 + Math.floor(index / columns) * 190, grid),
      })
    })
    return applyLayoutPositions(scene, positions)
  }

  const mutableIds = new Set(mutable.map((item) => item.id))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  mutable.forEach((item) => {
    incoming.set(item.id, 0)
    outgoing.set(item.id, [])
  })
  scene.elements.forEach((item) => {
    if (item.type !== 'arrow' || item.from === item.to || !mutableIds.has(item.from) || !mutableIds.has(item.to)) return
    incoming.set(item.to, (incoming.get(item.to) ?? 0) + 1)
    outgoing.get(item.from)?.push(item.to)
  })
  const layerById = new Map<string, number>()
  const queue = mutable.filter((item) => (incoming.get(item.id) ?? 0) === 0).map((item) => item.id)
  if (queue.length === 0) queue.push(mutable[0].id)
  queue.forEach((id) => layerById.set(id, 0))
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    const base = layerById.get(id) ?? 0
    for (const next of outgoing.get(id) ?? []) {
      layerById.set(next, Math.max(layerById.get(next) ?? 0, base + 1))
      incoming.set(next, Math.max(0, (incoming.get(next) ?? 0) - 1))
      if ((incoming.get(next) ?? 0) === 0) queue.push(next)
    }
  }
  let fallbackLayer = Math.max(0, ...layerById.values()) + 1
  mutable.forEach((item) => {
    if (!layerById.has(item.id)) layerById.set(item.id, fallbackLayer++)
  })

  const layers = new Map<number, Array<CanvasNode | CanvasNote>>()
  mutable.forEach((item) => {
    const layer = layerById.get(item.id) ?? 0
    const entries = layers.get(layer) ?? []
    entries.push(item)
    layers.set(layer, entries)
  })
  const positions = new Map<string, { x: number; y: number }>()
  ;[...layers.entries()].sort(([a], [b]) => a - b).forEach(([layer, items]) => {
    items.sort((a, b) => a.y - b.y || a.x - b.x)
    items.forEach((item, index) => {
      positions.set(item.id, mode === 'horizontal'
        ? { x: snap(96 + layer * 330, grid), y: snap(96 + index * 170, grid) }
        : { x: snap(96 + index * 330, grid), y: snap(96 + layer * 170, grid) })
    })
  })
  return applyLayoutPositions(scene, positions)
}

export function layoutCanvasSelection(scene: CanvasScene, ids: string[], mode: CanvasLayoutMode, grid = 16): CanvasScene {
  const selected = new Set(ids)
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && selected.has(item.id) && !item.locked)
  if (boxes.length < 2) return scene
  const minX = Math.min(...boxes.map((item) => item.x))
  const minY = Math.min(...boxes.map((item) => item.y))
  const subsetElements = scene.elements.filter((item) => (
    item.type !== 'arrow'
      ? selected.has(item.id)
      : selected.has(item.from) && selected.has(item.to)
  ))
  const arranged = layoutCanvasScene({ ...scene, elements: subsetElements, groups: undefined, lanes: undefined }, mode, grid)
  const arrangedBoxes = arranged.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrangedMinX = Math.min(...arrangedBoxes.map((item) => item.x))
  const arrangedMinY = Math.min(...arrangedBoxes.map((item) => item.y))
  const moved = new Map(arrangedBoxes.map((item) => [item.id, {
    x: clamp(item.x - arrangedMinX + minX, 0, scene.width - item.width),
    y: clamp(item.y - arrangedMinY + minY, 0, scene.height - item.height),
  }]))
  return applyLayoutPositions(scene, moved)
}

export function createCanvasLanePreset(scene: CanvasScene, axis: CanvasLaneAxis, count = 3): CanvasScene {
  const safeCount = Math.max(2, Math.min(6, Math.floor(count)))
  const extent = axis === 'horizontal' ? scene.height : scene.width
  const size = extent / safeCount
  const lanes: CanvasLane[] = Array.from({ length: safeCount }, (_, index) => ({
    id: `lane-${axis}-${index + 1}`,
    label: `Lane ${index + 1}`,
    axis,
    start: index * size,
    size,
    tone: index % 2 === 0 ? 'muted' : 'default',
  }))
  const elements = scene.elements.map((item) => {
    if (item.type === 'arrow') return item
    const center = axis === 'horizontal' ? item.y + item.height / 2 : item.x + item.width / 2
    const lane = lanes[Math.min(safeCount - 1, Math.max(0, Math.floor(center / size)))]
    return { ...item, laneId: lane.id }
  })
  return { ...scene, lanes, elements }
}

export function clearCanvasLanes(scene: CanvasScene): CanvasScene {
  return {
    ...scene,
    lanes: undefined,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || !item.laneId) return item
      const { laneId: _laneId, ...rest } = item
      return rest
    }),
  }
}

export function assignCanvasSelectionToLane(scene: CanvasScene, ids: string[], laneId?: string): CanvasScene {
  const allowed = laneId ? scene.lanes?.some((lane) => lane.id === laneId) : true
  if (!allowed) return scene
  const selected = new Set(ids)
  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || !selected.has(item.id) || item.locked) return item
      if (laneId) return { ...item, laneId }
      const { laneId: _laneId, ...rest } = item
      return rest
    }),
  }
}

export function updateCanvasLane(scene: CanvasScene, laneId: string, patch: Partial<Omit<CanvasLane, 'id'>>): CanvasScene {
  if (!scene.lanes?.some((lane) => lane.id === laneId)) return scene
  return {
    ...scene,
    lanes: scene.lanes.map((lane) => lane.id === laneId ? { ...lane, ...patch, id: lane.id } : lane),
  }
}

export function expandCanvasGroupSelection(scene: CanvasScene, ids: string[]): string[] {
  const groups = new Set(scene.elements
    .filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && ids.includes(item.id) && Boolean(item.groupId))
    .map((item) => item.groupId!))
  if (groups.size === 0) return ids
  const result = new Set(ids)
  scene.elements.forEach((item) => {
    if (item.type !== 'arrow' && item.groupId && groups.has(item.groupId)) result.add(item.id)
  })
  return [...result]
}

export function nextCanvasGroupId(scene: CanvasScene, reserved: string[] = []): string {
  const used = new Set([
    ...reserved,
    ...scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && Boolean(item.groupId)).map((item) => item.groupId!),
  ])
  for (let index = 1; index < 100_000; index += 1) {
    const id = `group-${index}`
    if (!used.has(id)) return id
  }
  return `group-${Date.now()}`
}

export function nextCanvasElementId(prefix: string, elements: Array<Pick<CanvasElement, 'id'>>): string {
  const used = new Set(elements.map((item) => item.id))
  for (let index = 1; index < 100_000; index += 1) {
    const id = `${prefix}-${index}`
    if (!used.has(id)) return id
  }
  return `${prefix}-${Date.now()}`
}

function snap(value: number, grid: number) {
  return Math.round(value / grid) * grid
}

function applyLayoutPositions(scene: CanvasScene, positions: Map<string, { x: number; y: number }>): CanvasScene {
  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || item.locked) return item
      const position = positions.get(item.id)
      if (!position) return item
      return {
        ...item,
        x: clamp(position.x, 0, scene.width - item.width),
        y: clamp(position.y, 0, scene.height - item.height),
      }
    }),
  }
}

function layoutCanvasWithinLanes(scene: CanvasScene, mode: CanvasLayoutMode, grid: number): CanvasScene {
  const lanes = scene.lanes ?? []
  const positions = new Map<string, { x: number; y: number }>()
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && !item.locked)
  for (const lane of lanes) {
    const members = boxes.filter((item) => item.laneId === lane.id)
    if (!members.length) continue
    const columns = mode === 'grid' ? Math.max(1, Math.ceil(Math.sqrt(members.length))) : mode === 'horizontal' ? members.length : 1
    members.forEach((item, index) => {
      if (lane.axis === 'horizontal') {
        const usableWidth = Math.max(220, scene.width - 160)
        const cellWidth = usableWidth / Math.max(1, columns)
        const row = Math.floor(index / columns)
        const col = index % columns
        positions.set(item.id, {
          x: snap(80 + col * cellWidth + Math.max(0, (cellWidth - item.width) / 2), grid),
          y: snap(lane.start + 46 + row * 140, grid),
        })
      } else {
        const rows = mode === 'vertical' ? members.length : Math.max(1, Math.ceil(members.length / columns))
        const usableHeight = Math.max(160, scene.height - 120)
        const cellHeight = usableHeight / Math.max(1, rows)
        const col = mode === 'vertical' ? 0 : index % columns
        const row = mode === 'vertical' ? index : Math.floor(index / columns)
        positions.set(item.id, {
          x: snap(lane.start + 34 + col * 240, grid),
          y: snap(60 + row * cellHeight + Math.max(0, (cellHeight - item.height) / 2), grid),
        })
      }
    })
  }
  return applyLayoutPositions(scene, positions)
}

function upsertCanvasGroup(groups: CanvasGroup[] | undefined, next: CanvasGroup): CanvasGroup[] {
  const current = groups ?? []
  return current.some((group) => group.id === next.id)
    ? current.map((group) => group.id === next.id ? { ...group, ...next } : group)
    : [...current, next]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
