import type { MermaidDiagramType } from '../types.js'

export interface DiagramSkill {
  type: MermaidDiagramType
  label: string
  intentHints: string[]
  compositionRules: string[]
  densityRules: string[]
  visualRules: string[]
  antiPatterns: string[]
  generationRules: string[]
  modificationRules: string[]
}

export function skillPromptLines(skill: DiagramSkill, mode: 'generation' | 'modification'): string[] {
  return [
    `内置 ${skill.label} Skill：`,
    ...skill.compositionRules,
    ...skill.densityRules,
    ...skill.visualRules,
    ...skill.antiPatterns.map((rule) => `避免：${rule}`),
    ...(mode === 'generation' ? skill.generationRules : skill.modificationRules),
  ]
}
