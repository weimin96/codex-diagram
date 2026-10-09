import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGenerationPrompt, buildModificationPrompt, buildSubgraphModificationPrompt } from '../src/aiPrompts.js'
import type { DiagramDocument } from '../src/types.js'

test('builds a Canvas-specific generation contract without Mermaid instructions', () => {
  const prompt = buildGenerationPrompt('/workspace', {
    type: 'canvas',
    title: 'Platform Map',
    scope: 'src/',
    instructions: '突出外部依赖',
  })
  assert.match(prompt, /type=codex-diagram-canvas/)
  assert.match(prompt, /node、note、arrow/)
  assert.match(prompt, /labelPosition/)
  assert.match(prompt, /不要写 Mermaid 语法/)
  assert.match(prompt, /src\//)
})

test('keeps Mermaid generation instructions for structured diagrams', () => {
  const prompt = buildGenerationPrompt('/workspace', {
    type: 'sequence',
    title: 'Request Flow',
    scope: '',
    instructions: '',
  })
  assert.match(prompt, /生成一张 Mermaid 图表/)
  assert.match(prompt, /diagram\.create/)
  assert.match(prompt, /Mermaid 必须可渲染/)
})

test('prefers incremental Canvas patches for finite conversational edits', () => {
  const diagram = {
    type: 'canvas',
    title: 'Architecture',
    name: 'architecture',
    path: 'docs/diagrams/architecture.diagram.json',
    source: '{}',
    modifiedAt: '2026-10-09T00:00:00.000Z',
  } as DiagramDocument
  const prompt = buildModificationPrompt('/workspace', diagram, '给 API 增加缓存依赖')
  assert.match(prompt, /diagram\.proposeSubgraphPatch/)
  assert.match(prompt, /diagram\.getSubgraph/)
  assert.match(prompt, /不要把未变化的 x\/y\/width\/height/)
  assert.match(prompt, /layout 默认 preserve/)
  assert.match(prompt, /branchLabel/)
  assert.match(prompt, /只有用户明确要求多个方案/)
})

test('subgraph modification prompt sends deltas instead of a full Canvas document', () => {
  const diagram = {
    type: 'canvas',
    title: 'Architecture',
    name: 'architecture',
    path: 'docs/diagrams/architecture.diagram.json',
    source: '{}',
    modifiedAt: '2026-10-09T00:00:00.000Z',
  } as DiagramDocument
  const prompt = buildSubgraphModificationPrompt('/workspace', diagram, ['api'], '增加 Redis')
  assert.match(prompt, /diagram\.getSubgraph/)
  assert.match(prompt, /diagram\.proposeSubgraphPatch/)
  assert.match(prompt, /不要生成或传回完整 Canvas JSON/)
  assert.match(prompt, /新增 node\/note 可以省略 x\/y/)
  assert.match(prompt, /branchLabel/)
})
