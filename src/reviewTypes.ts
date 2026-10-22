export interface DiagramProposalSummary {
  path: string
  reason?: string
  baseModifiedAt: string
  updatedAt: string
  scopeElementIds?: string[]
  newElementIds?: string[]
  impactElementIds?: string[]
  automaticElementIds?: string[]
  branchId?: string
  branchLabel?: string
  branchGroupId?: string
  rebaseable?: boolean
  patchSummary?: {
    updated: number
    added: number
    removed: number
    layout: 'preserve' | 'local'
  }
}

export interface DiagramPatchHistoryChange {
  id: string
  kind: 'add' | 'remove' | 'update'
  automatic: boolean
  declared: boolean
  label: string
  fields: string[]
}

export interface DiagramPatchHistoryEntry {
  id: string
  path: string
  appliedAt: string
  reason?: string
  layout: 'preserve' | 'local'
  rebased: boolean
  partial: boolean
  acceptedElementIds?: string[]
  scopeElementIds: string[]
  automaticElementIds: string[]
  proposalBranchId?: string
  proposalBranchLabel?: string
  proposalBranchGroupId?: string
  dependsOnIds: string[]
  dependentIds: string[]
  dependencyDepth: number
  undoneAt?: string
  undoEventId?: string
  undoBatchId?: string
  redoneAt?: string
  redoEventId?: string
  redoBatchId?: string
  counts: { updated: number; added: number; removed: number; automatic: number }
  changes: DiagramPatchHistoryChange[]
}

export interface DiagramGitImpactResult {
  kind: 'diagram-git-impact'
  updatedAt: string
  workspacePath: string
  path: string
  direction: 'upstream' | 'downstream' | 'both'
  depth: number
  git: {
    repoRoot: string
    workspacePrefix: string
    baseRef?: string
    files: Array<{ path: string; kinds: string[] }>
  }
  matchedFiles: Array<{ path: string; kinds: string[]; elementIds: string[] }>
  unmatchedFiles: Array<{ path: string; kinds: string[] }>
  directElementIds: string[]
  buckets: Array<{ distance: number; elementIds: string[] }>
  trace: {
    nodeIds: string[]
    arrowIds: string[]
    distanceById: Record<string, number>
    nodes: Array<{ id: string; text: string; distance: number }>
  }
}

