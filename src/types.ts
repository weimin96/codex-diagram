export type MermaidDiagramType = 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap' | 'gantt' | 'timeline' | 'gitgraph' | 'journey' | 'quadrant'
export type DiagramType = MermaidDiagramType | 'canvas'
export type DiagramSurface = 'workspace' | 'thread'

export interface DiagramSummary {
  path: string
  name: string
  type: DiagramType | 'unknown'
  modifiedAt: string
}

export interface DiagramDocument extends DiagramSummary {
  source: string
}

export interface DiagramRevision {
  path: string
  modifiedAt: string
}

export interface WorkspaceSnapshot {
  kind: 'workspace'
  surface?: DiagramSurface
  workspacePath?: string
  recentWorkspaces: string[]
  diagrams: DiagramSummary[]
  activeDiagramPath?: string
}

export const mermaidDiagramTypes: Array<{ type: MermaidDiagramType; label: string }> = [
  { type: 'flowchart', label: '流程图' },
  { type: 'sequence', label: '时序图' },
  { type: 'mindmap', label: '思维脑图' },
  { type: 'class', label: '类图' },
  { type: 'er', label: 'ER 图' },
  { type: 'state', label: '状态图' },
  { type: 'gantt', label: '甘特图' },
  { type: 'timeline', label: '时间线' },
  { type: 'gitgraph', label: 'Git 分支图' },
  { type: 'journey', label: '用户旅程' },
  { type: 'quadrant', label: '四象限图' },
]

export const diagramTypes: Array<{ type: DiagramType; label: string }> = [
  ...mermaidDiagramTypes,
  { type: 'canvas', label: '自由画布' },
]

const mermaidTypeSet = new Set<MermaidDiagramType>(mermaidDiagramTypes.map((item) => item.type))

export function isMermaidDiagramType(value: string): value is MermaidDiagramType {
  return mermaidTypeSet.has(value as MermaidDiagramType)
}
