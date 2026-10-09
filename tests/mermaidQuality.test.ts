import assert from 'node:assert/strict'
import test from 'node:test'
import { assessMermaidVisualQuality } from '../src/mermaidQuality.js'

test('recommends splitting branch-heavy flowcharts instead of hiding complexity with tiny styling', () => {
  const source = ['flowchart TB', ...Array.from({ length: 24 }, (_, index) => `N${index}[步骤 ${index}] --> N${index + 1}[步骤 ${index + 1}]`), ...Array.from({ length: 6 }, (_, index) => `D${index}{判断 ${index}?} --> N${index}`)].join('\n')
  const quality = assessMermaidVisualQuality('flowchart', source)
  assert.equal(quality.density, 'dense')
  assert.equal(quality.splitRecommended, true)
  assert.ok(quality.reasons.some((reason) => reason.includes('总览 + 子流程')))
})

test('recommends collapsing a five-decision flowchart once relationship density is also high', () => {
  const source = ['flowchart TB', ...Array.from({ length: 5 }, (_, index) => `D${index}{判断 ${index}?}`), ...Array.from({ length: 18 }, (_, index) => `N${index}[步骤 ${index}] --> N${index + 1}[步骤 ${index + 1}]`)].join('\n')
  const quality = assessMermaidVisualQuality('flowchart', source)
  assert.equal(quality.splitRecommended, true)
  assert.ok(quality.reasons.some((reason) => reason.includes('折叠重试/异常细节')))
})

test('allows a dense but still bounded sequence diagram', () => {
  const source = ['sequenceDiagram', ...Array.from({ length: 10 }, (_, index) => `participant P${index}`), ...Array.from({ length: 24 }, (_, index) => `P${index % 10}->>P${(index + 1) % 10}: call ${index}`)].join('\n')
  const quality = assessMermaidVisualQuality('sequence', source)
  assert.equal(quality.density, 'dense')
  assert.equal(quality.splitRecommended, false)
})

test('recommends splitting an over-limit sequence by participants', () => {
  const source = ['sequenceDiagram', ...Array.from({ length: 11 }, (_, index) => `participant P${index}`), 'P0->>P1: call'].join('\n')
  const quality = assessMermaidVisualQuality('sequence', source)
  assert.equal(quality.splitRecommended, true)
  assert.equal(quality.metrics.participants, 11)
})

test('recommends splitting a sequence once meaningful messages exceed the single-view ceiling', () => {
  const source = ['sequenceDiagram', ...Array.from({ length: 9 }, (_, index) => `participant P${index}`), ...Array.from({ length: 25 }, (_, index) => `P${index % 9}->>P${(index + 1) % 9}: call ${index}`)].join('\n')
  const quality = assessMermaidVisualQuality('sequence', source)
  assert.equal(quality.density, 'dense')
  assert.equal(quality.splitRecommended, true)
  assert.ok(quality.reasons.some((reason) => reason.includes('消息 25 > 24')))
})

test('keeps a 15-entity ER model inside one bounded context view', () => {
  const source = ['erDiagram', ...Array.from({ length: 15 }, (_, index) => `E${index} { string id PK }`)].join('\n')
  const quality = assessMermaidVisualQuality('er', source)
  assert.equal(quality.splitRecommended, false)
  assert.equal(quality.metrics.entities, 15)
  assert.equal(quality.density, 'compact')
})
