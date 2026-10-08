import type {
  CanvasArrow,
  CanvasElement,
  CanvasIcon,
  CanvasLane,
  CanvasNode,
  CanvasNote,
  CanvasScene,
  CanvasStencil,
  CanvasTone,
} from './canvas.js'

export type ArchitectureTheme = 'enterprise' | 'technical' | 'presentation'

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
    width = Math.max(1280, Math.ceil(lanes[lanes.length - 1].start + lanes[lanes.length - 1].size + 48))
    const maxRows = Math.max(1, ...activePartitions.map((partition) => Math.ceil((semanticBoxes.filter((item) => partitionById.get(item.id) === partition).length || 1) / partitionColumns(semanticBoxes.filter((item) => partitionById.get(item.id) === partition).length))))
    height = Math.max(820, 160 + maxRows * 138)
  }

  let next: CanvasScene = {
    ...scene,
    width,
    height,
    elements,
    ...(repartition ? { lanes } : {}),
  }

  if (relayout && repartition && lanes?.length) next = layoutArchitecturePartitions(next, partitionById, laneByPartition)
  next = applyArchitectureTheme(next, theme, partitionById)
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
    },
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

export function routeArchitectureEdges(scene: CanvasScene): CanvasScene {
  const boxes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const channelCounts = new Map<string, number>()
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const routed = new Map<string, CanvasArrow>()

  for (const arrow of arrows) {
    const from = boxes.get(arrow.from)
    const to = boxes.get(arrow.to)
    if (!from || !to) continue
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const dx = toCenter.x - fromCenter.x
    const dy = toCenter.y - fromCenter.y
    const horizontal = Math.abs(dx) >= Math.abs(dy) * 0.72
    const channelKey = horizontal
      ? `x:${from.laneId ?? 'none'}:${to.laneId ?? 'none'}`
      : `y:${from.laneId ?? 'none'}:${to.laneId ?? 'none'}`
    const channelIndex = channelCounts.get(channelKey) ?? 0
    channelCounts.set(channelKey, channelIndex + 1)
    const offset = ((channelIndex % 7) - 3) * 12
    const asyncEdge = from.icon === 'queue' || to.icon === 'queue' || from.stencil === 'kafka' || to.stencil === 'kafka'

    if (horizontal) {
      const forward = dx >= 0
      const startX = forward ? from.x + from.width : from.x
      const endX = forward ? to.x : to.x + to.width
      const trunkX = (startX + endX) / 2 + offset
      routed.set(arrow.id, {
        ...arrow,
        routing: 'orthogonal',
        fromAnchor: forward ? 'right' : 'left',
        toAnchor: forward ? 'left' : 'right',
        lineStyle: asyncEdge ? 'dashed' : arrow.lineStyle ?? 'solid',
        points: Math.abs(endX - startX) > 72
          ? [{ x: trunkX, y: fromCenter.y }, { x: trunkX, y: toCenter.y }]
          : undefined,
      })
    } else {
      const forward = dy >= 0
      const startY = forward ? from.y + from.height : from.y
      const endY = forward ? to.y : to.y + to.height
      const trunkY = (startY + endY) / 2 + offset
      routed.set(arrow.id, {
        ...arrow,
        routing: 'orthogonal',
        fromAnchor: forward ? 'bottom' : 'top',
        toAnchor: forward ? 'top' : 'bottom',
        lineStyle: asyncEdge ? 'dashed' : arrow.lineStyle ?? 'solid',
        points: Math.abs(endY - startY) > 64
          ? [{ x: fromCenter.x, y: trunkY }, { x: toCenter.x, y: trunkY }]
          : undefined,
      })
    }
  }

  return {
    ...scene,
    elements: scene.elements.map((item) => item.type === 'arrow' ? routed.get(item.id) ?? item : item),
  }
}

function buildArchitectureLanes(
  boxes: Array<CanvasNode | CanvasNote>,
  partitions: Map<string, ArchitecturePartition>,
  active: ArchitecturePartition[],
  theme: ArchitectureTheme,
): CanvasLane[] {
  let start = 36
  return active.map((partition) => {
    const count = boxes.filter((item) => partitions.get(item.id) === partition).length
    const columns = partitionColumns(count)
    const size = 72 + columns * 252
    const lane: CanvasLane = {
      id: `arch-${partition}`,
      label: partitionMeta[partition].label,
      axis: 'vertical',
      start,
      size,
      tone: themeTones[theme][partition],
    }
    start += size + 24
    return lane
  })
}

function layoutArchitecturePartitions(
  scene: CanvasScene,
  partitions: Map<string, ArchitecturePartition>,
  laneByPartition: Map<ArchitecturePartition, CanvasLane>,
): CanvasScene {
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
          x: lane.start + 34 + col * 252,
          y: 92 + row * 132,
        })
      })
  }
  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || item.locked) return item
      const position = positionById.get(item.id)
      if (!position) return item
      return { ...item, x: position.x, y: position.y, width: Math.max(190, Math.min(232, item.width)), height: Math.max(86, Math.min(104, item.height)) }
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
  if (item.icon === 'user' || item.icon === 'external') return 'external'
  if (item.icon === 'web') return 'experience'
  if (item.icon === 'queue') return 'processing'
  if (item.icon === 'database' || item.icon === 'cache' || item.icon === 'file') return 'data'
  if (item.icon === 'api' || item.icon === 'service' || item.icon === 'cloud') return 'application'
  if (item.stencil === 'react' || item.stencil === 'vue') return 'experience'
  if (item.stencil === 'kafka') return 'processing'
  if (['postgres', 'mysql', 'redis', 'qdrant', 'opensearch', 'minio'].includes(item.stencil ?? '')) return 'data'
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
    ['docker', /\bdocker\b/],
    ['kubernetes', /\bkubernetes\b|\bk8s\b/],
    ['qdrant', /\bqdrant\b/],
    ['opensearch', /\bopensearch\b/],
    ['minio', /\bminio\b|\bs3\b/],
  ]
  return entries.find(([, pattern]) => pattern.test(value))?.[0]
}

function inferIcon(text: string, subtitle?: string): CanvasIcon | undefined {
  const value = `${text} ${subtitle ?? ''}`.toLowerCase()
  if (/\b(browser|frontend|front-end|web app|ui)\b|前端|浏览器/.test(value)) return 'web'
  if (/\b(api|gateway|rest|graphql|mcp server)\b|接口|网关/.test(value)) return 'api'
  if (/\b(worker|service|runtime|agent|processor|parser|indexer|sync)\b|服务|任务|解析|索引/.test(value)) return 'service'
  if (/\b(cache)\b|缓存/.test(value)) return 'cache'
  if (/\b(queue|topic|broker|event bus|mq)\b|队列|消息/.test(value)) return 'queue'
  if (/\b(database|db|sql|vector store|search index)\b|数据库|向量|检索/.test(value)) return 'database'
  if (/\b(file|blob|object storage|storage)\b|文件|对象存储/.test(value)) return 'file'
  if (/\b(user|person|client)\b|用户|员工/.test(value)) return 'user'
  if (/\b(provider|external|third[- ]party|oidc)\b|外部|第三方/.test(value)) return 'external'
  return undefined
}

function iconForStencil(stencil?: CanvasStencil): CanvasIcon | undefined {
  if (!stencil) return undefined
  if (stencil === 'react' || stencil === 'vue') return 'web'
  if (stencil === 'spring') return 'service'
  if (stencil === 'redis') return 'cache'
  if (stencil === 'kafka') return 'queue'
  if (stencil === 'postgres' || stencil === 'mysql' || stencil === 'qdrant' || stencil === 'opensearch') return 'database'
  if (stencil === 'minio') return 'file'
  if (stencil === 'docker' || stencil === 'kubernetes') return 'cloud'
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
  if (item.icon === 'api') return 20
  if (item.icon === 'service') return 30
  if (item.icon === 'queue') return 40
  if (item.icon === 'cache') return 50
  if (item.icon === 'database') return 60
  if (item.icon === 'file') return 70
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
