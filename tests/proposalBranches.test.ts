import assert from 'node:assert/strict'
import test from 'node:test'
import { addProposalBranch, selectProposalBranch, type BranchableProposal } from '../src/proposalBranches.js'

interface TestProposal extends BranchableProposal {
  value: string
}

function proposal(value: string, revision = 'r1'): TestProposal {
  return {
    workspacePath: '/workspace',
    path: 'docs/diagrams/system.diagram.json',
    baseModifiedAt: revision,
    value,
  }
}

function ids() {
  let index = 0
  return () => `id-${++index}`
}

test('groups labeled candidates that share the same base revision', () => {
  const idFactory = ids()
  const first = addProposalBranch<TestProposal>(undefined, proposal('A'), '保守方案', { idFactory })
  const second = addProposalBranch(first.set, proposal('B'), '重构方案', { idFactory })
  assert.equal(second.set.proposals.length, 2)
  assert.equal(second.set.groupId, first.set.groupId)
  assert.equal(second.set.activeBranchId, second.proposal.branchId)
  assert.deepEqual(second.set.proposals.map((item) => item.branchLabel), ['保守方案', '重构方案'])
})

test('replaces a candidate with the same label while preserving its branch id', () => {
  const idFactory = ids()
  const first = addProposalBranch<TestProposal>(undefined, proposal('A1'), '方案 A', { idFactory })
  const replacement = addProposalBranch(first.set, proposal('A2'), '方案 A', { idFactory })
  assert.equal(replacement.set.proposals.length, 1)
  assert.equal(replacement.proposal.branchId, first.proposal.branchId)
  assert.equal(replacement.proposal.value, 'A2')
})

test('starts a new branch group when the base revision changes', () => {
  const idFactory = ids()
  const first = addProposalBranch<TestProposal>(undefined, proposal('A', 'r1'), '方案 A', { idFactory })
  const nextRevision = addProposalBranch(first.set, proposal('B', 'r2'), '方案 B', { idFactory })
  assert.notEqual(nextRevision.set.groupId, first.set.groupId)
  assert.equal(nextRevision.set.proposals.length, 1)
  assert.equal(nextRevision.proposal.branchLabel, '方案 B')
})

test('selects a proposal branch without changing candidate contents', () => {
  const idFactory = ids()
  const first = addProposalBranch<TestProposal>(undefined, proposal('A'), '方案 A', { idFactory })
  const second = addProposalBranch(first.set, proposal('B'), '方案 B', { idFactory })
  const selected = selectProposalBranch(second.set, first.proposal.branchId!)
  assert.equal(selected.set.activeBranchId, first.proposal.branchId)
  assert.equal(selected.proposal.value, 'A')
  assert.equal(selected.set.proposals.length, 2)
})

test('bounds the number of alternatives in one branch group', () => {
  const idFactory = ids()
  let current = addProposalBranch<TestProposal>(undefined, proposal('0'), '方案 0', { idFactory, maxBranches: 3 }).set
  current = addProposalBranch(current, proposal('1'), '方案 1', { idFactory, maxBranches: 3 }).set
  current = addProposalBranch(current, proposal('2'), '方案 2', { idFactory, maxBranches: 3 }).set
  assert.throws(() => addProposalBranch(current, proposal('3'), '方案 3', { idFactory, maxBranches: 3 }), /最多保留 3 个方案/)
})
