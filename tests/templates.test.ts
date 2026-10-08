import assert from 'node:assert/strict'
import test from 'node:test'
import { createTemplate, detectDiagramType } from '../src/templates.js'
import { mermaidDiagramTypes } from '../src/types.js'

test('creates and detects every registered Mermaid diagram template', () => {
  for (const item of mermaidDiagramTypes) {
    const source = createTemplate(item.type, `测试 ${item.label}`)
    assert.equal(detectDiagramType(source), item.type, `${item.type} should round-trip through detection`)
  }
})

test('recognizes graph syntax as flowchart and ignores Mermaid comments', () => {
  assert.equal(detectDiagramType('%% comment\ngraph LR\n A --> B\n'), 'flowchart')
})
