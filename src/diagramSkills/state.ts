import type { DiagramSkill } from './types.js'
import { commonMermaidModificationRules, commonMermaidVisualRules } from './common.js'

export const stateSkill: DiagramSkill = {
  type: 'state',
  label: 'State Diagram',
  intentHints: ['状态机', '状态流转', '生命周期', '订单状态', '任务状态'],
  compositionRules: [
    '先列出稳定业务状态，再从真实命令/事件/条件推导 transition；状态是“持续条件”，动作是边，不要把动作名当状态名。',
    '必须明确初始状态、正常终态，以及真实存在的取消/失败/过期等异常终态。',
    '条件复杂时使用 transition label 表达触发事件和 guard；并发子状态或嵌套生命周期确有必要时才使用 composite state。',
    '双向跳转必须有不同触发条件；不要生成没有业务依据的任意状态互跳。',
  ],
  densityRules: ['8 个状态以内保持平面状态机；更复杂时按生命周期阶段或 composite state 分层。'],
  visualRules: [...commonMermaidVisualRules, '正常主生命周期形成稳定方向，失败/取消状态位于主链侧边，不与正常终态混在一排。'],
  antiPatterns: ['把 API 方法名当状态', '只有节点没有 transition 条件', '每个状态都能跳到每个状态', '遗漏终态'],
  generationRules: ['优先读取状态枚举、状态字段更新点、状态机配置和业务 guard，再生成 stateDiagram-v2。'],
  modificationRules: [...commonMermaidModificationRules, '新增 transition 时检查起止状态是否已存在，并保留已有合法生命周期顺序。'],
}
