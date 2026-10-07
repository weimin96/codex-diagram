export type CanvasElement = CanvasNode | CanvasNote | CanvasArrow

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
}

export interface CanvasNote {
  id: string
  type: 'note'
  x: number
  y: number
  width: number
  height: number
  text: string
}

export interface CanvasArrow {
  id: string
  type: 'arrow'
  from: string
  to: string
  label?: string
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
    elements: scene.elements.filter(isCanvasElement),
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
    const x1 = from.x + from.width / 2
    const y1 = from.y + from.height / 2
    const x2 = to.x + to.width / 2
    const y2 = to.y + to.height / 2
    return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(border)}" stroke-width="2" marker-end="url(#arrow)"/>${arrow.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="14" fill="${escapeXml(text)}">${escapeXml(arrow.label)}</text>` : ''}</g>`
  }).join('')
  const shapes = [...nodes.values()].map((item) => {
    const fill = item.type === 'note' ? note : panel
    const lines = item.text.split('\n').slice(0, 6)
    const texts = lines.map((line, index) => `<text x="${item.x + item.width / 2}" y="${item.y + item.height / 2 + (index - (lines.length - 1) / 2) * 19}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${escapeXml(text)}">${escapeXml(line)}</text>`).join('')
    return `<g><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="12" fill="${escapeXml(fill)}" stroke="${escapeXml(border)}" stroke-width="1.5"/>${texts}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${escapeXml(border)}"/></marker></defs><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${arrows}${shapes}</svg>`
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

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char)
}
