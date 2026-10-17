import {
  canvasArrowBoxRoute,
  canvasArrowRoutePoints,
  canvasArrowLabelLayouts,
  canvasArchitectureRelationLabelVisible,
  type CanvasArrow,
  type CanvasNode,
  type CanvasNote,
  type CanvasPoint,
  type CanvasScene,
} from './canvas.js'

export type CanvasQualityIssueCode =
  | 'node-overlap'
  | 'edge-through-node'
  | 'edge-crossing'
  | 'edge-overlap'
  | 'label-overlap'
  | 'label-through-node'
  | 'label-outside-canvas'
  | 'long-label'
  | 'flat-architecture'

export interface CanvasQualityIssue {
  code: CanvasQualityIssueCode
  severity: 'error' | 'warning'
  message: string
  elementIds: string[]
}

export interface CanvasVisualQualityAssessment {
  needsRevision: boolean
  issues: CanvasQualityIssue[]
  metrics: {
    nodes: number
    arrows: number
    groups: number
    lanes: number
    nodeOverlaps: number
    edgeNodeIntersections: number
    edgeCrossings: number
    edgeOverlaps: number
    labelOverlaps: number
    labelNodeIntersections: number
    labelOverflows: number
    longLabels: number
  }
}

type CanvasBox = CanvasNode | CanvasNote

interface IndexedRect {
  x: number
  y: number
  width: number
  height: number
}

const maxIndexedCellsPerRect = 256
const cellIndexLimit = 1_000_000

/** 均匀网格：把 O(元素²) 的几何两两比较收敛到“附近元素”。 */
class RectIndex {
  private readonly cells = new Map<number, number[]>()
  private readonly oversized: number[] = []
  private readonly stamps: Int32Array
  private generation = 0

  constructor(private readonly cellSize: number, count: number) {
    this.stamps = new Int32Array(count)
  }

  add(index: number, rect: IndexedRect): void {
    const range = this.cellRange(rect)
    if ((range.maxX - range.minX + 1) * (range.maxY - range.minY + 1) > maxIndexedCellsPerRect) {
      this.oversized.push(index)
      return
    }
    for (let cx = range.minX; cx <= range.maxX; cx += 1) {
      for (let cy = range.minY; cy <= range.maxY; cy += 1) {
        const key = cellKey(cx, cy)
        const bucket = this.cells.get(key)
        if (bucket) bucket.push(index)
        else this.cells.set(key, [index])
      }
    }
  }

  beginQuery(): void {
    this.generation += 1
  }

  /** 追加与矩形所在网格相交的候选下标；同一次 beginQuery 内不重复。 */
  query(rect: IndexedRect, out: number[]): void {
    const range = this.cellRange(rect)
    for (let cx = range.minX; cx <= range.maxX; cx += 1) {
      for (let cy = range.minY; cy <= range.maxY; cy += 1) {
        const bucket = this.cells.get(cellKey(cx, cy))
        if (!bucket) continue
        for (const index of bucket) this.push(index, out)
      }
    }
    for (const index of this.oversized) this.push(index, out)
  }

  private push(index: number, out: number[]): void {
    if (this.stamps[index] === this.generation) return
    this.stamps[index] = this.generation
    out.push(index)
  }

  private cellRange(rect: IndexedRect): { minX: number; minY: number; maxX: number; maxY: number } {
    const toCell = (value: number) => Math.max(-cellIndexLimit, Math.min(cellIndexLimit, Math.floor(value / this.cellSize)))
    return {
      minX: toCell(rect.x),
      minY: toCell(rect.y),
      maxX: toCell(rect.x + rect.width),
      maxY: toCell(rect.y + rect.height),
    }
  }
}

function cellKey(cx: number, cy: number): number {
  return (cx + 1_048_576) * 2_097_152 + (cy + 1_048_576)
}

/** 网格边长按“每个格子约 4 个元素”推算，避免稀疏大画布退化成逐格空查。 */
function gridCellSize(scene: CanvasScene, count: number): number {
  if (count === 0) return 256
  const area = Math.max(1, scene.width * scene.height)
  return Math.min(2048, Math.max(128, Math.round(Math.sqrt(area / count) * 2)))
}

function segmentBounds(a: CanvasPoint, b: CanvasPoint): IndexedRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

function routeBounds(route: CanvasPoint[]): IndexedRect {
  let minX = route[0].x
  let minY = route[0].y
  let maxX = minX
  let maxY = minY
  for (const point of route) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function assessCanvasVisualQuality(scene: CanvasScene): CanvasVisualQualityAssessment {
  const boxes = scene.elements.filter((item): item is CanvasBox => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const boxById = new Map(boxes.map((item) => [item.id, item]))
  const boxIndex = new RectIndex(gridCellSize(scene, boxes.length), boxes.length)
  boxes.forEach((box, index) => boxIndex.add(index, box))
  const issues: CanvasQualityIssue[] = []

  let nodeOverlaps = 0
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex]
      const right = boxes[rightIndex]
      if (!boxesOverlap(left, right)) continue
      nodeOverlaps += 1
      issues.push({
        code: 'node-overlap',
        severity: 'error',
        message: `${left.text} 与 ${right.text} 发生节点重叠`,
        elementIds: [left.id, right.id],
      })
    }
  }

  const routes = new Map<string, CanvasPoint[]>()
  let edgeNodeIntersections = 0
  for (const arrow of arrows) {
    const route = arrowRoute(arrow, boxById)
    if (!route) continue
    routes.set(arrow.id, route)
    boxIndex.beginQuery()
    const candidates: number[] = []
    for (let index = 0; index < route.length - 1; index += 1) {
      boxIndex.query(segmentBounds(route[index], route[index + 1]), candidates)
    }
    candidates.sort((left, right) => left - right)
    for (const index of candidates) {
      const box = boxes[index]
      if (box.id === arrow.from || box.id === arrow.to) continue
      if (!routeCutsBox(route, box)) continue
      edgeNodeIntersections += 1
      issues.push({
        code: 'edge-through-node',
        severity: 'error',
        message: `${arrow.label || arrow.id} 的连线穿过 ${box.text}`,
        elementIds: [arrow.id, box.id],
      })
    }
  }

  let edgeCrossings = 0
  let edgeOverlaps = 0
  const routeIndex = new RectIndex(gridCellSize(scene, arrows.length), arrows.length)
  arrows.forEach((arrow, index) => {
    const route = routes.get(arrow.id)
    if (route) routeIndex.add(index, routeBounds(route))
  })
  for (let leftIndex = 0; leftIndex < arrows.length; leftIndex += 1) {
    const left = arrows[leftIndex]
    const leftRoute = routes.get(left.id)
    if (!leftRoute) continue
    routeIndex.beginQuery()
    const candidates: number[] = []
    routeIndex.query(routeBounds(leftRoute), candidates)
    candidates.sort((first, second) => first - second)
    for (const rightIndex of candidates) {
      if (rightIndex <= leftIndex) continue
      const right = arrows[rightIndex]
      const rightRoute = routes.get(right.id)
      if (!rightRoute) continue
      if (!(left.bundleKey && left.bundleKey === right.bundleKey) && routesOverlap(leftRoute, rightRoute)) {
        edgeOverlaps += 1
        issues.push({
          code: 'edge-overlap',
          severity: 'warning',
          message: `${left.label || left.id} 与 ${right.label || right.id} 的独立连线重叠`,
          elementIds: [left.id, right.id],
        })
      }
      if (!routesCross(leftRoute, rightRoute)) continue
      edgeCrossings += 1
      issues.push({
        code: 'edge-crossing',
        severity: 'warning',
        message: `${left.label || left.id} 与 ${right.label || right.id} 的连线交叉`,
        elementIds: [left.id, right.id],
      })
    }
  }

  const labelScene = scene.architecture ? {
    ...scene,
    elements: scene.elements.map((item) => item.type === 'arrow' && !canvasArchitectureRelationLabelVisible(item) ? { ...item, label: undefined } : item),
  } : scene
  const labels = [...canvasArrowLabelLayouts(labelScene).values()].map((label) => ({
    ...label, x: label.x - label.width / 2, y: label.y - label.height / 2,
  }))
  let labelOverlaps = 0
  let labelNodeIntersections = 0
  let labelOverflows = 0
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index]
    if (label.x < 0 || label.y < 0 || label.x + label.width > scene.width || label.y + label.height > scene.height) {
      labelOverflows += 1
      issues.push({ code: 'label-outside-canvas', severity: 'warning', message: `${label.id} 的关系标签超出画布`, elementIds: [label.id] })
    }
    boxIndex.beginQuery()
    const candidates: number[] = []
    boxIndex.query(label, candidates)
    candidates.sort((left, right) => left - right)
    for (const index of candidates) {
      const box = boxes[index]
      if (!boxesOverlap(label, box)) continue
      labelNodeIntersections += 1
      issues.push({ code: 'label-through-node', severity: 'warning', message: `${label.id} 的关系标签遮挡 ${box.text}`, elementIds: [label.id, box.id] })
    }
    for (let otherIndex = index + 1; otherIndex < labels.length; otherIndex += 1) {
      const other = labels[otherIndex]
      if (!boxesOverlap(label, other)) continue
      labelOverlaps += 1
      issues.push({ code: 'label-overlap', severity: 'warning', message: `${label.id} 与 ${other.id} 的关系标签重叠`, elementIds: [label.id, other.id] })
    }
  }

  let longLabels = 0
  for (const box of boxes) {
    // note 是说明性注释，不是节点标题，不适用标题短句化规则。
    if (box.type === 'note') continue
    if (box.text.length <= 48 && (box.subtitle?.length ?? 0) <= 44) continue
    longLabels += 1
    issues.push({
      code: 'long-label',
      severity: 'warning',
      message: `${box.text.slice(0, 28)}${box.text.length > 28 ? '…' : ''} 的节点文字过长，建议标题短句化并把解释移到 description`,
      elementIds: [box.id],
    })
  }
  for (const arrow of arrows) {
    if ((arrow.label?.length ?? 0) <= 36) continue
    longLabels += 1
    issues.push({
      code: 'long-label',
      severity: 'warning',
      message: `${arrow.label?.slice(0, 28)}… 的关系标签过长，建议只保留协议、动作或关键语义`,
      elementIds: [arrow.id],
    })
  }

  if (scene.architecture && boxes.length >= 12 && !(scene.groups?.length) && !(scene.lanes?.length)) {
    issues.push({
      code: 'flat-architecture',
      severity: 'warning',
      message: `架构图包含 ${boxes.length} 个节点但没有 Group/Lane 层级，建议先建立系统边界或职责分区`,
      elementIds: boxes.map((item) => item.id),
    })
  }

  return {
    needsRevision: issues.length > 0,
    issues: dedupeIssues(issues),
    metrics: {
      nodes: boxes.length,
      arrows: arrows.length,
      groups: scene.groups?.length ?? 0,
      lanes: scene.lanes?.length ?? 0,
      nodeOverlaps,
      edgeNodeIntersections,
      edgeCrossings,
      edgeOverlaps,
      labelOverlaps,
      labelNodeIntersections,
      labelOverflows,
      longLabels,
    },
  }
}

function boxesOverlap(left: Pick<CanvasBox, 'x' | 'y' | 'width' | 'height'>, right: Pick<CanvasBox, 'x' | 'y' | 'width' | 'height'>): boolean {
  const inset = 2
  return left.x + inset < right.x + right.width - inset
    && left.x + left.width - inset > right.x + inset
    && left.y + inset < right.y + right.height - inset
    && left.y + left.height - inset > right.y + inset
}

function arrowRoute(arrow: CanvasArrow, boxes: Map<string, CanvasBox>): CanvasPoint[] | undefined {
  if (arrow.start && arrow.end) return canvasArrowRoutePoints(arrow.start, arrow.end, arrow)
  const from = boxes.get(arrow.from)
  const to = boxes.get(arrow.to)
  if (!from || !to) return undefined
  return canvasArrowBoxRoute(from, to, arrow, arrow.from === arrow.to)
}

function routeCutsBox(route: CanvasPoint[], box: CanvasBox): boolean {
  const rect = { x: box.x + 2, y: box.y + 2, width: Math.max(0, box.width - 4), height: Math.max(0, box.height - 4) }
  for (let index = 0; index < route.length - 1; index += 1) {
    if (segmentCutsRect(route[index], route[index + 1], rect)) return true
  }
  return false
}

function routesCross(left: CanvasPoint[], right: CanvasPoint[]): boolean {
  for (let leftIndex = 0; leftIndex < left.length - 1; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length - 1; rightIndex += 1) {
      if (strictSegmentsCross(left[leftIndex], left[leftIndex + 1], right[rightIndex], right[rightIndex + 1])) return true
    }
  }
  return false
}

function segmentCutsRect(a: CanvasPoint, b: CanvasPoint, rect: { x: number; y: number; width: number; height: number }): boolean {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const inside = (point: CanvasPoint) => point.x > left && point.x < right && point.y > top && point.y < bottom
  if (inside(a) || inside(b)) return true
  const topLeft = { x: left, y: top }
  const topRight = { x: right, y: top }
  const bottomLeft = { x: left, y: bottom }
  const bottomRight = { x: right, y: bottom }
  return strictSegmentsCross(a, b, topLeft, topRight)
    || strictSegmentsCross(a, b, topRight, bottomRight)
    || strictSegmentsCross(a, b, bottomRight, bottomLeft)
    || strictSegmentsCross(a, b, bottomLeft, topLeft)
}

function strictSegmentsCross(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint, d: CanvasPoint): boolean {
  const cross = (p: CanvasPoint, q: CanvasPoint, r: CanvasPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
}

function routesOverlap(left: CanvasPoint[], right: CanvasPoint[]): boolean {
  for (let i = 0; i < left.length - 1; i += 1) {
    const a = left[i]
    const b = left[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    for (let j = 0; j < right.length - 1; j += 1) {
      const c = right[j]
      const d = right[j + 1]
      if (Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)) / length > 0.01
        || Math.abs(dx * (d.y - a.y) - dy * (d.x - a.x)) / length > 0.01) continue
      const start = ((c.x - a.x) * dx + (c.y - a.y) * dy) / length
      const end = ((d.x - a.x) * dx + (d.y - a.y) * dy) / length
      if (Math.min(length, Math.max(start, end)) - Math.max(0, Math.min(start, end)) > 2) return true
    }
  }
  return false
}

function dedupeIssues(issues: CanvasQualityIssue[]): CanvasQualityIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}:${[...issue.elementIds].sort().join('|')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
