import type { MermaidDiagramType } from '../types.js'
import type { DiagramSkill } from './types.js'
import { flowchartSkill } from './flowchart.js'
import { sequenceSkill } from './sequence.js'
import { erSkill } from './er.js'
import { stateSkill } from './state.js'
import { mindmapSkill } from './mindmap.js'
import { supplementalSkills } from './supplemental.js'

const skills = new Map<MermaidDiagramType, DiagramSkill>([
  flowchartSkill,
  sequenceSkill,
  erSkill,
  stateSkill,
  mindmapSkill,
  ...supplementalSkills,
].map((item) => [item.type, item]))

export function diagramSkill(type: MermaidDiagramType): DiagramSkill {
  const skill = skills.get(type)
  if (!skill) throw new Error(`Missing Diagram Skill for ${type}`)
  return skill
}

export function allDiagramSkills(): DiagramSkill[] {
  return [...skills.values()]
}

export function diagramIntentRoutingGuide(): string[] {
  return [
    '类型路由：流程/审批/决策链 → flowchart；调用顺序/API/MQ 交互 → sequence；数据实体/表关系 → er；生命周期 → state；知识拆解 → mindmap。',
    '静态软件系统/模块/服务边界不要退化成 flowchart，应使用 Canvas Architecture/C4。',
    '计划排期 → gantt；历史里程碑 → timeline；代码分支合并 → gitgraph；用户触点体验 → journey；二维优先级/定位 → quadrant。',
  ]
}
