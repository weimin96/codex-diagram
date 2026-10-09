import assert from 'node:assert/strict'
import test from 'node:test'
import { allDiagramSkills, diagramSkill } from '../src/diagramSkills/registry.js'
import { diagramTypeGroups, mermaidDiagramTypes } from '../src/types.js'

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

test('extended analysis and data diagram types have specialized skills', () => {
  for (const type of ['kanban', 'requirement', 'sankey', 'xychart', 'pie', 'radar', 'treemap', 'ishikawa'] as const) {
    const skill = diagramSkill(type)
    assert.equal(skill.type, type)
    assert.ok(skill.compositionRules.length >= 2, `${type} should have composition rules`)
    assert.ok(skill.antiPatterns.length >= 2, `${type} should have anti-pattern rules`)
    assert.ok(skill.generationRules.length >= 1, `${type} should have generation rules`)
  }
})

test('diagram type selector groups advanced types instead of flattening the menu', () => {
  const data = diagramTypeGroups.find((group) => group.category === 'data')
  const analysis = diagramTypeGroups.find((group) => group.category === 'analysis')
  const special = diagramTypeGroups.find((group) => group.category === 'special')
  assert.deepEqual(data?.items.map((item) => item.type), ['sankey', 'xychart', 'pie', 'radar', 'treemap'])
  assert.ok(analysis?.items.some((item) => item.type === 'kanban'))
  assert.ok(analysis?.items.some((item) => item.type === 'requirement'))
  assert.deepEqual(special?.items.map((item) => item.type), ['ishikawa'])
})

test('model-facing skills guard Mermaid 11.17 syntax traps found by browser benchmarks', () => {
  const sequence = diagramSkill('sequence')
  assert.ok(sequence.compositionRules.some((rule) => rule.includes('self-message') && rule.includes('EventBus')))

  const requirement = diagramSkill('requirement')
  assert.ok(requirement.compositionRules.some((rule) => rule.includes('text: "下单必须校验库存"')))
  assert.ok(requirement.compositionRules.some((rule) => rule.includes('unknown/none/unspecified')))
  assert.ok(requirement.compositionRules.some((rule) => rule.includes('test_case')))

  const ishikawa = diagramSkill('ishikawa')
  assert.ok(ishikawa.compositionRules.some((rule) => rule.includes('title/effect/category/cause')))

  const gantt = diagramSkill('gantt')
  assert.ok(gantt.compositionRules.some((rule) => rule.includes('after backend frontend')))
  assert.ok(gantt.compositionRules.some((rule) => rule.includes('after backend, frontend')))
})
