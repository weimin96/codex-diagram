export const CANVAS_SHAPE_REFS = [
  'basic:rectangle',
  'basic:rounded',
  'basic:ellipse',
  'basic:diamond',
  'basic:triangle',
  'basic:hexagon',
  'basic:cloud',
  'flowchart:process',
  'flowchart:decision',
  'flowchart:terminator',
  'flowchart:data',
  'flowchart:document',
  'flowchart:database',
  'flowchart:subprocess',
  'flowchart:manual-input',
  'flowchart:preparation',
  'flowchart:delay',
] as const

export type CanvasShapeRef = typeof CANVAS_SHAPE_REFS[number]
export type CanvasShapePack = 'basic' | 'flowchart'

export interface CanvasShapeDefinition {
  ref: CanvasShapeRef
  pack: CanvasShapePack
  label: string
  keywords: string[]
  width: number
  height: number
}

export interface CanvasShapeGeometry {
  bodyPath: string
  detailPaths: string[]
}

export const CANVAS_SHAPE_CATALOG: CanvasShapeDefinition[] = [
  { ref: 'basic:rectangle', pack: 'basic', label: '矩形', keywords: ['rectangle', 'rect', '方形'], width: 180, height: 88 },
  { ref: 'basic:rounded', pack: 'basic', label: '圆角矩形', keywords: ['rounded', 'card', '圆角'], width: 180, height: 88 },
  { ref: 'basic:ellipse', pack: 'basic', label: '椭圆', keywords: ['ellipse', 'circle', '圆'], width: 150, height: 96 },
  { ref: 'basic:diamond', pack: 'basic', label: '菱形', keywords: ['diamond', '菱形'], width: 140, height: 100 },
  { ref: 'basic:triangle', pack: 'basic', label: '三角形', keywords: ['triangle', '三角'], width: 140, height: 104 },
  { ref: 'basic:hexagon', pack: 'basic', label: '六边形', keywords: ['hexagon', '六边形'], width: 160, height: 96 },
  { ref: 'basic:cloud', pack: 'basic', label: '云', keywords: ['cloud', '云'], width: 170, height: 104 },
  { ref: 'flowchart:process', pack: 'flowchart', label: '处理', keywords: ['process', '步骤', '处理'], width: 180, height: 84 },
  { ref: 'flowchart:decision', pack: 'flowchart', label: '判断', keywords: ['decision', '判断', '条件'], width: 140, height: 104 },
  { ref: 'flowchart:terminator', pack: 'flowchart', label: '开始 / 结束', keywords: ['terminator', 'start', 'end', '开始', '结束'], width: 164, height: 72 },
  { ref: 'flowchart:data', pack: 'flowchart', label: '数据', keywords: ['data', 'input', 'output', '输入', '输出'], width: 176, height: 84 },
  { ref: 'flowchart:document', pack: 'flowchart', label: '文档', keywords: ['document', 'file', '文档'], width: 170, height: 96 },
  { ref: 'flowchart:database', pack: 'flowchart', label: '数据库', keywords: ['database', 'storage', '数据库', '存储'], width: 156, height: 108 },
  { ref: 'flowchart:subprocess', pack: 'flowchart', label: '子流程', keywords: ['subprocess', 'subroutine', '子流程'], width: 184, height: 84 },
  { ref: 'flowchart:manual-input', pack: 'flowchart', label: '手工输入', keywords: ['manual', 'input', '手工', '输入'], width: 176, height: 84 },
  { ref: 'flowchart:preparation', pack: 'flowchart', label: '准备', keywords: ['preparation', '初始化', '准备'], width: 164, height: 88 },
  { ref: 'flowchart:delay', pack: 'flowchart', label: '等待 / 延迟', keywords: ['delay', 'wait', '等待', '延迟'], width: 158, height: 88 },
]

const shapeRefSet = new Set<string>(CANVAS_SHAPE_REFS)
const shapeByRef = new Map(CANVAS_SHAPE_CATALOG.map((shape) => [shape.ref, shape]))

export function isCanvasShapeRef(value: unknown): value is CanvasShapeRef {
  return typeof value === 'string' && shapeRefSet.has(value)
}

export function canvasShapeDefinition(ref: CanvasShapeRef): CanvasShapeDefinition {
  return shapeByRef.get(ref)!
}

export function canvasShapeGeometry(ref: CanvasShapeRef, width: number, height: number, cornerRadius?: number): CanvasShapeGeometry {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const pad = Math.min(w, h) * 0.16
  switch (ref) {
    case 'basic:rounded':
      return { bodyPath: roundedRectPath(w, h, cornerRadius ?? Math.min(16, h * 0.22)), detailPaths: [] }
    case 'basic:ellipse':
      return { bodyPath: `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`, detailPaths: [] }
    case 'basic:diamond':
    case 'flowchart:decision':
      return { bodyPath: `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`, detailPaths: [] }
    case 'basic:triangle':
      return { bodyPath: `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`, detailPaths: [] }
    case 'basic:hexagon':
    case 'flowchart:preparation':
      return { bodyPath: `M ${pad} 0 L ${w - pad} 0 L ${w} ${h / 2} L ${w - pad} ${h} L ${pad} ${h} L 0 ${h / 2} Z`, detailPaths: [] }
    case 'basic:cloud': {
      const y = h * 0.58
      return {
        bodyPath: `M ${w * 0.18} ${h * 0.78} C ${w * 0.04} ${h * 0.78}, ${w * 0.02} ${h * 0.52}, ${w * 0.18} ${h * 0.48} C ${w * 0.16} ${h * 0.29}, ${w * 0.39} ${h * 0.20}, ${w * 0.50} ${h * 0.36} C ${w * 0.61} ${h * 0.15}, ${w * 0.85} ${h * 0.30}, ${w * 0.82} ${h * 0.50} C ${w * 0.99} ${h * 0.51}, ${w * 0.99} ${h * 0.78}, ${w * 0.82} ${h * 0.78} Z`,
        detailPaths: [`M ${w * 0.18} ${y} C ${w * 0.30} ${h * 0.48}, ${w * 0.36} ${h * 0.57}, ${w * 0.43} ${h * 0.61}`],
      }
    }
    case 'flowchart:terminator':
      return { bodyPath: roundedRectPath(w, h, h / 2), detailPaths: [] }
    case 'flowchart:data':
      return { bodyPath: `M ${pad} 0 L ${w} 0 L ${w - pad} ${h} L 0 ${h} Z`, detailPaths: [] }
    case 'flowchart:document':
      return { bodyPath: `M 0 0 L ${w} 0 L ${w} ${h * 0.78} C ${w * 0.74} ${h * 0.64}, ${w * 0.50} ${h * 0.94}, 0 ${h * 0.79} Z`, detailPaths: [] }
    case 'flowchart:database': {
      const ry = Math.max(8, h * 0.13)
      return {
        bodyPath: `M 0 ${ry} C 0 0, ${w} 0, ${w} ${ry} L ${w} ${h - ry} C ${w} ${h}, 0 ${h}, 0 ${h - ry} Z`,
        detailPaths: [`M 0 ${ry} C 0 ${ry * 2}, ${w} ${ry * 2}, ${w} ${ry}`],
      }
    }
    case 'flowchart:subprocess':
      return { bodyPath: `M 0 0 H ${w} V ${h} H 0 Z`, detailPaths: [`M ${pad * 0.72} 0 V ${h}`, `M ${w - pad * 0.72} 0 V ${h}`] }
    case 'flowchart:manual-input':
      return { bodyPath: `M ${pad} 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`, detailPaths: [] }
    case 'flowchart:delay':
      return { bodyPath: `M 0 0 H ${w * 0.64} C ${w} 0, ${w} ${h}, ${w * 0.64} ${h} H 0 Z`, detailPaths: [] }
    case 'flowchart:process':
    case 'basic:rectangle':
      if (cornerRadius && cornerRadius > 0) return { bodyPath: roundedRectPath(w, h, cornerRadius), detailPaths: [] }
      return { bodyPath: `M 0 0 H ${w} V ${h} H 0 Z`, detailPaths: [] }
    default:
      return { bodyPath: `M 0 0 H ${w} V ${h} H 0 Z`, detailPaths: [] }
  }
}

function roundedRectPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  if (!r) return `M 0 0 H ${width} V ${height} H 0 Z`
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`
}
