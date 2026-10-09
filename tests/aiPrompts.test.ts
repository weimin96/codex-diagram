import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGenerationPrompt } from '../src/aiPrompts.js'

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
