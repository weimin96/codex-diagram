import type {
  CanvasArrow,
  CanvasArchitectureTheme,
  CanvasElement,
  CanvasEmphasis,
  CanvasIcon,
  CanvasLane,
  CanvasNode,
  CanvasNote,
  CanvasPoint,
  CanvasScene,
  CanvasStencil,
  CanvasTone,
} from './canvas.js'

export type ArchitectureTheme = CanvasArchitectureTheme

export interface ArchitectureBeautifyOptions {
  theme?: ArchitectureTheme
  repartition?: boolean
  relayout?: boolean
  reroute?: boolean
}

export interface ArchitectureBeautifyResult {
  scene: CanvasScene
  summary: {
    theme: ArchitectureTheme
    partitions: number
    enrichedNodes: number
    routedEdges: number
    primaryNodes: number
    bundledEdges: number
  }
}

type ArchitecturePartition = 'external' | 'experience' | 'application' | 'processing' | 'data'

const partitionOrder: ArchitecturePartition[] = ['external', 'experience', 'application', 'processing', 'data']

const partitionMeta: Record<ArchitecturePartition, { label: string; tone: CanvasTone }> = {
  external: { label: '外部与参与方', tone: 'muted' },
  experience: { label: '体验与入口', tone: 'accent' },
  application: { label: '核心应用', tone: 'default' },
  processing: { label: '处理与异步', tone: 'warning' },
  data: { label: '数据与检索', tone: 'success' },
}

const themeTones: Record<ArchitectureTheme, Record<ArchitecturePartition, CanvasTone>> = {
  enterprise: {
    external: 'muted',
    experience: 'accent',
    application: 'default',
    processing: 'warning',
    data: 'success',
  },
  technical: {
    external: 'muted',
    experience: 'default',
    application: 'accent',
    processing: 'muted',
    data: 'success',
  },
  presentation: {
    external: 'muted',
    experience: 'accent',
    application: 'success',
    processing: 'warning',
    data: 'accent',
  },
}

export function beautifyArchitectureScene(scene: CanvasScene, options: ArchitectureBeautifyOptions = {}): ArchitectureBeautifyResult {
  const theme = options.theme ?? 'enterprise'
  const repartition = options.repartition !== false
  const relayout = options.relayout !== false
  const reroute = options.reroute !== false
  const originalBoxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const originalById = new Map(originalBoxes.map((item) => [item.id, item]))
  const semanticBoxes = originalBoxes.map((item) => enrichArchitectureBox(item))
  const partitionById = new Map(semanticBoxes.map((item) => [item.id, classifyArchitectureBox(item)]))
  const activePartitions = partitionOrder.filter((partition) => semanticBoxes.some((item) => partitionById.get(item.id) === partition))
  const lanes = repartition ? buildArchitectureLanes(semanticBoxes, partitionById, activePartitions, theme) : scene.lanes
  const laneByPartition = new Map<ArchitecturePartition, CanvasLane>()
  if (repartition) activePartitions.forEach((partition, index) => laneByPartition.set(partition, lanes?.[index] as CanvasLane))

  let enrichedNodes = 0
  let elements: CanvasElement[] = scene.elements.map((item) => {
    if (item.type === 'arrow') return item
    const semantic = semanticBoxes.find((candidate) => candidate.id === item.id) ?? item
    const partition = partitionById.get(item.id) ?? 'application'
    const lane = laneByPartition.get(partition)
    const tone = themeTones[theme][partition]
    const changed = semantic.icon !== item.icon || semantic.stencil !== item.stencil || item.tone !== tone || (repartition && lane?.id !== item.laneId)
    if (changed) enrichedNodes += 1
    return {
      ...semantic,
      tone,
      shape: semantic.shape ?? 'rounded',
      ...(repartition && lane ? { laneId: lane.id } : {}),
    }
  })

  let width = scene.width
  let height = scene.height
  if (repartition && lanes?.length) {
    const presentation = theme === 'presentation'
    width = Math.max(presentation ? 1440 : 1280, Math.ceil(lanes[lanes.length - 1].start + lanes[lanes.length - 1].size + (presentation ? 60 : 48)))
    const maxRows = Math.max(1, ...activePartitions.map((partition) => Math.ceil((semanticBoxes.filter((item) => partitionById.get(item.id) === partition).length || 1) / partitionColumns(semanticBoxes.filter((item) => partitionById.get(item.id) === partition).length))))
    height = Math.max(presentation ? 900 : 820, (presentation ? 230 : 160) + maxRows * (presentation ? 154 : 138))
  }

  let next: CanvasScene = {
    ...scene,
    width,
    height,
    elements,
    ...(repartition ? { lanes } : {}),
    architecture: {
      theme,
      ...(theme === 'presentation' ? { presentation: true } : {}),
    },
  }

  if (relayout && repartition && lanes?.length) next = layoutArchitecturePartitions(next, partitionById, laneByPartition, theme)
  if (repartition) next = ensureArchitectureSystemBoundary(next, partitionById)
  next = applyArchitectureTheme(next, theme, partitionById)
  next = applyArchitectureEmphasis(next, partitionById)
  if (reroute) next = routeArchitectureEdges(next)

  // Keep locked boxes exactly where the author placed them, even when the rest
  // of the architecture is re-partitioned.
  if (relayout) {
    next = {
      ...next,
      elements: next.elements.map((item) => {
        if (item.type === 'arrow' || !item.locked) return item
        const before = originalById.get(item.id)
        return before ? { ...item, x: before.x, y: before.y, width: before.width, height: before.height } : item
      }),
    }
  }

  return {
    scene: next,
    summary: {
      theme,
      partitions: activePartitions.length,
      enrichedNodes,
      routedEdges: reroute ? next.elements.filter((item) => item.type === 'arrow').length : 0,
      primaryNodes: next.elements.filter((item) => item.type !== 'arrow' && item.emphasis === 'primary').length,
      bundledEdges: next.elements.filter((item) => item.type === 'arrow' && Boolean(item.bundleKey)).length,
    },
  }
}

function ensureArchitectureSystemBoundary(scene: CanvasScene, partitions: Map<string, ArchitecturePartition>): CanvasScene {
  const groups = scene.groups ?? []
  if (groups.some((group) => group.c4Type === 'software-system')) return scene
  const internalNodes = scene.elements.filter((item): item is CanvasNode | CanvasNote => (
    item.type !== 'arrow' && partitions.get(item.id) !== 'external'
  ))
  if (internalNodes.length < 3) return scene
  const usedIds = new Set(groups.map((group) => group.id))
  let systemId = 'arch-system'
  for (let index = 2; usedIds.has(systemId); index += 1) systemId = `arch-system-${index}`
  const directlyGrouped = new Map<string, Array<CanvasNode | CanvasNote>>()
  internalNodes.forEach((item) => {
    if (!item.groupId) return
    directlyGrouped.set(item.groupId, [...(directlyGrouped.get(item.groupId) ?? []), item])
  })
  const nextGroups = groups.map((group) => {
    if (group.parentId || group.c4Type === 'software-system') return group
    const members = directlyGrouped.get(group.id) ?? []
    if (!members.length || members.some((item) => partitions.get(item.id) === 'external')) return group
    return { ...group, parentId: systemId }
  })
  nextGroups.push({
    id: systemId,
    label: scene.title || 'Software System',
    kind: 'boundary',
    c4Type: 'software-system',
    tone: 'accent',
    description: 'Architecture system boundary',
  })
  const childGroups = new Set(nextGroups.filter((group) => group.parentId === systemId).map((group) => group.id))
  return {
    ...scene,
    groups: nextGroups,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || partitions.get(item.id) === 'external') return item
      if (!item.groupId) return { ...item, groupId: systemId }
      if (childGroups.has(item.groupId)) return item
      return item
    }),
  }
}

export function applyArchitectureTheme(
  scene: CanvasScene,
  theme: ArchitectureTheme,
  knownPartitions?: Map<string, ArchitecturePartition>,
): CanvasScene {
  const partitions = knownPartitions ?? new Map(
    scene.elements
      .filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
      .map((item) => [item.id, classifyArchitectureBox(item)]),
  )
  return {
    ...scene,
    lanes: scene.lanes?.map((lane) => {
      const partition = partitionFromLaneId(lane.id)
      return partition ? { ...lane, tone: themeTones[theme][partition] } : lane
    }),
    groups: scene.groups?.map((group) => {
      const memberPartitions = scene.elements.flatMap((item) => item.type !== 'arrow' && item.groupId === group.id ? [partitions.get(item.id)] : []).filter(Boolean) as ArchitecturePartition[]
      const partition = dominantPartition(memberPartitions)
      return partition ? { ...group, tone: themeTones[theme][partition] } : group
    }),
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow') return item
      const partition = partitions.get(item.id) ?? partitionFromLaneId(item.laneId ?? '') ?? 'application'
      return { ...item, tone: themeTones[theme][partition] }
    }),
  }
}

export function applyArchitectureEmphasis(
  scene: CanvasScene,
  knownPartitions?: Map<string, ArchitecturePartition>,
): CanvasScene {
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  if (!boxes.length) return scene
  const partitions = knownPartitions ?? new Map(boxes.map((item) => [item.id, classifyArchitectureBox(item)]))
  const boxById = new Map(boxes.map((item) => [item.id, item]))
  const outgoing = new Map<string, CanvasArrow[]>()
  const incoming = new Map<string, CanvasArrow[]>()
  arrows.forEach((arrow) => {
    outgoing.set(arrow.from, [...(outgoing.get(arrow.from) ?? []), arrow])
    incoming.set(arrow.to, [...(incoming.get(arrow.to) ?? []), arrow])
  })
  const weight = (item: CanvasNode | CanvasNote) => architectureNodeWeight(item)
    + (outgoing.get(item.id)?.length ?? 0) * 3
    + (incoming.get(item.id)?.length ?? 0) * 2

  const roots = boxes
    .filter((item) => isArchitectureEntry(item) || (incoming.get(item.id)?.length ?? 0) === 0)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, 7)
  const sinks = boxes
    .filter((item) => partitions.get(item.id) === 'data' || (outgoing.get(item.id)?.length ?? 0) === 0)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, 9)

  let bestPath: { nodeIds: string[]; arrowIds: string[]; score: number } | undefined
  for (const root of roots) {
    for (const sink of sinks) {
      if (root.id === sink.id) continue
      const path = directedArchitecturePath(root.id, sink.id, outgoing)
      if (!path) continue
      const score = path.nodeIds.reduce((sum, id) => sum + weight(boxById.get(id) ?? root), 0)
        + new Set(path.nodeIds.map((id) => partitions.get(id))).size * 10
        + (partitions.get(sink.id) === 'data' ? 14 : 0)
        - Math.max(0, path.nodeIds.length - 6) * 5
      if (!bestPath || score > bestPath.score) bestPath = { ...path, score }
    }
  }

  const primaryNodes = new Set(bestPath?.nodeIds ?? [])
  const primaryArrows = new Set(bestPath?.arrowIds ?? [])
  if (primaryNodes.size < Math.min(3, boxes.length)) {
    boxes
      .slice()
      .sort((a, b) => weight(b) - weight(a))
      .slice(0, Math.max(2, Math.ceil(boxes.length * 0.22)))
      .forEach((item) => primaryNodes.add(item.id))
  }
  const adjacentToPrimary = new Set<string>()
  arrows.forEach((arrow) => {
    if (primaryNodes.has(arrow.from)) adjacentToPrimary.add(arrow.to)
    if (primaryNodes.has(arrow.to)) adjacentToPrimary.add(arrow.from)
  })

  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow') {
        const emphasis: CanvasEmphasis = primaryArrows.has(item.id)
          ? 'primary'
          : primaryNodes.has(item.from) || primaryNodes.has(item.to)
            ? 'secondary'
            : 'muted'
        return { ...item, emphasis }
      }
      const emphasis: CanvasEmphasis = primaryNodes.has(item.id)
        ? 'primary'
        : adjacentToPrimary.has(item.id) || weight(item) >= 11
          ? 'secondary'
          : 'muted'
      return { ...item, emphasis }
    }),
  }
}

export function routeArchitectureEdges(scene: CanvasScene): CanvasScene {
  const boxes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const routed = new Map<string, CanvasArrow>()
  const occupied: RouteSegment[] = []
  const fanout = countArrowEndpoints(arrows, 'from')
  const fanin = countArrowEndpoints(arrows, 'to')

  for (const arrow of arrows) {
    const from = boxes.get(arrow.from)
    const to = boxes.get(arrow.to)
    if (!from || !to) continue
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const dx = toCenter.x - fromCenter.x
    const dy = toCenter.y - fromCenter.y
    const asyncEdge = from.icon === 'queue' || to.icon === 'queue'
      || from.stencil === 'kafka' || to.stencil === 'kafka'
      || from.stencil === 'rabbitmq' || to.stencil === 'rabbitmq'
    const obstacles = [...boxes.values()]
      .filter((item) => item.id !== from.id && item.id !== to.id)
      .map((item) => expandRect(item, 18))
    const bundleKey = (fanout.get(arrow.from) ?? 0) >= 2
      ? `from:${arrow.from}`
      : (fanin.get(arrow.to) ?? 0) >= 2
        ? `to:${arrow.to}`
        : undefined
    const pairs = preferredAnchorPairs(dx, dy)
    let best: { score: number; fromAnchor: 'top' | 'right' | 'bottom' | 'left'; toAnchor: 'top' | 'right' | 'bottom' | 'left'; route: CanvasPoint[] } | undefined
    for (const [fromAnchor, toAnchor] of pairs) {
      const start = fixedAnchorPoint(from, fromAnchor)
      const end = fixedAnchorPoint(to, toAnchor)
      const route = findOrthogonalRoute(start, end, obstacles, occupied, bundleKey)
      const score = scoreRoute(route, obstacles, occupied, bundleKey)
        + (fromAnchor === pairs[0][0] && toAnchor === pairs[0][1] ? 0 : 42)
      if (!best || score < best.score) best = { score, fromAnchor, toAnchor, route }
      if (bundleKey) {
        const side = bundleKey.startsWith('from:') ? 'from' : 'to'
        const bundled = buildBundleRoute(start, end, fromAnchor, toAnchor, side)
        const bundleScore = scoreRoute(bundled, obstacles, occupied, bundleKey) - 72
          + (fromAnchor === pairs[0][0] && toAnchor === pairs[0][1] ? 0 : 42)
        if (!best || bundleScore < best.score) best = { score: bundleScore, fromAnchor, toAnchor, route: bundled }
      }
    }
    if (!best) continue
    const simplified = simplifyRoute(best.route)
    addOccupiedSegments(simplified, occupied, bundleKey)
    routed.set(arrow.id, {
      ...arrow,
      routing: 'orthogonal',
      fromAnchor: best.fromAnchor,
      toAnchor: best.toAnchor,
      lineStyle: asyncEdge ? 'dashed' : arrow.lineStyle ?? 'solid',
      points: simplified.length > 2 ? simplified.slice(1, -1) : undefined,
      bundleKey,
    })
  }

  return {
    ...scene,
    elements: scene.elements.map((item) => item.type === 'arrow' ? routed.get(item.id) ?? item : item),
  }
}

type RouteRect = { x: number; y: number; width: number; height: number }
type RouteSegment = { a: CanvasPoint; b: CanvasPoint; bundleKey?: string }

function countArrowEndpoints(arrows: CanvasArrow[], side: 'from' | 'to'): Map<string, number> {
  const counts = new Map<string, number>()
  arrows.forEach((arrow) => counts.set(arrow[side], (counts.get(arrow[side]) ?? 0) + 1))
  return counts
}

function buildBundleRoute(
  start: CanvasPoint,
  end: CanvasPoint,
  fromAnchor: 'top' | 'right' | 'bottom' | 'left',
  toAnchor: 'top' | 'right' | 'bottom' | 'left',
  side: 'from' | 'to',
): CanvasPoint[] {
  if (side === 'from') {
    const trunk = offsetAnchor(start, fromAnchor, 64)
    if (fromAnchor === 'left' || fromAnchor === 'right') return simplifyRoute([start, trunk, { x: trunk.x, y: end.y }, end])
    return simplifyRoute([start, trunk, { x: end.x, y: trunk.y }, end])
  }
  const trunk = offsetAnchor(end, toAnchor, 64)
  if (toAnchor === 'left' || toAnchor === 'right') return simplifyRoute([start, { x: trunk.x, y: start.y }, trunk, end])
  return simplifyRoute([start, { x: start.x, y: trunk.y }, trunk, end])
}

function offsetAnchor(point: CanvasPoint, anchor: 'top' | 'right' | 'bottom' | 'left', distance: number): CanvasPoint {
  if (anchor === 'left') return { x: point.x - distance, y: point.y }
  if (anchor === 'right') return { x: point.x + distance, y: point.y }
  if (anchor === 'top') return { x: point.x, y: point.y - distance }
  return { x: point.x, y: point.y + distance }
}

function preferredAnchorPairs(dx: number, dy: number): Array<['top' | 'right' | 'bottom' | 'left', 'top' | 'right' | 'bottom' | 'left']> {
  const horizontal: ['right' | 'left', 'left' | 'right'] = dx >= 0 ? ['right', 'left'] : ['left', 'right']
  const vertical: ['bottom' | 'top', 'top' | 'bottom'] = dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
  return Math.abs(dx) >= Math.abs(dy)
    ? [horizontal, vertical, [horizontal[0], vertical[1]], [vertical[0], horizontal[1]]]
    : [vertical, horizontal, [vertical[0], horizontal[1]], [horizontal[0], vertical[1]]]
}

function fixedAnchorPoint(box: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>, anchor: 'top' | 'right' | 'bottom' | 'left'): CanvasPoint {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  if (anchor === 'top') return { x: cx, y: box.y }
  if (anchor === 'right') return { x: box.x + box.width, y: cy }
  if (anchor === 'bottom') return { x: cx, y: box.y + box.height }
  return { x: box.x, y: cy }
}

function expandRect(box: RouteRect, margin: number): RouteRect {
  return { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 }
}

function findOrthogonalRoute(start: CanvasPoint, end: CanvasPoint, obstacles: RouteRect[], occupied: RouteSegment[], bundleKey?: string): CanvasPoint[] {
  const margin = 24
  const xCandidates = uniqueNumbers([
    (start.x + end.x) / 2,
    start.x + Math.sign(end.x - start.x || 1) * 56,
    end.x - Math.sign(end.x - start.x || 1) * 56,
    ...obstacles.flatMap((item) => [item.x - margin, item.x + item.width + margin]),
  ]).sort((a, b) => Math.abs(a - (start.x + end.x) / 2) - Math.abs(b - (start.x + end.x) / 2)).slice(0, 28)
  const yCandidates = uniqueNumbers([
    (start.y + end.y) / 2,
    start.y + Math.sign(end.y - start.y || 1) * 48,
    end.y - Math.sign(end.y - start.y || 1) * 48,
    ...obstacles.flatMap((item) => [item.y - margin, item.y + item.height + margin]),
  ]).sort((a, b) => Math.abs(a - (start.y + end.y) / 2) - Math.abs(b - (start.y + end.y) / 2)).slice(0, 28)

  const candidates: CanvasPoint[][] = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    ...xCandidates.map((x) => [start, { x, y: start.y }, { x, y: end.y }, end]),
    ...yCandidates.map((y) => [start, { x: start.x, y }, { x: end.x, y }, end]),
  ]
  let best = candidates[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const simplified = simplifyRoute(candidate)
    const score = scoreRoute(simplified, obstacles, occupied, bundleKey)
    if (score < bestScore) {
      best = simplified
      bestScore = score
    }
  }
  return best
}

function scoreRoute(route: CanvasPoint[], obstacles: RouteRect[], occupied: RouteSegment[], bundleKey?: string): number {
  let length = 0
  let collisions = 0
  let overlapPenalty = 0
  let crossingPenalty = 0
  for (let index = 0; index < route.length - 1; index += 1) {
    const segment = { a: route[index], b: route[index + 1] }
    length += Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y)
    collisions += obstacles.filter((rect) => segmentIntersectsRect(segment, rect)).length
    for (const used of occupied) {
      const overlap = segmentOverlap(segment, used)
      overlapPenalty += overlap * (bundleKey && used.bundleKey === bundleKey ? 0.08 : 4)
      if (segmentsCross(segment, used) && (!bundleKey || used.bundleKey !== bundleKey)) crossingPenalty += 110
    }
  }
  return length + Math.max(0, route.length - 2) * 22 + collisions * 100_000 + overlapPenalty + crossingPenalty
}

function segmentIntersectsRect(segment: RouteSegment, rect: RouteRect): boolean {
  const minX = Math.min(segment.a.x, segment.b.x)
  const maxX = Math.max(segment.a.x, segment.b.x)
  const minY = Math.min(segment.a.y, segment.b.y)
  const maxY = Math.max(segment.a.y, segment.b.y)
  if (segment.a.y === segment.b.y) {
    const y = segment.a.y
    return y > rect.y && y < rect.y + rect.height && maxX > rect.x && minX < rect.x + rect.width
  }
  if (segment.a.x === segment.b.x) {
    const x = segment.a.x
    return x > rect.x && x < rect.x + rect.width && maxY > rect.y && minY < rect.y + rect.height
  }
  return false
}

function segmentOverlap(left: RouteSegment, right: RouteSegment): number {
  const leftHorizontal = left.a.y === left.b.y
  const rightHorizontal = right.a.y === right.b.y
  if (leftHorizontal !== rightHorizontal) return 0
  if (leftHorizontal) {
    if (Math.abs(left.a.y - right.a.y) > 8) return 0
    return intervalOverlap(left.a.x, left.b.x, right.a.x, right.b.x)
  }
  if (Math.abs(left.a.x - right.a.x) > 8) return 0
  return intervalOverlap(left.a.y, left.b.y, right.a.y, right.b.y)
}

function segmentsCross(left: RouteSegment, right: RouteSegment): boolean {
  const leftHorizontal = left.a.y === left.b.y
  const rightHorizontal = right.a.y === right.b.y
  if (leftHorizontal === rightHorizontal) return false
  const horizontal = leftHorizontal ? left : right
  const vertical = leftHorizontal ? right : left
  const hx1 = Math.min(horizontal.a.x, horizontal.b.x)
  const hx2 = Math.max(horizontal.a.x, horizontal.b.x)
  const vy1 = Math.min(vertical.a.y, vertical.b.y)
  const vy2 = Math.max(vertical.a.y, vertical.b.y)
  return vertical.a.x > hx1 && vertical.a.x < hx2 && horizontal.a.y > vy1 && horizontal.a.y < vy2
}

function intervalOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)))
}

function simplifyRoute(points: CanvasPoint[]): CanvasPoint[] {
  const deduped = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  return deduped.filter((point, index) => {
    if (index === 0 || index === deduped.length - 1) return true
    const before = deduped[index - 1]
    const after = deduped[index + 1]
    return !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y))
  })
}

function addOccupiedSegments(route: CanvasPoint[], occupied: RouteSegment[], bundleKey?: string) {
  for (let index = 0; index < route.length - 1; index += 1) occupied.push({ a: route[index], b: route[index + 1], bundleKey })
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite).map((value) => Math.round(value)))]
}

function buildArchitectureLanes(
  boxes: Array<CanvasNode | CanvasNote>,
  partitions: Map<string, ArchitecturePartition>,
  active: ArchitecturePartition[],
  theme: ArchitectureTheme,
): CanvasLane[] {
  const presentation = theme === 'presentation'
  let start = presentation ? 44 : 36
  return active.map((partition) => {
    const count = boxes.filter((item) => partitions.get(item.id) === partition).length
    const columns = partitionColumns(count)
    const size = (presentation ? 88 : 72) + columns * (presentation ? 276 : 252)
    const lane: CanvasLane = {
      id: `arch-${partition}`,
      label: partitionMeta[partition].label,
      axis: 'vertical',
      start,
      size,
      tone: themeTones[theme][partition],
    }
    start += size + (presentation ? 30 : 24)
    return lane
  })
}

function layoutArchitecturePartitions(
  scene: CanvasScene,
  partitions: Map<string, ArchitecturePartition>,
  laneByPartition: Map<ArchitecturePartition, CanvasLane>,
  theme: ArchitectureTheme,
): CanvasScene {
  const presentation = theme === 'presentation'
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const positionById = new Map<string, { x: number; y: number }>()
  for (const partition of partitionOrder) {
    const lane = laneByPartition.get(partition)
    if (!lane) continue
    const members = boxes.filter((item) => partitions.get(item.id) === partition && !item.locked)
    const columns = partitionColumns(members.length)
    const rows = Math.max(1, Math.ceil(members.length / columns))
    members
      .sort((a, b) => architectureSortKey(a) - architectureSortKey(b) || a.y - b.y || a.x - b.x)
      .forEach((item, index) => {
        const col = Math.floor(index / rows)
        const row = index % rows
        positionById.set(item.id, {
          x: lane.start + (presentation ? 42 : 34) + col * (presentation ? 276 : 252),
          y: (presentation ? 132 : 92) + row * (presentation ? 150 : 132),
        })
      })
  }
  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || item.locked) return item
      const position = positionById.get(item.id)
      if (!position) return item
      return {
        ...item,
        x: position.x,
        y: position.y,
        width: Math.max(presentation ? 204 : 190, Math.min(presentation ? 236 : 232, item.width)),
        height: Math.max(presentation ? 94 : 86, Math.min(presentation ? 108 : 104, item.height)),
      }
    }),
  }
}

function enrichArchitectureBox<T extends CanvasNode | CanvasNote>(item: T): T {
  const inferredStencil = item.stencil ?? inferStencil(item.text, item.subtitle)
  const inferredIcon = item.icon ?? iconForStencil(inferredStencil) ?? inferIcon(item.text, item.subtitle)
  return {
    ...item,
    ...(inferredStencil ? { stencil: inferredStencil } : {}),
    ...(inferredIcon ? { icon: inferredIcon } : {}),
  }
}

function classifyArchitectureBox(item: CanvasNode | CanvasNote): ArchitecturePartition {
  const semanticText = `${item.text} ${item.subtitle ?? ''}`.toLowerCase()
  if (item.icon === 'user' || item.icon === 'external') return 'external'
  if ((item.icon === 'auth' || item.icon === 'ai' || item.icon === 'mcp') && /\b(provider|third[- ]party|external|vendor)\b|第三方|外部供应商|外部服务/.test(semanticText)) return 'external'
  if (item.icon === 'web') return 'experience'
  if (item.icon === 'queue' || item.icon === 'worker' || item.icon === 'scheduler') return 'processing'
  if (item.icon === 'database' || item.icon === 'cache' || item.icon === 'file' || item.icon === 'search' || item.icon === 'vector') return 'data'
  if (item.icon === 'api' || item.icon === 'gateway' || item.icon === 'service' || item.icon === 'cloud' || item.icon === 'auth' || item.icon === 'ai' || item.icon === 'mcp') return 'application'
  if (item.stencil === 'react' || item.stencil === 'vue') return 'experience'
  if (item.stencil === 'kafka' || item.stencil === 'rabbitmq') return 'processing'
  if (['postgres', 'mysql', 'redis', 'qdrant', 'opensearch', 'elasticsearch', 'mongodb', 'minio'].includes(item.stencil ?? '')) return 'data'
  return 'application'
}

function inferStencil(text: string, subtitle?: string): CanvasStencil | undefined {
  const value = `${text} ${subtitle ?? ''}`.toLowerCase()
  const entries: Array<[CanvasStencil, RegExp]> = [
    ['spring', /\bspring(?:\s*boot)?\b/],
    ['react', /\breact\b/],
    ['vue', /\bvue(?:\.js)?\b/],
    ['postgres', /\bpostgres(?:ql)?\b/],
    ['mysql', /\bmysql\b/],
    ['redis', /\bredis\b/],
    ['kafka', /\bkafka\b/],
    ['rabbitmq', /\brabbit\s*mq\b|\brabbitmq\b/],
    ['docker', /\bdocker\b/],
    ['kubernetes', /\bkubernetes\b|\bk8s\b/],
    ['qdrant', /\bqdrant\b/],
    ['opensearch', /\bopensearch\b/],
    ['elasticsearch', /\belasticsearch\b|\belastic\s+search\b/],
    ['mongodb', /\bmongo(?:db)?\b/],
    ['minio', /\bminio\b|\bs3\b/],
    ['nginx', /\bnginx\b/],
    ['grpc', /\bgrpc\b/],
    ['oidc', /\boidc\b|\bopenid\s+connect\b/],
    ['openai', /\bopenai\b|\bllm\b|\bembedding provider\b|大模型|模型服务/],
    ['mcp', /\bmcp\b|model context protocol/],
  ]
  return entries.find(([, pattern]) => pattern.test(value))?.[0]
}

function inferIcon(text: string, subtitle?: string): CanvasIcon | undefined {
  const value = `${text} ${subtitle ?? ''}`.toLowerCase()
  if (/\b(browser|frontend|front-end|web app|ui)\b|前端|浏览器/.test(value)) return 'web'
  if (/\b(gateway|reverse proxy|proxy)\b|网关|反向代理/.test(value)) return 'gateway'
  if (/\b(api|rest|graphql)\b|接口/.test(value)) return 'api'
  if (/\bmcp\b|model context protocol/.test(value)) return 'mcp'
  if (/\b(worker|processor|parser|indexer|sync worker|consumer)\b|任务|解析|索引|采集/.test(value)) return 'worker'
  if (/\b(scheduler|cron|schedule|timer)\b|调度|定时/.test(value)) return 'scheduler'
  if (/\b(agent|llm|model runtime|embedding provider|ai runtime)\b|大模型|智能体|模型服务/.test(value)) return 'ai'
  if (/\b(service|runtime|application)\b|服务/.test(value)) return 'service'
  if (/\b(cache)\b|缓存/.test(value)) return 'cache'
  if (/\b(queue|topic|broker|event bus|mq)\b|队列|消息/.test(value)) return 'queue'
  if (/\b(qdrant|vector db|vector store|vector index)\b|向量库|向量检索/.test(value)) return 'vector'
  if (/\b(opensearch|elasticsearch|search index|search engine)\b|搜索引擎|全文检索|搜索索引/.test(value)) return 'search'
  if (/\b(database|db|sql)\b|数据库/.test(value)) return 'database'
  if (/\b(file|blob|object storage|storage)\b|文件|对象存储/.test(value)) return 'file'
  if (/\b(user|person|client)\b|用户|员工/.test(value)) return 'user'
  if (/\b(auth|identity|oidc|oauth|sso)\b|认证|身份/.test(value)) return 'auth'
  if (/\b(provider|external|third[- ]party)\b|外部|第三方/.test(value)) return 'external'
  return undefined
}

function architectureNodeWeight(item: CanvasNode | CanvasNote): number {
  const iconWeight: Partial<Record<CanvasIcon, number>> = {
    gateway: 15,
    api: 14,
    service: 13,
    worker: 12,
    ai: 12,
    mcp: 11,
    auth: 10,
    web: 9,
    queue: 9,
    search: 9,
    vector: 9,
    database: 8,
    cache: 7,
    file: 6,
    user: 5,
    external: 4,
    scheduler: 6,
    cloud: 6,
  }
  const c4Weight = item.c4Type === 'software-system' ? 5 : item.c4Type === 'container' ? 4 : item.c4Type === 'component' ? 2 : 0
  return (item.icon ? iconWeight[item.icon] ?? 5 : 5) + c4Weight
}

function isArchitectureEntry(item: CanvasNode | CanvasNote): boolean {
  return item.icon === 'user'
    || item.icon === 'web'
    || item.icon === 'gateway'
    || item.icon === 'api'
    || item.icon === 'external'
    || item.icon === 'auth'
}

function directedArchitecturePath(
  startId: string,
  targetId: string,
  outgoing: Map<string, CanvasArrow[]>,
): { nodeIds: string[]; arrowIds: string[] } | undefined {
  const queue = [startId]
  const seen = new Set([startId])
  const previous = new Map<string, { nodeId: string; arrowId: string }>()
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (current === targetId) break
    for (const arrow of outgoing.get(current) ?? []) {
      if (seen.has(arrow.to)) continue
      seen.add(arrow.to)
      previous.set(arrow.to, { nodeId: current, arrowId: arrow.id })
      queue.push(arrow.to)
    }
  }
  if (!seen.has(targetId)) return undefined
  const nodeIds = [targetId]
  const arrowIds: string[] = []
  let current = targetId
  while (current !== startId) {
    const step = previous.get(current)
    if (!step) return undefined
    arrowIds.push(step.arrowId)
    current = step.nodeId
    nodeIds.push(current)
  }
  nodeIds.reverse()
  arrowIds.reverse()
  return { nodeIds, arrowIds }
}

function iconForStencil(stencil?: CanvasStencil): CanvasIcon | undefined {
  if (!stencil) return undefined
  if (stencil === 'react' || stencil === 'vue') return 'web'
  if (stencil === 'spring') return 'service'
  if (stencil === 'redis') return 'cache'
  if (stencil === 'kafka' || stencil === 'rabbitmq') return 'queue'
  if (stencil === 'qdrant') return 'vector'
  if (stencil === 'opensearch' || stencil === 'elasticsearch') return 'search'
  if (stencil === 'postgres' || stencil === 'mysql' || stencil === 'mongodb') return 'database'
  if (stencil === 'minio') return 'file'
  if (stencil === 'docker' || stencil === 'kubernetes') return 'cloud'
  if (stencil === 'nginx') return 'gateway'
  if (stencil === 'oidc') return 'auth'
  if (stencil === 'openai') return 'ai'
  if (stencil === 'mcp') return 'mcp'
  if (stencil === 'grpc') return 'api'
  return undefined
}

function partitionColumns(count: number): number {
  if (count <= 5) return 1
  if (count <= 11) return 2
  return 3
}

function architectureSortKey(item: CanvasNode | CanvasNote): number {
  if (item.icon === 'user' || item.icon === 'external') return 0
  if (item.icon === 'web') return 10
  if (item.icon === 'gateway' || item.icon === 'api' || item.icon === 'auth' || item.icon === 'mcp') return 20
  if (item.icon === 'service' || item.icon === 'ai') return 30
  if (item.icon === 'worker' || item.icon === 'scheduler' || item.icon === 'queue') return 40
  if (item.icon === 'cache') return 50
  if (item.icon === 'search' || item.icon === 'vector') return 60
  if (item.icon === 'database') return 70
  if (item.icon === 'file') return 80
  return 80
}

function partitionFromLaneId(laneId: string): ArchitecturePartition | undefined {
  return partitionOrder.find((partition) => laneId === `arch-${partition}`)
}

function dominantPartition(values: ArchitecturePartition[]): ArchitecturePartition | undefined {
  if (!values.length) return undefined
  const counts = new Map<ArchitecturePartition, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
}
