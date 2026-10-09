import assert from 'node:assert/strict'
import test from 'node:test'
import { mermaidVisualConfig, mermaidVisualProfile, normalizeMermaidSourceForRender, resolveMermaidVisualDensity, resolveMermaidVisualStyle } from '../src/mermaidVisualGrammar.js'

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
  assert.equal(mermaidVisualConfig('sequence', palette, sequence).sequence?.actorMargin, 34)

  const boundedDenseSequence = ['sequenceDiagram', ...Array.from({ length: 9 }, (_, index) => `participant P${index}`), ...Array.from({ length: 22 }, (_, index) => `P${index % 9}->>P${(index + 1) % 9}: call`), 'alt retry', 'P1->>P2: retry', 'end'].join('\n')
  assert.equal(resolveMermaidVisualDensity('sequence', boundedDenseSequence), 'dense')

  const er = ['erDiagram', ...Array.from({ length: 12 }, (_, index) => `E${index} {\n string id PK\n}`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('er', er), 'compact')
  assert.equal(mermaidVisualConfig('er', palette, er).er?.entityPadding, 10)

  const inlineEr = ['erDiagram', ...Array.from({ length: 15 }, (_, index) => `E${index} { string id PK }`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('er', inlineEr), 'compact')
  assert.equal(mermaidVisualConfig('er', palette, inlineEr).er?.entityPadding, 10)
})

test('data visualizations use dedicated chart grammar instead of generic Mermaid defaults', () => {
  const sankey = mermaidVisualConfig('sankey', palette)
  assert.equal(sankey.sankey?.linkColor, 'gradient')
  assert.equal(sankey.sankey?.showValues, true)
  assert.equal(mermaidVisualProfile('sankey'), 'flow-quantity')

  const xy = mermaidVisualConfig('xychart', palette)
  assert.equal(xy.xyChart?.showLegend, true)
  assert.equal(xy.themeVariables?.xyChart?.plotColorPalette, [palette.accent, palette.success, palette.warning, palette.danger, palette.secondaryText].join(','))

  const radar = mermaidVisualConfig('radar', palette)
  assert.equal(radar.radar?.width, 620)
  assert.equal(radar.themeVariables?.radar?.curveStrokeWidth, 2)
  assert.equal(mermaidVisualProfile('radar'), 'multi-axis')
})

test('analysis diagrams receive specialized readable geometry', () => {
  const requirement = mermaidVisualConfig('requirement', palette)
  assert.equal(requirement.requirement?.rect_fill, palette.raised)
  assert.equal(requirement.themeVariables?.requirementBorderColor, palette.strongBorder)

  const kanban = mermaidVisualConfig('kanban', palette)
  assert.equal(kanban.kanban?.sectionWidth, 250)

  const ishikawa = mermaidVisualConfig('ishikawa', palette)
  assert.equal(ishikawa.ishikawa?.useMaxWidth, true)
  assert.equal(mermaidVisualProfile('ishikawa'), 'root-cause')
})

test('dense treemaps preserve source values while hiding cramped numeric labels', () => {
  const source = ['treemap-beta', '"Root"', ...Array.from({ length: 36 }, (_, index) => `  "Item ${index}": ${index + 1}`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('treemap', source), 'dense')
  assert.equal(mermaidVisualConfig('treemap', palette, source).treemap?.showValues, false)
  assert.equal(mermaidVisualConfig('treemap', palette, source).treemap?.labelFontSize, 12)
})

test('large Sankey and Radar diagrams compact independently', () => {
  const sankey = ['sankey-beta', '', ...Array.from({ length: 29 }, (_, index) => `A${index},B${index},${index + 1}`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('sankey', sankey), 'dense')
  assert.equal(mermaidVisualConfig('sankey', palette, sankey).sankey?.nodePadding, 8)

  const radar = ['radar-beta', 'axis a["A"],b["B"],c["C"]', ...Array.from({ length: 5 }, (_, index) => `curve c${index}["C${index}"]{1,2,3}`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('radar', radar), 'dense')
  assert.equal(mermaidVisualConfig('radar', palette, radar).radar?.axisScaleFactor, 0.9)
})

test('large Kanban boards reduce column width without touching source', () => {
  const kanban = ['kanban', 'todo[Todo]', ...Array.from({ length: 18 }, (_, index) => `task${index}[Task ${index}]`)].join('\n')
  assert.equal(resolveMermaidVisualDensity('kanban', kanban), 'compact')
  assert.equal(mermaidVisualConfig('kanban', palette, kanban).kanban?.sectionWidth, 220)
})

test('branch-heavy flowcharts compact before they become oversized', () => {
  const source = [
    'flowchart TB',
    'subgraph approval[Approval]',
    'A --> B{Valid?}',
    'B -- yes --> C{Small?}',
    'C -- no --> D{Approved?}',
    'D -- yes --> E{Success?}',
    'E -- no --> F{Retry limit?}',
    'F -- no --> E',
    'end',
  ].join('\n')
  assert.equal(resolveMermaidVisualDensity('flowchart', source), 'dense')
  assert.equal(mermaidVisualConfig('flowchart', palette, source).flowchart?.rankSpacing, 32)
})

test('flowchart render normalization removes HTML line breaks without rewriting authored source', () => {
  const source = 'flowchart TB\n  A["Parse<br/>retry"] --> B[Done]\n'
  const normalized = normalizeMermaidSourceForRender('flowchart', source)
  assert.equal(normalized, 'flowchart TB\n  A["Parse retry"] --> B[Done]\n')
  assert.match(source, /<br\/>/)
  assert.equal(normalizeMermaidSourceForRender('sequence', source), source)
})

test('visual style directives select stable profiles without changing the diagram grammar', () => {
  assert.equal(resolveMermaidVisualStyle('flowchart LR\n  A --> B'), 'technical')
  assert.equal(resolveMermaidVisualStyle('%% codex-diagram:style=editorial\nflowchart LR\n  A --> B'), 'editorial')
  assert.equal(resolveMermaidVisualStyle('%% codex-diagram:style=presentation\nflowchart LR\n  A --> B'), 'presentation')

  const technical = mermaidVisualConfig('flowchart', palette, 'flowchart LR\n  A --> B')
  const minimal = mermaidVisualConfig('flowchart', palette, '%% codex-diagram:style=minimal\nflowchart LR\n  A --> B')
  const editorial = mermaidVisualConfig('flowchart', palette, '%% codex-diagram:style=editorial\nflowchart LR\n  A --> B')
  const presentation = mermaidVisualConfig('flowchart', palette, '%% codex-diagram:style=presentation\nflowchart LR\n  A --> B')

  assert.equal(technical.look, 'neo')
  assert.equal(minimal.look, 'classic')
  assert.equal(editorial.look, 'classic')
  assert.ok((minimal.flowchart?.nodeSpacing ?? 0) < (technical.flowchart?.nodeSpacing ?? 0))
  assert.ok((editorial.flowchart?.nodeSpacing ?? 0) > (technical.flowchart?.nodeSpacing ?? 0))
  assert.ok((presentation.flowchart?.nodeSpacing ?? 0) > (editorial.flowchart?.nodeSpacing ?? 0))
  assert.equal(presentation.themeVariables?.fontSize, '15px')
})
