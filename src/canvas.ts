export type CanvasElement = CanvasNode | CanvasNote | CanvasArrow
export type CanvasTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
export type CanvasShape = 'rounded' | 'square' | 'pill'
export type CanvasLineStyle = 'solid' | 'dashed'
export type CanvasEmphasis = 'primary' | 'secondary' | 'muted'
export type CanvasRouting = 'straight' | 'orthogonal'
export type CanvasAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left'
export type CanvasArchitectureTheme = 'enterprise' | 'technical' | 'presentation'
export type CanvasArchitectureView = 'overview' | 'detail'
export type CanvasArchitectureDensity = 'auto' | 'comfortable' | 'compact' | 'dense'
export type CanvasArchitectureCardKind = 'actor' | 'entry' | 'compute' | 'messaging' | 'data' | 'external' | 'generic'
export type CanvasArchitectureScopeKind = 'group' | 'lane' | 'node'
export type CanvasIcon = 'user' | 'web' | 'api' | 'gateway' | 'service' | 'worker' | 'database' | 'cache' | 'queue' | 'search' | 'vector' | 'cloud' | 'file' | 'auth' | 'ai' | 'mcp' | 'scheduler' | 'external'
export type CanvasStencil = 'spring' | 'react' | 'vue' | 'postgres' | 'mysql' | 'redis' | 'kafka' | 'rabbitmq' | 'docker' | 'kubernetes' | 'qdrant' | 'opensearch' | 'elasticsearch' | 'mongodb' | 'minio' | 'nginx' | 'grpc' | 'oidc' | 'openai' | 'mcp'
export type CanvasGroupKind = 'group' | 'boundary'
export type CanvasLaneAxis = 'horizontal' | 'vertical'
export type CanvasC4Type = 'person' | 'software-system' | 'container' | 'component'
export interface CanvasPoint { x: number; y: number }

export interface CanvasGroup {
  id: string
  label?: string
  tone?: CanvasTone
  kind?: CanvasGroupKind
  collapsed?: boolean
  parentId?: string
  c4Type?: 'software-system' | 'container'
  description?: string
}

export interface CanvasLane {
  id: string
  label: string
  axis: CanvasLaneAxis
  start: number
  size: number
  tone?: CanvasTone
}

export interface CanvasScene {
  type: 'codex-diagram-canvas'
  version: 1
  title: string
  width: number
  height: number
  elements: CanvasElement[]
  groups?: CanvasGroup[]
  lanes?: CanvasLane[]
  architecture?: {
    theme: CanvasArchitectureTheme
    presentation?: boolean
    view?: CanvasArchitectureView
    density?: CanvasArchitectureDensity
  }
}

export interface CanvasNode {
  id: string
  type: 'node'
  x: number
  y: number
  width: number
  height: number
  text: string
  tone?: CanvasTone
  shape?: CanvasShape
  locked?: boolean
  groupId?: string
  sourcePaths?: string[]
  icon?: CanvasIcon
  stencil?: CanvasStencil
  subtitle?: string
  description?: string
  tags?: string[]
  laneId?: string
  c4Type?: CanvasC4Type
  emphasis?: CanvasEmphasis
}

export interface CanvasNote {
  id: string
  type: 'note'
  x: number
  y: number
  width: number
  height: number
  text: string
  tone?: CanvasTone
  shape?: CanvasShape
  locked?: boolean
  groupId?: string
  sourcePaths?: string[]
  icon?: CanvasIcon
  stencil?: CanvasStencil
  subtitle?: string
  description?: string
  tags?: string[]
  laneId?: string
  c4Type?: CanvasC4Type
  emphasis?: CanvasEmphasis
}

export interface CanvasArrow {
  id: string
  type: 'arrow'
  from: string
  to: string
  label?: string
  lineStyle?: CanvasLineStyle
  routing?: CanvasRouting
  fromAnchor?: CanvasAnchor
  toAnchor?: CanvasAnchor
  points?: CanvasPoint[]
  labelPosition?: CanvasPoint
  emphasis?: CanvasEmphasis
  bundleKey?: string
}

export interface CanvasGroupFrame extends CanvasGroup {
  x: number
  y: number
  width: number
  height: number
  memberIds: string[]
}

export interface CanvasCollapsedConnection {
  id: string
  fromKey: string
  toKey: string
  fromBox: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>
  toBox: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>
  count: number
  labels: string[]
  lineStyle?: CanvasLineStyle
  routing?: CanvasRouting
  fromAnchor?: CanvasAnchor
  toAnchor?: CanvasAnchor
}

export interface CanvasBundleTrunk {
  id: string
  path: string
  emphasis?: CanvasEmphasis
  count: number
}

export interface CanvasArrowLabelLayout {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasArchitectureHeader {
  height: number
  eyebrow: string
  title: string
  subtitle: string
  legend: Array<{ kind: 'primary' | 'secondary' | 'async'; label: string }>
}

export interface CanvasArchitectureProjection {
  scene: CanvasScene
  view: CanvasArchitectureView
  density: Exclude<CanvasArchitectureDensity, 'auto'>
  hiddenNodes: number
  hiddenArrows: number
}

export interface CanvasArchitectureScope {
  kind: CanvasArchitectureScopeKind
  id: string
  depth?: number
}

export interface CanvasArchitectureBreadcrumb {
  kind: CanvasArchitectureScopeKind
  id: string
  label: string
}

export interface CanvasArchitectureScopeProjection {
  scene: CanvasScene
  scope: CanvasArchitectureScope
  breadcrumbs: CanvasArchitectureBreadcrumb[]
  hiddenNodes: number
  hiddenArrows: number
}

export interface CanvasArchitectureCardTemplate {
  kind: CanvasArchitectureCardKind
  label: string
}

export function createCanvasSource(title: string): string {
  return serializeCanvasScene({
    type: 'codex-diagram-canvas',
    version: 1,
    title: title.trim() || 'Canvas',
    width: 1600,
    height: 1000,
    elements: [
      { id: 'node-start', type: 'node', x: 180, y: 180, width: 220, height: 96, text: title.trim() || '核心模块' },
      { id: 'node-next', type: 'node', x: 560, y: 330, width: 220, height: 96, text: '双击文字编辑' },
      { id: 'arrow-start-next', type: 'arrow', from: 'node-start', to: 'node-next' },
    ],
  })
}

export function parseCanvasScene(source: string): CanvasScene {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('自由画布 JSON 格式无效。')
  }
  if (!value || typeof value !== 'object') throw new Error('自由画布内容无效。')
  const scene = value as Partial<CanvasScene>
  if (scene.type !== 'codex-diagram-canvas' || scene.version !== 1 || !Array.isArray(scene.elements)) {
    throw new Error('不是受支持的 Codex Diagram Canvas 文档。')
  }
  const architecture = normalizeArchitectureAppearance(scene.architecture)
  return {
    type: 'codex-diagram-canvas',
    version: 1,
    title: typeof scene.title === 'string' ? scene.title : 'Canvas',
    width: positive(scene.width, 1600),
    height: positive(scene.height, 1000),
    elements: scene.elements.filter(isCanvasElement).map(normalizeCanvasElement),
    ...(Array.isArray(scene.groups) ? { groups: normalizeCanvasGroups(scene.groups) } : {}),
    ...(Array.isArray(scene.lanes) ? { lanes: normalizeCanvasLanes(scene.lanes, positive(scene.width, 1600), positive(scene.height, 1000)) } : {}),
    ...(architecture ? { architecture } : {}),
  }
}

export function serializeCanvasScene(scene: CanvasScene): string {
  return `${JSON.stringify(scene, null, 2)}\n`
}

export function canvasSceneToSvg(scene: CanvasScene, colors?: { background?: string; panel?: string; text?: string; border?: string; note?: string }): string {
  const sourceScene = scene
  const projection = canvasArchitectureProjection(scene)
  scene = projection.scene
  const background = colors?.background || '#ffffff'
  const panel = colors?.panel || '#f8f8f8'
  const text = colors?.text || '#171717'
  const border = colors?.border || '#8a8a8a'
  const note = colors?.note || '#fff7cc'
  const allNodes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const groupFrames = canvasGroupFrames(scene)
  const collapsedOwners = canvasCollapsedOwners(scene)
  const nodes = new Map([...allNodes.values()].filter((item) => !collapsedOwners.has(item.id)).map((item) => [item.id, item]))
  const labelLayouts = canvasArrowLabelLayouts(scene)
  const architectureHeader = canvasArchitectureHeader(sourceScene)
  const bundleTrunks = canvasBundleTrunks(scene).map((bundle) => {
    const opacity = bundle.emphasis === 'primary' ? '0.24' : bundle.emphasis === 'muted' ? '0.10' : '0.16'
    const width = bundle.emphasis === 'primary' ? 7 : 5.5
    return `<path d="${bundle.path}" fill="none" stroke="${escapeXml(border)}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`
  }).join('')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow').map((arrow) => {
    const from = nodes.get(arrow.from)
    const to = nodes.get(arrow.to)
    if (!from || !to) return ''
    const fromCenter = centerOfCanvasBox(from)
    const toCenter = centerOfCanvasBox(to)
    const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
    const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
    const dash = arrow.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : ''
    const geometry = canvasArrowPath(start, end, arrow)
    const strokeWidth = arrow.emphasis === 'primary' ? 3.2 : arrow.emphasis === 'muted' ? 1.35 : 2
    const opacity = arrow.emphasis === 'muted' ? '0.48' : arrow.emphasis === 'secondary' ? '0.78' : '1'
    const label = arrow.label ? labelLayouts.get(arrow.id) : undefined
    const labelMarkup = arrow.label && label
      ? `<g><rect x="${label.x - label.width / 2}" y="${label.y - label.height / 2}" width="${label.width}" height="${label.height}" rx="${label.height / 2}" fill="${escapeXml(background)}" stroke="${escapeXml(border)}" stroke-opacity="0.28"/><text x="${label.x}" y="${label.y + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${escapeXml(text)}">${escapeXml(truncateCanvasText(arrow.label, 30))}</text></g>`
      : ''
    return `<g opacity="${opacity}"><path d="${geometry}" fill="none" stroke="${escapeXml(border)}" stroke-width="${strokeWidth}"${dash} marker-end="url(#arrow)"/>${labelMarkup}</g>`
  }).join('')
  const collapsedConnections = canvasCollapsedConnections(scene, groupFrames).map((connection) => {
    const fromCenter = centerOfCanvasBox(connection.fromBox)
    const toCenter = centerOfCanvasBox(connection.toBox)
    const start = anchorPoint(connection.fromBox, connection.fromAnchor, toCenter)
    const end = anchorPoint(connection.toBox, connection.toAnchor, fromCenter)
    const geometry = canvasArrowPath(start, end, connection)
    const dash = connection.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : ''
    const label = connection.labels.length ? connection.labels.slice(0, 2).join(' · ') : ''
    const suffix = connection.count > 1 ? ` ×${connection.count}` : ''
    return `<g><path d="${geometry}" fill="none" stroke="${escapeXml(border)}" stroke-width="2.2"${dash} marker-end="url(#arrow)"/>${label || suffix ? `<text x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2 - 8}" text-anchor="middle" font-size="13" fill="${escapeXml(text)}">${escapeXml(`${label}${suffix}`)}</text>` : ''}</g>`
  }).join('')
  const shapes = [...nodes.values()].map((item) => {
    const palette = canvasTonePalette(item.tone, { panel, text, border, note }, item.type)
    const architectureCard = item.type === 'node' && Boolean(item.icon || item.stencil || item.c4Type)
    const cardTemplate = canvasArchitectureCardTemplate(item)
    const showSubtitle = Boolean(item.subtitle && (!architectureCard || projection.density !== 'dense'))
    const cardTitleLimit = projection.density === 'dense' ? 22 : projection.density === 'compact' ? 26 : 30
    const lines = item.text.split('\n').slice(0, 6)
    const texts = architectureCard
      ? `<text x="${item.x + 16}" y="${item.y + (showSubtitle ? 55 : Math.max(54, item.height / 2 + 5))}" font-size="15" font-weight="650" fill="${escapeXml(palette.text)}">${escapeXml(truncateCanvasText(lines.join(' '), cardTitleLimit))}</text>`
      : lines.map((line, index) => `<text x="${item.x + item.width / 2}" y="${item.y + item.height / 2 + (index - (lines.length - 1) / 2) * 19}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${escapeXml(palette.text)}">${escapeXml(line)}</text>`).join('')
    const rolePaths = item.icon ? canvasIconPaths(item.icon) : []
    const icon = rolePaths.length ? `<g transform="translate(${item.x + 8} ${item.y + 8})"><circle cx="10" cy="10" r="10" fill="${escapeXml(palette.stroke)}" fill-opacity="0.10" stroke="${escapeXml(palette.stroke)}" stroke-opacity="0.38"/><g transform="translate(3 3) scale(.5833)" fill="none" stroke="${escapeXml(palette.stroke)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${rolePaths.map((d) => `<path d="${d}"/>`).join('')}</g></g>` : ''
    const cardMeta = item.stencil ? canvasStencilLabel(item.stencil) : architectureCard ? cardTemplate.label : item.icon ? canvasIconLabel(item.icon) : ''
    const stencil = cardMeta ? `<text x="${item.x + (item.icon ? 34 : 14)}" y="${item.y + 21}" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-weight="700" letter-spacing="0.3" fill="${escapeXml(palette.stroke)}">${escapeXml(cardMeta)}</text>` : ''
    const c4 = item.c4Type ? `<text x="${item.x + item.width - 12}" y="${item.y + 20}" text-anchor="end" font-size="10" font-weight="600" fill="${escapeXml(palette.stroke)}">${escapeXml(c4Label(item.c4Type))}</text>` : ''
    const subtitle = showSubtitle ? `<text x="${architectureCard ? item.x + 16 : item.x + item.width / 2}" y="${item.y + item.height - 16}"${architectureCard ? '' : ' text-anchor="middle"'} font-size="11" fill="${escapeXml(palette.stroke)}">${escapeXml(truncateCanvasText(item.subtitle!, 34))}</text>` : ''
    const strokeWidth = item.emphasis === 'primary' ? 2.4 : item.emphasis === 'muted' ? 1.1 : 1.5
    const opacity = item.emphasis === 'muted' ? '0.72' : '1'
    const accent = item.emphasis === 'primary' ? `<rect x="${item.x}" y="${item.y}" width="5" height="${item.height}" rx="${Math.min(5, shapeRadius(item.shape, item.height))}" fill="${escapeXml(palette.stroke)}"/>` : ''
    const cardBand = architectureCard ? `<rect x="${item.x + 12}" y="${item.y + item.height - 4}" width="${Math.max(24, item.width - 24)}" height="2" rx="1" fill="${escapeXml(architectureCardBandColor(cardTemplate.kind, palette.stroke, border))}" fill-opacity="0.72"/>` : ''
    const dash = cardTemplate.kind === 'external' || cardTemplate.kind === 'messaging' ? ' stroke-dasharray="7 5"' : ''
    return `<g opacity="${opacity}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${shapeRadius(item.shape, item.height)}" fill="${escapeXml(palette.fill)}" stroke="${escapeXml(palette.stroke)}" stroke-width="${strokeWidth}"${architectureCard ? dash : ''}/>${accent}${cardBand}${icon}${stencil}${c4}${texts}${subtitle}</g>`
  }).join('')
  const groups = groupFrames.filter((group) => !isInsideCollapsedAncestor(group.id, scene.groups ?? [])).map((group) => {
    const palette = canvasTonePalette(group.tone, { panel, text, border, note }, 'node')
    const softwareSystem = group.c4Type === 'software-system'
    const container = group.c4Type === 'container'
    const dash = softwareSystem ? '' : container ? '10 6' : group.kind === 'boundary' ? '12 6' : '8 6'
    const strokeWidth = softwareSystem ? 2.4 : container ? 1.7 : 1.4
    const fillOpacity = group.collapsed ? '0.5' : softwareSystem ? '0.10' : container ? '0.05' : '0'
    const c4 = group.c4Type ? ` · ${c4Label(group.c4Type)}` : ''
    const collapsed = group.collapsed ? ' · collapsed' : ''
    const fill = group.collapsed || softwareSystem || container ? escapeXml(palette.fill) : 'none'
    const header = group.label && softwareSystem
      ? `<rect x="${group.x}" y="${group.y}" width="${group.width}" height="34" rx="18" fill="${escapeXml(palette.fill)}" fill-opacity="0.62"/>`
      : ''
    return `<g><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="18" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${escapeXml(palette.stroke)}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${header}${group.label ? `<text x="${group.x + 14}" y="${group.y + 22}" font-size="${softwareSystem ? 13 : 12}" font-weight="${softwareSystem ? 760 : 650}" fill="${escapeXml(palette.text)}">${escapeXml(`${group.label}${c4}${collapsed}`)}</text>` : ''}</g>`
  }).join('')
  const lanes = (scene.lanes ?? []).map((lane) => {
    const palette = canvasTonePalette(lane.tone ?? 'muted', { panel, text, border, note }, 'node')
    const x = lane.axis === 'vertical' ? lane.start : 0
    const y = lane.axis === 'horizontal' ? lane.start : architectureHeader?.height ?? 0
    const width = lane.axis === 'vertical' ? lane.size : scene.width
    const height = lane.axis === 'horizontal' ? lane.size : scene.height - (architectureHeader?.height ?? 0)
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${escapeXml(palette.fill)}" fill-opacity="0.42" stroke="${escapeXml(palette.stroke)}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 6"/><rect x="${x}" y="${y}" width="${width}" height="34" rx="14" fill="${escapeXml(palette.fill)}" fill-opacity="0.86"/><text x="${x + 14}" y="${y + 22}" font-size="12" font-weight="700" fill="${escapeXml(palette.text)}">${escapeXml(lane.label)}</text></g>`
  }).join('')
  const header = architectureHeader ? architectureHeaderToSvg(scene, architectureHeader, { background, text, border }) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${escapeXml(border)}"/></marker></defs><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${header}${lanes}${groups}${bundleTrunks}${arrows}${collapsedConnections}${shapes}</svg>`
}

export function canvasBundleTrunks(scene: CanvasScene): CanvasBundleTrunk[] {
  const boxes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const groups = new Map<string, CanvasArrow[]>()
  scene.elements.forEach((item) => {
    if (item.type !== 'arrow' || !item.bundleKey) return
    groups.set(item.bundleKey, [...(groups.get(item.bundleKey) ?? []), item])
  })
  const result: CanvasBundleTrunk[] = []
  for (const [bundleKey, arrows] of groups) {
    if (arrows.length < 2) continue
    if (bundleKey.startsWith('from:')) {
      const clusters = new Map<string, CanvasArrow[]>()
      arrows.forEach((arrow) => {
        const point = arrow.points?.[0]
        if (!point) return
        const key = `${arrow.fromAnchor ?? 'auto'}:${Math.round(point.x)}:${Math.round(point.y)}`
        clusters.set(key, [...(clusters.get(key) ?? []), arrow])
      })
      for (const [clusterKey, members] of clusters) {
        if (members.length < 2) continue
        const first = members[0]
        const box = boxes.get(first.from)
        const end = first.points?.[0]
        if (!box || !end) continue
        const start = anchorPoint(box, first.fromAnchor, end)
        result.push({ id: `${bundleKey}:${clusterKey}`, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, emphasis: strongestEmphasis(members), count: members.length })
      }
    } else if (bundleKey.startsWith('to:')) {
      const clusters = new Map<string, CanvasArrow[]>()
      arrows.forEach((arrow) => {
        const point = arrow.points?.at(-1)
        if (!point) return
        const key = `${arrow.toAnchor ?? 'auto'}:${Math.round(point.x)}:${Math.round(point.y)}`
        clusters.set(key, [...(clusters.get(key) ?? []), arrow])
      })
      for (const [clusterKey, members] of clusters) {
        if (members.length < 2) continue
        const first = members[0]
        const box = boxes.get(first.to)
        const start = first.points?.at(-1)
        if (!box || !start) continue
        const end = anchorPoint(box, first.toAnchor, start)
        result.push({ id: `${bundleKey}:${clusterKey}`, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, emphasis: strongestEmphasis(members), count: members.length })
      }
    }
  }
  return result
}

export function canvasArchitectureProjection(scene: CanvasScene): CanvasArchitectureProjection {
  const view = scene.architecture?.view ?? 'detail'
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const boxById = new Map(boxes.map((item) => [item.id, item]))
  const density = resolveCanvasArchitectureDensity(scene, boxes.length)
  if (view === 'detail' || boxes.length <= overviewNodeLimit(density)) {
    return { scene, view, density, hiddenNodes: 0, hiddenArrows: 0 }
  }

  const degree = new Map<string, number>(boxes.map((item) => [item.id, 0]))
  arrows.forEach((arrow) => {
    degree.set(arrow.from, (degree.get(arrow.from) ?? 0) + 1)
    degree.set(arrow.to, (degree.get(arrow.to) ?? 0) + 1)
  })
  const visible = new Set<string>()
  boxes.forEach((item) => {
    if (item.emphasis === 'primary') visible.add(item.id)
  })
  arrows.forEach((arrow) => {
    if (arrow.emphasis !== 'primary') return
    visible.add(arrow.from)
    visible.add(arrow.to)
  })

  // Keep at least one representative for every architecture lane and group so
  // overview mode still communicates the full system shape rather than only a path.
  const buckets = new Map<string, Array<CanvasNode | CanvasNote>>()
  boxes.forEach((item) => {
    const key = item.laneId ? `lane:${item.laneId}` : item.groupId ? `group:${item.groupId}` : 'ungrouped'
    buckets.set(key, [...(buckets.get(key) ?? []), item])
  })
  buckets.forEach((members) => {
    const representative = members.slice().sort((left, right) => architectureOverviewScore(right, degree) - architectureOverviewScore(left, degree))[0]
    if (representative) visible.add(representative.id)
  })

  const limit = Math.max(visible.size, overviewNodeLimit(density))
  boxes
    .filter((item) => !visible.has(item.id))
    .sort((left, right) => architectureOverviewScore(right, degree) - architectureOverviewScore(left, degree) || left.x - right.x || left.y - right.y)
    .slice(0, Math.max(0, limit - visible.size))
    .forEach((item) => visible.add(item.id))

  const visibleArrows = arrows.filter((arrow) => {
    if (!visible.has(arrow.from) || !visible.has(arrow.to)) return false
    if (arrow.emphasis !== 'muted') return true
    return boxById.get(arrow.from)?.emphasis === 'primary' || boxById.get(arrow.to)?.emphasis === 'primary'
  })
  const visibleArrowIds = new Set(visibleArrows.map((arrow) => arrow.id))
  const elements = scene.elements.filter((item) => item.type === 'arrow' ? visibleArrowIds.has(item.id) : visible.has(item.id))
  return {
    scene: { ...scene, elements },
    view,
    density,
    hiddenNodes: boxes.length - visible.size,
    hiddenArrows: arrows.length - visibleArrows.length,
  }
}

export function canvasArchitectureScopeProjection(scene: CanvasScene, scope: CanvasArchitectureScope): CanvasArchitectureScopeProjection {
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const boxById = new Map(boxes.map((item) => [item.id, item]))
  const groupById = new Map((scene.groups ?? []).map((group) => [group.id, group]))
  const visible = new Set<string>()
  const breadcrumbs: CanvasArchitectureBreadcrumb[] = []

  if (scope.kind === 'group') {
    const target = groupById.get(scope.id)
    if (!target) return { scene, scope, breadcrumbs, hiddenNodes: 0, hiddenArrows: 0 }
    for (const entry of architectureGroupBreadcrumbs(target.id, groupById)) breadcrumbs.push(entry)
    boxes.forEach((item) => {
      if (item.groupId && groupContains(target.id, item.groupId, groupById)) visible.add(item.id)
    })
  } else if (scope.kind === 'lane') {
    const lane = scene.lanes?.find((item) => item.id === scope.id)
    if (!lane) return { scene, scope, breadcrumbs, hiddenNodes: 0, hiddenArrows: 0 }
    breadcrumbs.push({ kind: 'lane', id: lane.id, label: lane.label })
    boxes.forEach((item) => {
      if (item.laneId === lane.id) visible.add(item.id)
    })
  } else {
    const target = boxById.get(scope.id)
    if (!target) return { scene, scope, breadcrumbs, hiddenNodes: 0, hiddenArrows: 0 }
    if (target.groupId) breadcrumbs.push(...architectureGroupBreadcrumbs(target.groupId, groupById))
    breadcrumbs.push({ kind: 'node', id: target.id, label: target.text })
    const depth = Math.max(1, Math.min(3, scope.depth ?? 1))
    const adjacency = new Map<string, Set<string>>()
    boxes.forEach((item) => adjacency.set(item.id, new Set()))
    arrows.forEach((arrow) => {
      adjacency.get(arrow.from)?.add(arrow.to)
      adjacency.get(arrow.to)?.add(arrow.from)
    })
    let frontier = new Set([target.id])
    visible.add(target.id)
    for (let level = 0; level < depth; level += 1) {
      const next = new Set<string>()
      frontier.forEach((id) => adjacency.get(id)?.forEach((neighbor) => {
        if (visible.has(neighbor)) return
        visible.add(neighbor)
        next.add(neighbor)
      }))
      frontier = next
    }
  }

  // Region focus keeps one-hop boundary dependencies so a local view does not
  // lose the contracts entering or leaving the selected subsystem.
  if (scope.kind !== 'node') {
    arrows.forEach((arrow) => {
      const fromVisible = visible.has(arrow.from)
      const toVisible = visible.has(arrow.to)
      if (fromVisible !== toVisible) visible.add(fromVisible ? arrow.to : arrow.from)
    })
  }

  const density = resolveCanvasArchitectureDensity(scene, boxes.length)
  const focusLimit = density === 'dense' ? 56 : density === 'compact' ? 48 : 42
  const hasImmediateChildGroups = scope.kind === 'group' && (scene.groups ?? []).some((group) => group.parentId === scope.id)
  if (visible.size > focusLimit && !hasImmediateChildGroups) {
    const degree = new Map<string, number>(boxes.map((item) => [item.id, 0]))
    arrows.forEach((arrow) => {
      degree.set(arrow.from, (degree.get(arrow.from) ?? 0) + 1)
      degree.set(arrow.to, (degree.get(arrow.to) ?? 0) + 1)
    })
    const mustKeep = new Set<string>()
    if (scope.kind === 'node') mustKeep.add(scope.id)
    boxes.forEach((item) => {
      if (!visible.has(item.id)) return
      if (item.emphasis === 'primary') mustKeep.add(item.id)
    })
    const laneBuckets = new Map<string, Array<CanvasNode | CanvasNote>>()
    boxes.forEach((item) => {
      if (!visible.has(item.id) || !item.laneId) return
      laneBuckets.set(item.laneId, [...(laneBuckets.get(item.laneId) ?? []), item])
    })
    laneBuckets.forEach((members) => {
      const representative = members.slice().sort((left, right) => architectureOverviewScore(right, degree) - architectureOverviewScore(left, degree))[0]
      if (representative) mustKeep.add(representative.id)
    })
    const trimmed = new Set(mustKeep)
    boxes
      .filter((item) => visible.has(item.id) && !trimmed.has(item.id))
      .sort((left, right) => architectureOverviewScore(right, degree) - architectureOverviewScore(left, degree))
      .slice(0, Math.max(0, focusLimit - trimmed.size))
      .forEach((item) => trimmed.add(item.id))
    visible.clear()
    trimmed.forEach((id) => visible.add(id))
  }

  const visibleArrows = arrows.filter((arrow) => visible.has(arrow.from) && visible.has(arrow.to))
  const visibleArrowIds = new Set(visibleArrows.map((arrow) => arrow.id))
  const scopedGroups = (scene.groups ?? []).map((group) => {
    if (scope.kind !== 'group') return group
    if (group.id === scope.id || architectureGroupBreadcrumbs(scope.id, groupById).some((entry) => entry.id === group.id)) {
      return group.collapsed ? { ...group, collapsed: undefined } : group
    }
    // Immediate C4/domain children become navigable summaries. Their members
    // remain in the projection so existing collapsed-edge aggregation works.
    if (group.parentId === scope.id) return { ...group, collapsed: true }
    return group
  })
  const usedLaneIds = new Set(boxes.filter((item) => visible.has(item.id) && item.laneId).map((item) => item.laneId as string))
  const elements = scene.elements.filter((item) => item.type === 'arrow' ? visibleArrowIds.has(item.id) : visible.has(item.id))
  return {
    scene: {
      ...scene,
      elements,
      groups: scopedGroups,
      ...(scene.lanes ? { lanes: scene.lanes.filter((lane) => usedLaneIds.has(lane.id) || scope.kind === 'lane' && lane.id === scope.id) } : {}),
    },
    scope,
    breadcrumbs,
    hiddenNodes: boxes.length - visible.size,
    hiddenArrows: arrows.length - visibleArrows.length,
  }
}

export function resolveCanvasArchitectureDensity(
  scene: CanvasScene,
  nodeCount = scene.elements.filter((item) => item.type !== 'arrow').length,
): Exclude<CanvasArchitectureDensity, 'auto'> {
  const requested = scene.architecture?.density ?? 'auto'
  if (requested !== 'auto') return requested
  if (nodeCount >= 46) return 'dense'
  if (nodeCount >= 22) return 'compact'
  return 'comfortable'
}

export function canvasArchitectureCardTemplate(item: CanvasNode | CanvasNote): CanvasArchitectureCardTemplate {
  if (item.icon === 'user' || item.c4Type === 'person') return { kind: 'actor', label: 'ACTOR' }
  if (item.icon === 'external' || (item.tone === 'muted' && /provider|third[- ]party|external|第三方|外部/i.test(`${item.text} ${item.subtitle ?? ''}`))) {
    return { kind: 'external', label: 'EXTERNAL' }
  }
  if (item.icon === 'web' || item.icon === 'gateway' || item.icon === 'api' || item.icon === 'auth') return { kind: 'entry', label: 'EDGE' }
  if (item.icon === 'queue' || item.icon === 'scheduler') return { kind: 'messaging', label: 'ASYNC' }
  if (item.icon === 'database' || item.icon === 'cache' || item.icon === 'search' || item.icon === 'vector' || item.icon === 'file') return { kind: 'data', label: 'DATA' }
  if (item.icon === 'service' || item.icon === 'worker' || item.icon === 'ai' || item.icon === 'mcp' || item.icon === 'cloud') return { kind: 'compute', label: 'RUNTIME' }
  return { kind: 'generic', label: item.c4Type ? c4Label(item.c4Type).toUpperCase() : 'COMPONENT' }
}

export function canvasArchitectureHeader(scene: CanvasScene): CanvasArchitectureHeader | undefined {
  if (!scene.architecture?.presentation) return undefined
  const nodes = scene.elements.filter((item) => item.type !== 'arrow').length
  const arrows = scene.elements.filter((item) => item.type === 'arrow')
  const projection = canvasArchitectureProjection(scene)
  const visibleNodes = projection.scene.elements.filter((item) => item.type !== 'arrow').length
  const visibleArrows = projection.scene.elements.filter((item) => item.type === 'arrow').length
  const scope = projection.view === 'overview'
    ? projection.hiddenNodes > 0
      ? `${visibleNodes}/${nodes} 个节点 · ${visibleArrows}/${arrows.length} 条关系 · 总览`
      : `${nodes} 个节点 · ${arrows.length} 条关系 · 总览`
    : `${nodes} 个节点 · ${arrows.length} 条关系 · 详情`
  return {
    height: 88,
    eyebrow: 'SYSTEM ARCHITECTURE',
    title: scene.title || 'Architecture',
    subtitle: `${scope} · ${architectureDensityLabel(projection.density)}`,
    legend: [
      { kind: 'primary', label: '主链路' },
      { kind: 'secondary', label: '关联' },
      ...(arrows.some((item) => item.lineStyle === 'dashed') ? [{ kind: 'async' as const, label: '异步' }] : []),
    ],
  }
}

export function canvasArrowLabelLayouts(scene: CanvasScene): Map<string, CanvasArrowLabelLayout> {
  const boxes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const occupiedBoxes = [...boxes.values()].map((item) => ({ x: item.x - 8, y: item.y - 8, width: item.width + 16, height: item.height + 16 }))
  const occupiedLabels: Array<{ x: number; y: number; width: number; height: number }> = []
  const arrows = scene.elements
    .filter((item): item is CanvasArrow => item.type === 'arrow' && Boolean(item.label))
    .slice()
    .sort((left, right) => emphasisRank(left.emphasis) - emphasisRank(right.emphasis) || left.id.localeCompare(right.id))
  const result = new Map<string, CanvasArrowLabelLayout>()

  for (const arrow of arrows) {
    const from = boxes.get(arrow.from)
    const to = boxes.get(arrow.to)
    if (!from || !to || !arrow.label) continue
    const fromCenter = centerOfCanvasBox(from)
    const toCenter = centerOfCanvasBox(to)
    const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
    const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
    const route = canvasArrowRoutePoints(start, end, arrow)
    const segments = route.slice(0, -1).map((point, index) => {
      const next = route[index + 1]
      const horizontal = Math.abs(next.x - point.x) >= Math.abs(next.y - point.y)
      const length = Math.abs(next.x - point.x) + Math.abs(next.y - point.y)
      const bundledEndpoint = (arrow.bundleKey?.startsWith('from:') && index === 0)
        || (arrow.bundleKey?.startsWith('to:') && index === route.length - 2)
      return { point, next, horizontal, length, bundledEndpoint }
    }).filter((segment) => segment.length >= 28)
      .sort((left, right) => Number(left.bundledEndpoint) - Number(right.bundledEndpoint) || Number(right.horizontal) - Number(left.horizontal) || right.length - left.length)
    if (!segments.length) continue

    const width = Math.min(220, Math.max(48, 18 + Array.from(arrow.label).length * 7))
    const height = 24
    if (arrow.labelPosition) {
      const placed = { id: arrow.id, x: arrow.labelPosition.x, y: arrow.labelPosition.y, width, height }
      occupiedLabels.push({ x: placed.x - width / 2, y: placed.y - height / 2, width, height })
      result.set(arrow.id, placed)
      continue
    }
    let placed: CanvasArrowLabelLayout | undefined
    for (const segment of segments) {
      const mid = { x: (segment.point.x + segment.next.x) / 2, y: (segment.point.y + segment.next.y) / 2 }
      for (const offset of [0, -26, 26, -52, 52]) {
        const x = mid.x + (segment.horizontal ? 0 : 14 + offset)
        const y = mid.y + (segment.horizontal ? -14 + offset : 0)
        const rect = { x: x - width / 2, y: y - height / 2, width, height }
        if (occupiedBoxes.some((box) => rectanglesOverlap(rect, box)) || occupiedLabels.some((label) => rectanglesOverlap(rect, label))) continue
        placed = { id: arrow.id, x, y, width, height }
        occupiedLabels.push(rect)
        break
      }
      if (placed) break
    }
    if (!placed) {
      const segment = segments[0]
      const x = (segment.point.x + segment.next.x) / 2 + (segment.horizontal ? 0 : 14)
      const y = (segment.point.y + segment.next.y) / 2 + (segment.horizontal ? -14 : 0)
      const rect = { x: x - width / 2, y: y - height / 2, width, height }
      placed = { id: arrow.id, x, y, width, height }
      occupiedLabels.push(rect)
    }
    result.set(arrow.id, placed)
  }
  return result
}

function strongestEmphasis(arrows: CanvasArrow[]): CanvasEmphasis | undefined {
  if (arrows.some((arrow) => arrow.emphasis === 'primary')) return 'primary'
  if (arrows.some((arrow) => arrow.emphasis === 'secondary')) return 'secondary'
  if (arrows.some((arrow) => arrow.emphasis === 'muted')) return 'muted'
  return undefined
}

export function canvasGroupFrames(scene: CanvasScene): CanvasGroupFrame[] {
  const groups = scene.groups ?? []
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  return groups.flatMap((group) => {
    const members = boxes.filter((item) => item.groupId && groupContains(group.id, item.groupId, groupById))
    if (!members.length) return []
    const minX = Math.min(...members.map((item) => item.x)) - 24
    const minY = Math.min(...members.map((item) => item.y)) - 42
    const maxX = Math.max(...members.map((item) => item.x + item.width)) + 24
    const maxY = Math.max(...members.map((item) => item.y + item.height)) + 24
    return [{
      ...group,
      x: minX,
      y: minY,
      width: group.collapsed ? Math.min(280, Math.max(180, maxX - minX)) : maxX - minX,
      height: group.collapsed ? 58 : maxY - minY,
      memberIds: members.map((item) => item.id),
    }]
  })
}

export function canvasCollapsedOwners(scene: CanvasScene): Map<string, string> {
  const groups = new Map((scene.groups ?? []).map((group) => [group.id, group]))
  const result = new Map<string, string>()
  scene.elements.forEach((item) => {
    if (item.type === 'arrow' || !item.groupId) return
    let groupId: string | undefined = item.groupId
    let owner: string | undefined
    const seen = new Set<string>()
    while (groupId && !seen.has(groupId)) {
      seen.add(groupId)
      const group = groups.get(groupId)
      if (!group) break
      if (group.collapsed) owner = group.id
      groupId = group.parentId
    }
    if (owner) result.set(item.id, owner)
  })
  return result
}

export function canvasCollapsedConnections(scene: CanvasScene, frames = canvasGroupFrames(scene)): CanvasCollapsedConnection[] {
  const boxes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const owners = canvasCollapsedOwners(scene)
  const frameById = new Map(frames.map((frame) => [frame.id, frame]))
  const aggregate = new Map<string, CanvasCollapsedConnection>()
  scene.elements.forEach((item) => {
    if (item.type !== 'arrow') return
    const fromNode = boxes.get(item.from)
    const toNode = boxes.get(item.to)
    if (!fromNode || !toNode) return
    const fromOwner = owners.get(item.from)
    const toOwner = owners.get(item.to)
    if (!fromOwner && !toOwner) return
    const fromFrame = fromOwner ? frameById.get(fromOwner) : undefined
    const toFrame = toOwner ? frameById.get(toOwner) : undefined
    if (fromOwner && !fromFrame || toOwner && !toFrame) return
    const fromKey = fromOwner ? `group:${fromOwner}` : `node:${item.from}`
    const toKey = toOwner ? `group:${toOwner}` : `node:${item.to}`
    if (fromKey === toKey) return
    const key = `${fromKey}->${toKey}`
    const existing = aggregate.get(key)
    if (existing) {
      existing.count += 1
      if (item.label && !existing.labels.includes(item.label)) existing.labels.push(item.label)
      if (existing.lineStyle !== item.lineStyle) existing.lineStyle = 'solid'
      return
    }
    aggregate.set(key, {
      id: `collapsed:${key}`,
      fromKey,
      toKey,
      fromBox: fromFrame ?? fromNode,
      toBox: toFrame ?? toNode,
      count: 1,
      labels: item.label ? [item.label] : [],
      lineStyle: item.lineStyle,
      routing: 'orthogonal',
      fromAnchor: item.fromAnchor,
      toAnchor: item.toAnchor,
    })
  })
  return [...aggregate.values()]
}

function groupContains(targetId: string, candidateId: string, groups: Map<string, CanvasGroup>): boolean {
  let current: string | undefined = candidateId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    if (current === targetId) return true
    seen.add(current)
    current = groups.get(current)?.parentId
  }
  return false
}

function architectureGroupBreadcrumbs(groupId: string, groups: Map<string, CanvasGroup>): CanvasArchitectureBreadcrumb[] {
  const chain: CanvasArchitectureBreadcrumb[] = []
  let current: string | undefined = groupId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const group = groups.get(current)
    if (!group) break
    chain.push({ kind: 'group', id: group.id, label: group.label || group.id })
    current = group.parentId
  }
  return chain.reverse()
}

function isInsideCollapsedAncestor(groupId: string, groups: CanvasGroup[]): boolean {
  const groupById = new Map(groups.map((group) => [group.id, group]))
  let current = groupById.get(groupId)?.parentId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const group = groupById.get(current)
    if (!group) return false
    if (group.collapsed) return true
    current = group.parentId
  }
  return false
}

function centerOfCanvasBox(item: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>) {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function edgePoint(item: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>, toward: CanvasPoint) {
  const origin = centerOfCanvasBox(item)
  const dx = toward.x - origin.x
  const dy = toward.y - origin.y
  if (dx === 0 && dy === 0) return origin
  const scale = 1 / Math.max(Math.abs(dx) / Math.max(1, item.width / 2), Math.abs(dy) / Math.max(1, item.height / 2))
  return { x: origin.x + dx * scale, y: origin.y + dy * scale }
}

export function anchorPoint(item: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>, anchor: CanvasAnchor | undefined, toward: CanvasPoint): CanvasPoint {
  const center = centerOfCanvasBox(item)
  switch (anchor) {
    case 'top': return { x: center.x, y: item.y }
    case 'right': return { x: item.x + item.width, y: center.y }
    case 'bottom': return { x: center.x, y: item.y + item.height }
    case 'left': return { x: item.x, y: center.y }
    default: return edgePoint(item, toward)
  }
}

export function canvasArrowPath(start: CanvasPoint, end: CanvasPoint, arrow: Pick<CanvasArrow, 'routing' | 'points' | 'fromAnchor' | 'toAnchor'>): string {
  const route = canvasArrowRoutePoints(start, end, arrow)
  return [`M ${route[0].x} ${route[0].y}`, ...route.slice(1).map((point) => `L ${point.x} ${point.y}`)].join(' ')
}

export function canvasArrowRoutePoints(start: CanvasPoint, end: CanvasPoint, arrow: Pick<CanvasArrow, 'routing' | 'points' | 'fromAnchor' | 'toAnchor'>): CanvasPoint[] {
  const points = arrow.points?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) ?? []
  if (points.length > 0) return [start, ...points, end]
  if (arrow.routing !== 'orthogonal') return [start, end]
  const axis = preferredOrthogonalAxis(arrow.fromAnchor, arrow.toAnchor, start, end)
  if (axis === 'y') {
    const midY = (start.y + end.y) / 2
    return dedupeRoutePoints([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end])
  }
  const midX = (start.x + end.x) / 2
  return dedupeRoutePoints([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end])
}

function preferredOrthogonalAxis(from: CanvasAnchor | undefined, to: CanvasAnchor | undefined, start: CanvasPoint, end: CanvasPoint): 'x' | 'y' {
  const horizontalAnchors = new Set<CanvasAnchor>(['left', 'right'])
  const verticalAnchors = new Set<CanvasAnchor>(['top', 'bottom'])
  if ((from && horizontalAnchors.has(from)) || (to && horizontalAnchors.has(to))) return 'x'
  if ((from && verticalAnchors.has(from)) || (to && verticalAnchors.has(to))) return 'y'
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'x' : 'y'
}

function shapeRadius(shape: CanvasShape | undefined, height: number): number {
  if (shape === 'square') return 3
  if (shape === 'pill') return Math.max(12, height / 2)
  return 12
}

function canvasTonePalette(
  tone: CanvasTone | undefined,
  colors: { panel: string; text: string; border: string; note: string },
  kind: 'node' | 'note',
) {
  if (!tone || tone === 'default') return { fill: kind === 'note' ? colors.note : colors.panel, text: colors.text, stroke: colors.border }
  const palettes: Record<Exclude<CanvasTone, 'default'>, { fill: string; text: string; stroke: string }> = {
    accent: { fill: '#eef2ff', text: '#312e81', stroke: '#818cf8' },
    success: { fill: '#ecfdf5', text: '#065f46', stroke: '#34d399' },
    warning: { fill: '#fffbeb', text: '#92400e', stroke: '#fbbf24' },
    danger: { fill: '#fef2f2', text: '#991b1b', stroke: '#f87171' },
    muted: { fill: '#f5f5f5', text: '#525252', stroke: '#a3a3a3' },
  }
  return palettes[tone]
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeArchitectureAppearance(value: unknown): CanvasScene['architecture'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  const themes: CanvasArchitectureTheme[] = ['enterprise', 'technical', 'presentation']
  const views: CanvasArchitectureView[] = ['overview', 'detail']
  const densities: CanvasArchitectureDensity[] = ['auto', 'comfortable', 'compact', 'dense']
  if (typeof item.theme !== 'string' || !themes.includes(item.theme as CanvasArchitectureTheme)) return undefined
  return {
    theme: item.theme as CanvasArchitectureTheme,
    ...(item.presentation === true ? { presentation: true } : {}),
    ...(typeof item.view === 'string' && views.includes(item.view as CanvasArchitectureView) ? { view: item.view as CanvasArchitectureView } : {}),
    ...(typeof item.density === 'string' && densities.includes(item.density as CanvasArchitectureDensity) ? { density: item.density as CanvasArchitectureDensity } : {}),
  }
}

function isCanvasElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string') return false
  if (item.type === 'arrow') return typeof item.from === 'string' && typeof item.to === 'string'
  return (item.type === 'node' || item.type === 'note')
    && [item.x, item.y, item.width, item.height].every((part) => typeof part === 'number' && Number.isFinite(part))
    && typeof item.text === 'string'
}

function normalizeCanvasElement(item: CanvasElement): CanvasElement {
  if (item.type === 'arrow') {
    const emphases: CanvasEmphasis[] = ['primary', 'secondary', 'muted']
    return {
      id: item.id,
      type: 'arrow',
      from: item.from,
      to: item.to,
      ...(typeof item.label === 'string' && item.label ? { label: item.label } : {}),
      ...(item.lineStyle === 'solid' || item.lineStyle === 'dashed' ? { lineStyle: item.lineStyle } : {}),
      ...(item.routing === 'straight' || item.routing === 'orthogonal' ? { routing: item.routing } : {}),
      ...(['auto', 'top', 'right', 'bottom', 'left'].includes(item.fromAnchor ?? '') ? { fromAnchor: item.fromAnchor } : {}),
      ...(['auto', 'top', 'right', 'bottom', 'left'].includes(item.toAnchor ?? '') ? { toAnchor: item.toAnchor } : {}),
      ...(Array.isArray(item.points) ? { points: item.points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)).map((point) => ({ x: point.x, y: point.y })) } : {}),
      ...(item.labelPosition && Number.isFinite(item.labelPosition.x) && Number.isFinite(item.labelPosition.y) ? { labelPosition: { x: item.labelPosition.x, y: item.labelPosition.y } } : {}),
      ...(item.emphasis && emphases.includes(item.emphasis) ? { emphasis: item.emphasis } : {}),
      ...(typeof item.bundleKey === 'string' && item.bundleKey.trim() ? { bundleKey: item.bundleKey.trim().slice(0, 120) } : {}),
    }
  }
  const tones: CanvasTone[] = ['default', 'accent', 'success', 'warning', 'danger', 'muted']
  const emphases: CanvasEmphasis[] = ['primary', 'secondary', 'muted']
  const shapes: CanvasShape[] = ['rounded', 'square', 'pill']
  const icons: CanvasIcon[] = ['user', 'web', 'api', 'gateway', 'service', 'worker', 'database', 'cache', 'queue', 'search', 'vector', 'cloud', 'file', 'auth', 'ai', 'mcp', 'scheduler', 'external']
  const stencils: CanvasStencil[] = ['spring', 'react', 'vue', 'postgres', 'mysql', 'redis', 'kafka', 'rabbitmq', 'docker', 'kubernetes', 'qdrant', 'opensearch', 'elasticsearch', 'mongodb', 'minio', 'nginx', 'grpc', 'oidc', 'openai', 'mcp']
  const c4Types: CanvasC4Type[] = ['person', 'software-system', 'container', 'component']
  return {
    id: item.id,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    text: item.text,
    ...(item.tone && tones.includes(item.tone) ? { tone: item.tone } : {}),
    ...(item.shape && shapes.includes(item.shape) ? { shape: item.shape } : {}),
    ...(item.locked === true ? { locked: true } : {}),
    ...(typeof item.groupId === 'string' && item.groupId.trim() ? { groupId: item.groupId.trim() } : {}),
    ...(Array.isArray(item.sourcePaths) ? { sourcePaths: item.sourcePaths.filter((path) => typeof path === 'string' && path.trim()).map((path) => path.trim()).slice(0, 12) } : {}),
    ...(item.icon && icons.includes(item.icon) ? { icon: item.icon } : {}),
    ...(item.stencil && stencils.includes(item.stencil) ? { stencil: item.stencil } : {}),
    ...(typeof item.subtitle === 'string' && item.subtitle.trim() ? { subtitle: item.subtitle.trim().slice(0, 120) } : {}),
    ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim().slice(0, 1000) } : {}),
    ...(Array.isArray(item.tags) ? { tags: item.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()).slice(0, 12) } : {}),
    ...(typeof item.laneId === 'string' && item.laneId.trim() ? { laneId: item.laneId.trim() } : {}),
    ...(item.c4Type && c4Types.includes(item.c4Type) ? { c4Type: item.c4Type } : {}),
    ...(item.emphasis && emphases.includes(item.emphasis) ? { emphasis: item.emphasis } : {}),
  }
}

function normalizeCanvasGroups(value: unknown[]): CanvasGroup[] {
  const tones: CanvasTone[] = ['default', 'accent', 'success', 'warning', 'danger', 'muted']
  const seen = new Set<string>()
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id.trim())) return []
    const id = item.id.trim()
    seen.add(id)
    return [{
      id,
      ...(typeof item.label === 'string' && item.label.trim() ? { label: item.label.trim() } : {}),
      ...(typeof item.tone === 'string' && tones.includes(item.tone as CanvasTone) ? { tone: item.tone as CanvasTone } : {}),
      ...(item.kind === 'group' || item.kind === 'boundary' ? { kind: item.kind as CanvasGroupKind } : {}),
      ...(item.collapsed === true ? { collapsed: true } : {}),
      ...(typeof item.parentId === 'string' && item.parentId.trim() && item.parentId.trim() !== id ? { parentId: item.parentId.trim() } : {}),
      ...(item.c4Type === 'software-system' || item.c4Type === 'container' ? { c4Type: item.c4Type } : {}),
      ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim().slice(0, 1000) } : {}),
    }]
  })
}

function normalizeCanvasLanes(value: unknown[], width: number, height: number): CanvasLane[] {
  const tones: CanvasTone[] = ['default', 'accent', 'success', 'warning', 'danger', 'muted']
  const seen = new Set<string>()
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id.trim())) return []
    if (typeof item.label !== 'string' || !item.label.trim()) return []
    if (item.axis !== 'horizontal' && item.axis !== 'vertical') return []
    const id = item.id.trim()
    const max = item.axis === 'horizontal' ? height : width
    const start = Math.max(0, Math.min(max, typeof item.start === 'number' && Number.isFinite(item.start) ? item.start : 0))
    const size = Math.max(64, Math.min(max - start || 64, typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : 240))
    seen.add(id)
    return [{
      id,
      label: item.label.trim().slice(0, 120),
      axis: item.axis,
      start,
      size,
      ...(typeof item.tone === 'string' && tones.includes(item.tone as CanvasTone) ? { tone: item.tone as CanvasTone } : {}),
    }]
  })
}

export function canvasStencilLabel(stencil: CanvasStencil): string {
  return ({ spring: 'SPRING', react: 'REACT', vue: 'VUE', postgres: 'PG', mysql: 'MYSQL', redis: 'REDIS', kafka: 'KAFKA', rabbitmq: 'RABBITMQ', docker: 'DOCKER', kubernetes: 'K8S', qdrant: 'QDRANT', opensearch: 'OPENSEARCH', elasticsearch: 'ELASTIC', mongodb: 'MONGO', minio: 'S3', nginx: 'NGINX', grpc: 'gRPC', oidc: 'OIDC', openai: 'LLM', mcp: 'MCP' })[stencil]
}

export function canvasIconLabel(icon: CanvasIcon): string {
  return ({ user: 'USER', web: 'WEB', api: 'API', gateway: 'GATEWAY', service: 'SERVICE', worker: 'WORKER', database: 'DATABASE', cache: 'CACHE', queue: 'QUEUE', search: 'SEARCH', vector: 'VECTOR', cloud: 'CLOUD', file: 'STORAGE', auth: 'AUTH', ai: 'AI', mcp: 'MCP', scheduler: 'SCHEDULE', external: 'EXTERNAL' })[icon]
}

export function canvasIconGlyph(icon: CanvasIcon): string {
  return ({ user: '◎', web: '▣', api: '⇄', gateway: '◇', service: '◆', worker: '⚙', database: '▤', cache: '⚡', queue: '≋', search: '⌕', vector: '✣', cloud: '☁', file: '▥', auth: '◆', ai: '✦', mcp: '⌘', scheduler: '◷', external: '↗' })[icon]
}

export function canvasIconPaths(icon: CanvasIcon): string[] {
  return ({
    user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
    web: ['M3 5h18v14H3z', 'M3 9h18', 'M7 7h.01 M10 7h.01'],
    api: ['M5 7h5v5H5z', 'M14 12h5v5h-5z', 'M10 9h4 M12 9v6 M10 15h4'],
    gateway: ['M12 3 21 12 12 21 3 12z', 'M8 12h8', 'M13 9l3 3-3 3'],
    service: ['M12 3 20 7.5v9L12 21l-8-4.5v-9z', 'M8 10h8 M8 14h8'],
    worker: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M12 2v3 M12 19v3 M4.9 4.9 7 7 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1'],
    database: ['M4 6c0-2 16-2 16 0s-16 2-16 0', 'M4 6v12c0 2 16 2 16 0V6', 'M4 12c0 2 16 2 16 0'],
    cache: ['M13 2 5 14h6l-1 8 9-13h-6z'],
    queue: ['M5 7h14 M5 12h14 M5 17h14', 'M3 7h.01 M3 12h.01 M3 17h.01'],
    search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M16 16l5 5'],
    vector: ['M5 6a2 2 0 1 0 0 .01 M19 6a2 2 0 1 0 0 .01 M12 18a2 2 0 1 0 0 .01', 'M7 7l4 9 M17 7l-4 9 M7 6h10'],
    cloud: ['M7 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 7 8.5 4.5 4.5 0 0 0 7 18'],
    file: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6 M9 17h6'],
    auth: ['M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z', 'M9 12l2 2 4-5'],
    ai: ['M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z', 'M18 3v4 M16 5h4'],
    mcp: ['M6 7h5v5H6z M13 12h5v5h-5z', 'M11 9h4v5 M9 12v5h4'],
    scheduler: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16', 'M12 8v5l3 2', 'M8 2v3 M16 2v3'],
    external: ['M8 16 16 8', 'M10 8h6v6', 'M5 5h6 M5 5v14h14v-6'],
  } satisfies Record<CanvasIcon, string[]>)[icon]
}

export function c4Label(type: CanvasC4Type | 'software-system' | 'container'): string {
  return ({ person: 'Person', 'software-system': 'System', container: 'Container', component: 'Component' })[type]
}

function overviewNodeLimit(density: Exclude<CanvasArchitectureDensity, 'auto'>): number {
  if (density === 'dense') return 26
  if (density === 'compact') return 22
  return 18
}

function architectureOverviewScore(item: CanvasNode | CanvasNote, degree: Map<string, number>): number {
  const emphasis = item.emphasis === 'primary' ? 90 : item.emphasis === 'secondary' || !item.emphasis ? 32 : -18
  const role: Partial<Record<CanvasIcon, number>> = {
    gateway: 20,
    api: 19,
    service: 18,
    worker: 16,
    ai: 16,
    mcp: 15,
    web: 14,
    auth: 13,
    queue: 12,
    search: 11,
    vector: 11,
    database: 10,
    cache: 9,
    external: 8,
    user: 8,
    file: 7,
    scheduler: 7,
    cloud: 7,
  }
  return emphasis + (item.icon ? role[item.icon] ?? 8 : 8) + Math.min(28, (degree.get(item.id) ?? 0) * 4)
}

function architectureDensityLabel(density: Exclude<CanvasArchitectureDensity, 'auto'>): string {
  if (density === 'dense') return '高密度'
  if (density === 'compact') return '紧凑'
  return '舒适'
}

function architectureCardBandColor(kind: CanvasArchitectureCardKind, semantic: string, fallback: string): string {
  if (kind === 'entry') return '#6366f1'
  if (kind === 'data') return '#10b981'
  if (kind === 'messaging') return '#f59e0b'
  if (kind === 'external') return fallback
  return semantic
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char)
}

function architectureHeaderToSvg(
  scene: CanvasScene,
  header: CanvasArchitectureHeader,
  colors: { background: string; text: string; border: string },
): string {
  const legendWidth = header.legend.length * 92
  const legendStart = Math.max(scene.width * 0.56, scene.width - legendWidth - 34)
  const legend = header.legend.map((item, index) => {
    const x = legendStart + index * 92
    const dash = item.kind === 'async' ? ' stroke-dasharray="6 4"' : ''
    const strokeWidth = item.kind === 'primary' ? 3 : 2
    const opacity = item.kind === 'secondary' ? '0.62' : '1'
    const stroke = item.kind === 'primary' ? '#6366f1' : colors.border
    return `<g opacity="${opacity}"><path d="M ${x} 50 L ${x + 26} 50" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round"${dash}/><text x="${x + 34}" y="54" font-size="11" font-weight="600" fill="${escapeXml(colors.text)}">${escapeXml(item.label)}</text></g>`
  }).join('')
  return `<g><rect x="0" y="0" width="${scene.width}" height="${header.height}" fill="${escapeXml(colors.background)}"/><path d="M 28 ${header.height - 1} H ${scene.width - 28}" stroke="${escapeXml(colors.border)}" stroke-opacity="0.32"/><text x="32" y="24" font-size="10" font-weight="700" letter-spacing="1.4" fill="${escapeXml(colors.border)}">${escapeXml(header.eyebrow)}</text><text x="32" y="52" font-size="24" font-weight="720" fill="${escapeXml(colors.text)}">${escapeXml(truncateCanvasText(header.title, 42))}</text><text x="32" y="72" font-size="11" fill="${escapeXml(colors.border)}">${escapeXml(header.subtitle)}</text>${legend}</g>`
}

function truncateCanvasText(value: string, max: number): string {
  const chars = Array.from(value)
  return chars.length > max ? `${chars.slice(0, Math.max(1, max - 1)).join('')}…` : value
}

function emphasisRank(value: CanvasEmphasis | undefined): number {
  if (value === 'primary') return 0
  if (value === 'secondary' || !value) return 1
  return 2
}

function rectanglesOverlap(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function dedupeRoutePoints(points: CanvasPoint[]): CanvasPoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
}
