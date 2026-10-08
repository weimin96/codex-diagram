export type CanvasElement = CanvasNode | CanvasNote | CanvasArrow
export type CanvasTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
export type CanvasShape = 'rounded' | 'square' | 'pill'
export type CanvasLineStyle = 'solid' | 'dashed'
export type CanvasRouting = 'straight' | 'orthogonal'
export type CanvasAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left'
export interface CanvasPoint { x: number; y: number }

export interface CanvasScene {
  type: 'codex-diagram-canvas'
  version: 1
  title: string
  width: number
  height: number
  elements: CanvasElement[]
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
  const nodes = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
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
  const shapes = [...nodes.values()].map((item) => {
    const palette = canvasTonePalette(item.tone, { panel, text, border, note }, item.type)
    const lines = item.text.split('\n').slice(0, 6)
    const texts = lines.map((line, index) => `<text x="${item.x + item.width / 2}" y="${item.y + item.height / 2 + (index - (lines.length - 1) / 2) * 19}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${escapeXml(palette.text)}">${escapeXml(line)}</text>`).join('')
    return `<g><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${shapeRadius(item.shape, item.height)}" fill="${escapeXml(palette.fill)}" stroke="${escapeXml(palette.stroke)}" stroke-width="1.5"/>${texts}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${escapeXml(border)}"/></marker></defs><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${arrows}${shapes}</svg>`
}

function centerOfCanvasBox(item: CanvasNode | CanvasNote) {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function edgePoint(item: CanvasNode | CanvasNote, toward: CanvasPoint) {
  const origin = centerOfCanvasBox(item)
  const dx = toward.x - origin.x
  const dy = toward.y - origin.y
  if (dx === 0 && dy === 0) return origin
  const scale = 1 / Math.max(Math.abs(dx) / Math.max(1, item.width / 2), Math.abs(dy) / Math.max(1, item.height / 2))
  return { x: origin.x + dx * scale, y: origin.y + dy * scale }
}

export function anchorPoint(item: CanvasNode | CanvasNote, anchor: CanvasAnchor | undefined, toward: CanvasPoint): CanvasPoint {
  const center = centerOfCanvasBox(item)
  switch (anchor) {
    case 'top': return { x: center.x, y: item.y }
    case 'right': return { x: item.x + item.width, y: center.y }
    case 'bottom': return { x: center.x, y: item.y + item.height }
    case 'left': return { x: item.x, y: center.y }
    default: return edgePoint(item, toward)
  }
}

export function canvasArrowPath(start: CanvasPoint, end: CanvasPoint, arrow: Pick<CanvasArrow, 'routing' | 'points'>): string {
  const points = arrow.points?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) ?? []
  if (points.length > 0) return [`M ${start.x} ${start.y}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${end.x} ${end.y}`].join(' ')
  return arrow.routing === 'orthogonal'
    ? orthogonalSvgPath(start.x, start.y, end.x, end.y)
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`
}

function orthogonalSvgPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
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
  }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char)
}
