import type { MermaidDiagramType } from '../types.js'

export type DiagramCompositionPattern =
  | 'linear-flow'
  | 'decision-tree'
  | 'swimlane'
  | 'fan-out'
  | 'convergence'
  | 'interaction'
  | 'schema'
  | 'lifecycle'
  | 'hierarchy'
  | 'planning'
  | 'chronology'
  | 'version-history'
  | 'experience-journey'
  | 'positioning'
  | 'work-board'
  | 'traceability'
  | 'quantity-flow'
  | 'metrics'
  | 'composition'
  | 'multi-axis'
  | 'hierarchical-composition'
  | 'root-cause'

const compositionPatternLabels: Record<DiagramCompositionPattern, string> = {
  'linear-flow': '线性主链',
  'decision-tree': '决策树',
  swimlane: '泳道分工',
  'fan-out': '扇出',
  convergence: '汇聚',
  interaction: '交互时序',
  schema: '关系模式',
  lifecycle: '生命周期',
  hierarchy: '层级树',
  planning: '计划依赖',
  chronology: '时间轴',
  'version-history': '分支历史',
  'experience-journey': '体验旅程',
  positioning: '二维定位',
  'work-board': '工作看板',
  traceability: '需求追踪',
  'quantity-flow': '定量流向',
  metrics: '指标趋势',
  composition: '总体构成',
  'multi-axis': '多维对比',
  'hierarchical-composition': '层级面积构成',
  'root-cause': '根因鱼骨',
}

export interface DiagramSkill {
  type: MermaidDiagramType
  label: string
  intentHints: string[]
  compositionPatterns: DiagramCompositionPattern[]
  compositionRules: string[]
  densityRules: string[]
  visualRules: string[]
  evidenceRules: string[]
  antiPatterns: string[]
  generationRules: string[]
  modificationRules: string[]
  validationRules: string[]
}

export function skillPromptLines(skill: DiagramSkill, mode: 'generation' | 'modification'): string[] {
  return [
    `内置 ${skill.label} Skill：`,
    `构图原型：优先从 ${skill.compositionPatterns.map((pattern) => compositionPatternLabels[pattern]).join(' / ')} 中选择最符合语义的一种，不要默认堆成等权卡片阵列。`,
    ...skill.compositionRules,
    ...skill.densityRules,
    ...skill.visualRules,
    ...skill.evidenceRules.map((rule) => `证据：${rule}`),
    ...skill.antiPatterns.map((rule) => `避免：${rule}`),
    ...(mode === 'generation' ? skill.generationRules : skill.modificationRules),
    ...skill.validationRules.map((rule) => `回检：${rule}`),
  ]
}
