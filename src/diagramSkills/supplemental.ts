import type { DiagramCompositionPattern, DiagramSkill } from './types.js'
import { commonMermaidEvidenceRules, commonMermaidModificationRules, commonMermaidValidationRules, commonMermaidVisualRules } from './common.js'

const supplementalPatterns: Partial<Record<DiagramSkill['type'], DiagramCompositionPattern[]>> = {
  class: ['schema'],
  gantt: ['planning'],
  timeline: ['chronology'],
  gitgraph: ['version-history'],
  journey: ['experience-journey'],
  quadrant: ['positioning'],
}

function skill(type: DiagramSkill['type'], label: string, compositionRules: string[], densityRules: string[], antiPatterns: string[], generationRules: string[]): DiagramSkill {
  return {
    type,
    label,
    intentHints: [],
    compositionPatterns: supplementalPatterns[type] ?? ['linear-flow'],
    compositionRules,
    densityRules,
    visualRules: commonMermaidVisualRules,
    evidenceRules: commonMermaidEvidenceRules,
    antiPatterns,
    generationRules,
    modificationRules: commonMermaidModificationRules,
    validationRules: commonMermaidValidationRules,
  }
}

export const supplementalSkills: DiagramSkill[] = [
  skill('class', 'Class Diagram', [
    '只展示对设计有意义的类、接口、继承/实现/组合关系；成员只保留核心公开 API 和决定职责的字段。',
    '接口/抽象类与实现类分层组织，组合/聚合优先表达所有权，不把所有依赖都画成 association。',
  ], ['超过约 15 个类时按 package/domain 拆图。'], ['把每个 DTO/工具类都加入类图', '列出完整 getter/setter'], ['优先读取真实类型定义和继承关系。']),
  skill('gantt', 'Gantt', [
    '任务按阶段 section 分组，明确依赖关系、里程碑和关键交付；日期必须来自真实计划或用户给定假设。',
    'Mermaid 11.17 的多前置依赖在同一个 after 子句里用空格分隔 task id，例如 after backend frontend；禁止写 after backend, frontend，逗号会被解析成新的 task data 字段并导致渲染失败。',
  ], ['单图控制在约 5~25 个任务；更细任务拆到子计划。'], ['编造日期', '所有任务都并行', '把状态说明写成长任务名'], ['没有真实日期时先使用相对依赖，不虚构具体日历日期。']),
  skill('timeline', 'Timeline', [
    '按真实时间顺序保留关键事件、版本、决策和里程碑；相近事件合并为阶段，不记录琐碎提交。',
  ], ['通常控制在 5~20 个关键时间点。'], ['把普通任务列表伪装成时间线', '混用时间顺序和主题分类'], ['只有存在明确先后时间语义时使用 timeline。']),
  skill('gitgraph', 'Git Graph', [
    '只展示对理解发布/分支策略有价值的 branch、merge、tag 和关键 commit；主分支命名必须来自仓库事实。',
  ], ['避免展示几十个普通提交；优先聚焦一个 release/feature 周期。'], ['伪造 commit id', '把文件依赖画成 GitGraph'], ['优先读取真实 Git 历史。']),
  skill('journey', 'User Journey', [
    '按用户阶段组织 touchpoint，评分反映真实体验信号或明确假设，并标清主要参与者。',
  ], ['单个 journey 通常 3~6 个阶段、每阶段 2~5 个 touchpoint。'], ['把后端技术步骤当用户旅程', '所有评分都相同'], ['从真实用户任务和触点出发，不从代码调用栈出发。']),
  skill('quadrant', 'Quadrant Chart', [
    '先定义两个彼此独立、可解释的连续轴，再放置项目；象限标题应表达决策含义而不是重复高/低。',
  ], ['通常 4~16 个点最易读。'], ['轴含义高度相关', '没有依据却给出过度精确坐标'], ['坐标缺乏量化数据时使用相对估计并保持排序可信。']),
]
