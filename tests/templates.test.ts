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

test('keeps lexer-sensitive extended templates browser-safe', () => {
  const requirement = createTemplate('requirement', '中文需求')
  assert.match(requirement, /text: "中文需求"/)

  const sankey = createTemplate('sankey', '流量去向')
  assert.match(sankey, /User,Entry,100/)
  assert.doesNotMatch(sankey, /用户|入口|完成|流失/)

  const xy = createTemplate('xychart', '指标趋势')
  assert.match(xy, /x-axis \["一月", "二月", "三月"\]/)
})
