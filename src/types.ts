export type MermaidDiagramType = 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap'
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
]

export const diagramTypes: Array<{ type: DiagramType; label: string }> = [
  ...mermaidDiagramTypes,
  { type: 'canvas', label: '自由画布' },
]
