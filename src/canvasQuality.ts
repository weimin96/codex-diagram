import {
  anchorPoint,
  canvasArrowRoutePoints,
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
    longLabels: number
  }
}

type CanvasBox = CanvasNode | CanvasNote

export function assessCanvasVisualQuality(scene: CanvasScene): CanvasVisualQualityAssessment {
  const boxes = scene.elements.filter((item): item is CanvasBox => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const boxById = new Map(boxes.map((item) => [item.id, item]))
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
    for (const box of boxes) {
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
  for (let leftIndex = 0; leftIndex < arrows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < arrows.length; rightIndex += 1) {
      const left = arrows[leftIndex]
      const right = arrows[rightIndex]
      const leftRoute = routes.get(left.id)
      const rightRoute = routes.get(right.id)
      if (!leftRoute || !rightRoute) continue
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

  let longLabels = 0
  for (const box of boxes) {
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
      longLabels,
    },
  }
}

function boxesOverlap(left: CanvasBox, right: CanvasBox): boolean {
  const inset = 2
  return left.x + inset < right.x + right.width - inset
    && left.x + left.width - inset > right.x + inset
    && left.y + inset < right.y + right.height - inset
    && left.y + left.height - inset > right.y + inset
}

function arrowRoute(arrow: CanvasArrow, boxes: Map<string, CanvasBox>): CanvasPoint[] | undefined {
  const from = boxes.get(arrow.from)
  const to = boxes.get(arrow.to)
  if (!from || !to) return undefined
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
  const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
  return canvasArrowRoutePoints(start, end, arrow)
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
