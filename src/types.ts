export type DiagramType = 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap'

export interface DiagramSummary {
  path: string
  name: string
  type: DiagramType | 'unknown'
  modifiedAt: string
}

export interface DiagramDocument extends DiagramSummary {
  source: string
}

export interface WorkspaceSnapshot {
  kind: 'workspace'
  workspacePath?: string
  recentWorkspaces: string[]
  diagrams: DiagramSummary[]
}

export const diagramTypes: Array<{ type: DiagramType; label: string }> = [
  { type: 'flowchart', label: '流程图' },
  { type: 'sequence', label: '时序图' },
  { type: 'mindmap', label: '思维脑图' },
  { type: 'class', label: '类图' },
  { type: 'er', label: 'ER 图' },
  { type: 'state', label: '状态图' },
]
