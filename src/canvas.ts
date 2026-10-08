export type CanvasElement = CanvasNode | CanvasNote | CanvasArrow
export type CanvasTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
export type CanvasShape = 'rounded' | 'square' | 'pill'
export type CanvasLineStyle = 'solid' | 'dashed'
export type CanvasRouting = 'straight' | 'orthogonal'
export type CanvasAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left'
export type CanvasIcon = 'user' | 'web' | 'api' | 'service' | 'database' | 'cache' | 'queue' | 'cloud' | 'file' | 'external'
export type CanvasStencil = 'spring' | 'react' | 'vue' | 'postgres' | 'mysql' | 'redis' | 'kafka' | 'docker' | 'kubernetes' | 'qdrant' | 'opensearch' | 'minio'
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
  return {
    type: 'codex-diagram-canvas',
    version: 1,
    title: typeof scene.title === 'string' ? scene.title : 'Canvas',
    width: positive(scene.width, 1600),
    height: positive(scene.height, 1000),
    elements: scene.elements.filter(isCanvasElement).map(normalizeCanvasElement),
    ...(Array.isArray(scene.groups) ? { groups: normalizeCanvasGroups(scene.groups) } : {}),
    ...(Array.isArray(scene.lanes) ? { lanes: normalizeCanvasLanes(scene.lanes, positive(scene.width, 1600), positive(scene.height, 1000)) } : {}),
  }
}

export function serializeCanvasScene(scene: CanvasScene): string {
  return `${JSON.stringify(scene, null, 2)}\n`
}

export function canvasSceneToSvg(scene: CanvasScene, colors?: { background?: string; panel?: string; text?: string; border?: string; note?: string }): string {
  const background = colors?.background || '#ffffff'
  const panel = colors?.panel || '#f8f8f8'
  const text = colors?.text || '#171717'
  const border = colors?.border || '#8a8a8a'
  const note = colors?.note || '#fff7cc'
  const allNodes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const groupFrames = canvasGroupFrames(scene)
  const collapsedOwners = canvasCollapsedOwners(scene)
  const nodes = new Map([...allNodes.values()].filter((item) => !collapsedOwners.has(item.id)).map((item) => [item.id, item]))
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow').map((arrow) => {
    const from = nodes.get(arrow.from)
    const to = nodes.get(arrow.to)
    if (!from || !to) return ''
    const fromCenter = centerOfCanvasBox(from)
    const toCenter = centerOfCanvasBox(to)
    const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
    const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
    const x1 = start.x
    const y1 = start.y
    const x2 = end.x
    const y2 = end.y
    const dash = arrow.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : ''
    const geometry = canvasArrowPath(start, end, arrow)
    return `<g><path d="${geometry}" fill="none" stroke="${escapeXml(border)}" stroke-width="2"${dash} marker-end="url(#arrow)"/>${arrow.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="14" fill="${escapeXml(text)}">${escapeXml(arrow.label)}</text>` : ''}</g>`
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
    const lines = item.text.split('\n').slice(0, 6)
    const texts = lines.map((line, index) => `<text x="${item.x + item.width / 2}" y="${item.y + item.height / 2 + (index - (lines.length - 1) / 2) * 19}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${escapeXml(palette.text)}">${escapeXml(line)}</text>`).join('')
    const roleGlyph = item.icon ? canvasIconGlyph(item.icon) : ''
    const icon = roleGlyph ? `<g><circle cx="${item.x + 18}" cy="${item.y + 18}" r="10" fill="${escapeXml(palette.stroke)}" fill-opacity="0.12" stroke="${escapeXml(palette.stroke)}" stroke-opacity="0.45"/><text x="${item.x + 18}" y="${item.y + 18}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="${escapeXml(palette.stroke)}">${escapeXml(roleGlyph)}</text></g>` : ''
    const stencil = item.stencil ? `<text x="${item.x + (item.icon ? 34 : 14)}" y="${item.y + 21}" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="${escapeXml(palette.stroke)}">${escapeXml(canvasStencilLabel(item.stencil))}</text>` : ''
    const c4 = item.c4Type ? `<text x="${item.x + item.width - 12}" y="${item.y + 20}" text-anchor="end" font-size="10" font-weight="600" fill="${escapeXml(palette.stroke)}">${escapeXml(c4Label(item.c4Type))}</text>` : ''
    const subtitle = item.subtitle ? `<text x="${item.x + item.width / 2}" y="${item.y + item.height - 16}" text-anchor="middle" font-size="11" fill="${escapeXml(palette.stroke)}">${escapeXml(item.subtitle)}</text>` : ''
    return `<g><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${shapeRadius(item.shape, item.height)}" fill="${escapeXml(palette.fill)}" stroke="${escapeXml(palette.stroke)}" stroke-width="1.5"/>${icon}${stencil}${c4}${texts}${subtitle}</g>`
  }).join('')
  const groups = groupFrames.filter((group) => !isInsideCollapsedAncestor(group.id, scene.groups ?? [])).map((group) => {
    const palette = canvasTonePalette(group.tone, { panel, text, border, note }, 'node')
    const dash = group.kind === 'boundary' ? '12 6' : '8 6'
    const c4 = group.c4Type ? ` · ${c4Label(group.c4Type)}` : ''
    const collapsed = group.collapsed ? ' · collapsed' : ''
    return `<g><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="18" fill="${group.collapsed ? escapeXml(palette.fill) : 'none'}" fill-opacity="${group.collapsed ? '0.5' : '1'}" stroke="${escapeXml(palette.stroke)}" stroke-width="1.4" stroke-dasharray="${dash}"/>${group.label ? `<text x="${group.x + 14}" y="${group.y + 22}" font-size="13" font-weight="600" fill="${escapeXml(palette.text)}">${escapeXml(`${group.label}${c4}${collapsed}`)}</text>` : ''}</g>`
  }).join('')
  const lanes = (scene.lanes ?? []).map((lane) => {
    const palette = canvasTonePalette(lane.tone ?? 'muted', { panel, text, border, note }, 'node')
    const x = lane.axis === 'vertical' ? lane.start : 0
    const y = lane.axis === 'horizontal' ? lane.start : 0
    const width = lane.axis === 'vertical' ? lane.size : scene.width
    const height = lane.axis === 'horizontal' ? lane.size : scene.height
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${escapeXml(palette.fill)}" fill-opacity="0.42" stroke="${escapeXml(palette.stroke)}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 6"/><rect x="${x}" y="${y}" width="${width}" height="34" rx="14" fill="${escapeXml(palette.fill)}" fill-opacity="0.86"/><text x="${x + 14}" y="${y + 22}" font-size="12" font-weight="700" fill="${escapeXml(palette.text)}">${escapeXml(lane.label)}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${escapeXml(border)}"/></marker></defs><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${lanes}${groups}${arrows}${collapsedConnections}${shapes}</svg>`
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
  const points = arrow.points?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) ?? []
  if (points.length > 0) return [`M ${start.x} ${start.y}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${end.x} ${end.y}`].join(' ')
  return arrow.routing === 'orthogonal'
    ? orthogonalSvgPath(start.x, start.y, end.x, end.y, preferredOrthogonalAxis(arrow.fromAnchor, arrow.toAnchor, start, end))
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`
}

function orthogonalSvgPath(x1: number, y1: number, x2: number, y2: number, axis: 'x' | 'y'): string {
  if (axis === 'y') {
    const midY = (y1 + y2) / 2
    return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
  }
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
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
    }
  }
  const tones: CanvasTone[] = ['default', 'accent', 'success', 'warning', 'danger', 'muted']
  const shapes: CanvasShape[] = ['rounded', 'square', 'pill']
  const icons: CanvasIcon[] = ['user', 'web', 'api', 'service', 'database', 'cache', 'queue', 'cloud', 'file', 'external']
  const stencils: CanvasStencil[] = ['spring', 'react', 'vue', 'postgres', 'mysql', 'redis', 'kafka', 'docker', 'kubernetes', 'qdrant', 'opensearch', 'minio']
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
  return ({ spring: 'SPRING', react: 'REACT', vue: 'VUE', postgres: 'PG', mysql: 'MYSQL', redis: 'REDIS', kafka: 'KAFKA', docker: 'DOCKER', kubernetes: 'K8S', qdrant: 'QDRANT', opensearch: 'OS', minio: 'S3' })[stencil]
}

export function canvasIconLabel(icon: CanvasIcon): string {
  return ({ user: 'USR', web: 'WEB', api: 'API', service: 'SVC', database: 'DB', cache: 'CACHE', queue: 'MQ', cloud: 'CLOUD', file: 'FILE', external: 'EXT' })[icon]
}

export function canvasIconGlyph(icon: CanvasIcon): string {
  return ({ user: '◎', web: '▣', api: '↔', service: '◆', database: '▤', cache: '⚡', queue: '≋', cloud: '☁', file: '▥', external: '↗' })[icon]
}

export function c4Label(type: CanvasC4Type | 'software-system' | 'container'): string {
  return ({ person: 'Person', 'software-system': 'System', container: 'Container', component: 'Component' })[type]
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char)
}
