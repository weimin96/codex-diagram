import assert from 'node:assert/strict'
import test from 'node:test'
import { allDiagramSkills, diagramSkill } from '../src/diagramSkills/registry.js'
import { mermaidDiagramTypes } from '../src/types.js'

test('every exposed Mermaid diagram type has a registered skill', () => {
  const exposed = mermaidDiagramTypes.map((item) => item.type).sort()
  const registered = allDiagramSkills().map((item) => item.type).sort()
  assert.deepEqual(registered, exposed)
})

test('primary diagram skills carry type-specific composition and anti-pattern rules', () => {
  for (const type of ['flowchart', 'sequence', 'er', 'state', 'mindmap'] as const) {
    const skill = diagramSkill(type)
    assert.ok(skill.compositionRules.length >= 3, `${type} should have deep composition rules`)
    assert.ok(skill.densityRules.length >= 1, `${type} should have density rules`)
    assert.ok(skill.antiPatterns.length >= 3, `${type} should have anti-pattern rules`)
    assert.ok(skill.generationRules.length >= 1, `${type} should have generation rules`)
  }
})

test('secondary diagram types still have dedicated skill rules instead of generic fallback', () => {
  for (const type of ['class', 'gantt', 'timeline', 'gitgraph', 'journey', 'quadrant'] as const) {
    const skill = diagramSkill(type)
    assert.equal(skill.type, type)
    assert.ok(skill.compositionRules.length > 0)
    assert.ok(skill.antiPatterns.length > 0)
  }
})
