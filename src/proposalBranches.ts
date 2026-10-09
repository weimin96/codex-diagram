import { randomUUID } from 'node:crypto'

export interface BranchableProposal {
  workspacePath: string
  path: string
  baseModifiedAt: string
  branchId?: string
  branchLabel?: string
  branchGroupId?: string
}

export interface ProposalBranchSet<T extends BranchableProposal> {
  groupId: string
  workspacePath: string
  path: string
  baseModifiedAt: string
  activeBranchId: string
  proposals: T[]
}

export function addProposalBranch<T extends BranchableProposal>(
  existing: ProposalBranchSet<T> | undefined,
  proposal: T,
  branchLabel: string,
  options: { maxBranches?: number; idFactory?: () => string } = {},
): { set: ProposalBranchSet<T>; proposal: T } {
  const label = branchLabel.trim().slice(0, 80)
  if (!label) throw new Error('候选分支名称不能为空。')
  const maxBranches = Math.max(2, Math.min(12, options.maxBranches ?? 6))
  const idFactory = options.idFactory ?? randomUUID
  const compatible = Boolean(existing
    && existing.workspacePath === proposal.workspacePath
    && existing.path === proposal.path
    && existing.baseModifiedAt === proposal.baseModifiedAt)
  const set: ProposalBranchSet<T> = compatible && existing
    ? { ...existing, proposals: [...existing.proposals] }
    : {
        groupId: idFactory(),
        workspacePath: proposal.workspacePath,
        path: proposal.path,
        baseModifiedAt: proposal.baseModifiedAt,
        activeBranchId: '',
        proposals: [],
      }
  const sameLabelIndex = set.proposals.findIndex((item) => item.branchLabel === label)
  const branchId = sameLabelIndex >= 0 ? set.proposals[sameLabelIndex].branchId! : idFactory()
  const next = { ...proposal, branchId, branchLabel: label, branchGroupId: set.groupId }
  if (sameLabelIndex >= 0) set.proposals[sameLabelIndex] = next
  else {
    if (set.proposals.length >= maxBranches) throw new Error(`同一组 AI 候选最多保留 ${maxBranches} 个方案，请先接受或拒绝现有候选。`)
    set.proposals.push(next)
  }
  set.activeBranchId = branchId
  return { set, proposal: next }
}

export function selectProposalBranch<T extends BranchableProposal>(set: ProposalBranchSet<T>, branchId: string): { set: ProposalBranchSet<T>; proposal: T } {
  const proposal = set.proposals.find((item) => item.branchId === branchId)
  if (!proposal) throw new Error('找不到这个 AI 候选分支，可能已被替换或清理。')
  return { set: { ...set, activeBranchId: branchId }, proposal }
}
