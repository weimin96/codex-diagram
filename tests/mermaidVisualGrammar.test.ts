import assert from 'node:assert/strict'
import test from 'node:test'
import { mermaidVisualConfig, mermaidVisualProfile, resolveMermaidVisualDensity } from '../src/mermaidVisualGrammar.js'

const palette = {
  background: '#ffffff', surface: '#fafafa', raised: '#f4f4f5', muted: '#eeeeef', text: '#18181b', secondaryText: '#6b7280',
  border: '#d4d4d8', strongBorder: '#a1a1aa', accent: '#2563eb', success: '#16803a', warning: '#b45309', danger: '#c9362b',
}

test('visual grammar applies type-aware spacing and semantic theme variables', () => {
  const config = mermaidVisualConfig('sequence', palette)
  assert.equal(config.sequence?.actorMargin, 72)
  assert.equal(config.sequence?.mirrorActors, false)
  assert.equal(config.themeVariables?.actorBkg, palette.raised)
  assert.equal(config.themeVariables?.signalColor, palette.secondaryText)
})

test('ER, state and mindmap use distinct layout policies', () => {
  const er = mermaidVisualConfig('er', palette)
  const state = mermaidVisualConfig('state', palette)
  const mindmap = mermaidVisualConfig('mindmap', palette)
  assert.equal(er.er?.layoutDirection, 'LR')
  assert.equal(state.state?.defaultRenderer, 'dagre-wrapper')
  assert.equal(state.look, 'neo')
  assert.equal(mindmap.mindmap?.maxNodeWidth, 190)
  assert.equal(mindmap.look, 'classic')
  assert.equal(mermaidVisualProfile('er'), 'schema')
  assert.equal(mermaidVisualProfile('state'), 'lifecycle')
  assert.equal(mermaidVisualProfile('mindmap'), 'hierarchy')
})

test('planning and positioning diagrams share tokens but retain specialized geometry', () => {
  const config = mermaidVisualConfig('gantt', palette)
  assert.equal(config.gantt?.displayMode, 'compact')
  assert.equal(config.themeVariables?.activeTaskBkgColor, palette.accent)
  const quadrant = mermaidVisualConfig('quadrant', palette)
  assert.equal(quadrant.quadrantChart?.chartWidth, 620)
  assert.equal(quadrant.themeVariables?.quadrantPointFill, palette.accent)
})

test('visual density compacts large sequence and ER diagrams without changing source', () => {
  const sequence = ['sequenceDiagram', ...Array.from({ length: 10 }, (_, index) => `participant P${index}`), ...Array.from({ length: 32 }, (_, index) => `P${index % 10}->>P${(index + 1) % 10}: call`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('sequence', sequence), 'dense')
  assert.equal(mermaidVisualConfig('sequence', palette, sequence).sequence?.actorMargin, 46)

  const er = ['erDiagram', ...Array.from({ length: 12 }, (_, index) => `E${index} {\n string id PK\n}`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('er', er), 'compact')
  assert.equal(mermaidVisualConfig('er', palette, er).er?.entityPadding, 10)
})
