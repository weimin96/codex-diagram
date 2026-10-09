import type { MermaidDiagramType } from './types.js'
import { resolveMermaidVisualDensity, type MermaidVisualDensity } from './mermaidVisualGrammar.js'

export interface MermaidVisualQualityAssessment {
  density: MermaidVisualDensity
  splitRecommended: boolean
  reasons: string[]
  metrics: Record<string, number>
}

function meaningfulLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'))
}

function count(lines: string[], pattern: RegExp): number {
  return lines.filter((line) => pattern.test(line)).length
}

function flowchartNodeCount(lines: string[]): number {
  const ids = new Set<string>()
  const nodePattern = /\b([A-Za-z_][\w-]*)\s*(?=\[|\(|\{|>)/g
  for (const line of lines) {
    for (const match of line.matchAll(nodePattern)) ids.add(match[1])
  }
  return ids.size
}

export function assessMermaidVisualQuality(
  type: MermaidDiagramType | 'unknown',
  source: string,
): MermaidVisualQualityAssessment {
  const lines = meaningfulLines(source)
  const density = resolveMermaidVisualDensity(type, source)
  const reasons: string[] = []
  const metrics: Record<string, number> = { lines: lines.length }

  if (type === 'flowchart') {
    metrics.nodes = flowchartNodeCount(lines)
    metrics.decisions = count(lines, /\w+\s*\{[^}]+\}/)
    metrics.relations = count(lines, /-->|---|==>|-.->/)
    metrics.groups = count(lines, /^subgraph\b/i)
    if (metrics.nodes > 22) reasons.push(`节点 ${metrics.nodes} > 22，建议拆成总览 + 子流程`)
    if (metrics.decisions >= 6) reasons.push(`决策点 ${metrics.decisions} 个，单图分支复杂度过高`)
    if (metrics.decisions >= 5 && metrics.relations >= 18) reasons.push(`决策点 ${metrics.decisions} 个且关系 ${metrics.relations} 条，建议折叠重试/异常细节`)
    if (metrics.relations > 28) reasons.push(`关系 ${metrics.relations} 条，建议按阶段拆图`)
  } else if (type === 'sequence') {
    metrics.participants = count(lines, /^(participant|actor)\b/i)
    metrics.messages = count(lines, /(?:--?>>|--?>|--?x|--?\)|--?\])/) 
    if (metrics.participants > 10) reasons.push(`参与者 ${metrics.participants} > 10，建议拆成总览 + 局部时序`)
    if (metrics.messages > 24) reasons.push(`消息 ${metrics.messages} > 24，建议按阶段拆分`)
  } else if (type === 'er') {
    metrics.entities = count(lines, /^(?:"[^"]+"|[\w-]+)\s*\{/)
    if (metrics.entities > 18) reasons.push(`实体 ${metrics.entities} > 18，建议按 bounded context 拆分`)
  } else if (type === 'state' || type === 'class') {
    metrics.semanticLines = lines.length
    if (lines.length > 52) reasons.push(`${type === 'state' ? '状态转换' : '类关系'}过多，建议拆分层级`)
  } else if (type === 'mindmap') {
    metrics.nodes = Math.max(0, lines.length - 1)
    if (metrics.nodes > 60) reasons.push(`脑图节点 ${metrics.nodes} > 60，建议分主题拆图`)
  } else if (type === 'kanban') {
    metrics.cards = count(lines, /^\w+\[/)
    if (metrics.cards > 36) reasons.push(`看板卡片 ${metrics.cards} > 36，建议按团队或阶段拆分`)
  } else if (type === 'requirement') {
    metrics.items = count(lines, /^(requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint|element)\b/)
    if (metrics.items > 25) reasons.push(`需求/元素 ${metrics.items} > 25，建议按 feature/domain 拆分`)
  } else if (type === 'sankey') {
    metrics.flows = Math.max(0, lines.length - 1)
    if (metrics.flows > 32) reasons.push(`流向 ${metrics.flows} > 32，建议聚合长尾类别或拆图`)
  } else if (type === 'gantt') {
    metrics.tasks = count(lines, /:\s*(?:milestone,\s*)?(?:crit,\s*)?(?:active,\s*)?(?:done,\s*)?[\w-]+\s*,/i)
    if (metrics.tasks > 28) reasons.push(`任务 ${metrics.tasks} > 28，建议按阶段拆分计划`)
  } else if (type === 'timeline') {
    metrics.events = Math.max(0, lines.length - (lines[1]?.startsWith('title ') ? 2 : 1))
    if (metrics.events > 18) reasons.push(`时间点 ${metrics.events} > 18，建议按时期拆分`)
  } else if (type === 'journey') {
    metrics.tasks = count(lines, /:\s*[1-5]\s*:/)
    if (metrics.tasks > 20) reasons.push(`旅程触点 ${metrics.tasks} > 20，建议按阶段拆图`)
  } else if (type === 'treemap' || type === 'ishikawa') {
    metrics.items = Math.max(0, lines.length - 1)
    if (metrics.items > 36) reasons.push(`层级项 ${metrics.items} > 36，建议先聚类再展示`)
  }

  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0)
  metrics.longestLine = longestLine
  if (longestLine > 120) reasons.push(`存在 ${longestLine} 字符的超长行，建议缩短标签或移到说明中`)

  return {
    density,
    splitRecommended: reasons.length > 0,
    reasons,
    metrics,
  }
}
