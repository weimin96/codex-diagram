import type { MermaidDiagramType } from './types.js'

const templates: Record<MermaidDiagramType, (title: string) => string> = {
  flowchart: (title) => `flowchart LR\n  A[${title}] --> B[下一步]\n`,
  sequence: (title) => `sequenceDiagram\n  participant A as 调用方\n  participant B as ${title}\n  A->>B: 请求\n  B-->>A: 响应\n`,
  mindmap: (title) => `mindmap\n  root((${title}))\n    主题 A\n      子主题\n    主题 B\n`,
  class: (title) => `classDiagram\n  class ${safeClassName(title)} {\n    +String id\n    +run()\n  }\n`,
  er: (title) => `erDiagram\n  ${safeEntityName(title)} {\n    string id PK\n  }\n`,
  state: (title) => `stateDiagram-v2\n  [*] --> ${safeStateName(title)}\n  ${safeStateName(title)} --> [*]\n`,
  gantt: (title) => `gantt\n  title ${safeText(title)}\n  dateFormat YYYY-MM-DD\n  section 计划\n  开始 :done, a1, 2026-01-01, 2d\n  执行 :active, a2, after a1, 3d\n  完成 :a3, after a2, 1d\n`,
  timeline: (title) => `timeline\n  title ${safeText(title)}\n  起点 : 需求确认\n  中期 : 核心实现\n  交付 : 验收发布\n`,
  gitgraph: (title) => `gitGraph\n  commit id: "Start"\n  branch feature\n  checkout feature\n  commit id: "${safeQuotedText(title)}"\n  checkout main\n  merge feature\n`,
  journey: (title) => `journey\n  title ${safeText(title)}\n  section 核心路径\n    进入: 5: User\n    操作: 4: User, System\n    完成: 5: User\n`,
  quadrant: (title) => `quadrantChart\n  title ${safeText(title)}\n  x-axis 低收益 --> 高收益\n  y-axis 低成本 --> 高成本\n  quadrant-1 谨慎投入\n  quadrant-2 战略投入\n  quadrant-3 低优先级\n  quadrant-4 快速推进\n  ${safeClassName(title)}: [0.72, 0.35]\n`,
  kanban: () => `kanban\n  backlog[待处理]\n    item1[需求确认]\n  doing[进行中]\n    item2[核心实现]\n  done[已完成]\n    item3[验收发布]\n`,
  requirement: (title) => `requirementDiagram\n\n  requirement core_req {\n    id: 1\n    text: ${safeRequirementText(title)}\n    risk: medium\n    verifymethod: test\n  }\n\n  element core_element {\n    type: service\n    docref: workspace\n  }\n\n  core_element - satisfies -> core_req\n`,
  sankey: () => `sankey-beta\n\n用户,入口,100\n入口,完成,72\n入口,流失,28\n`,
  xychart: (title) => `xychart-beta\n  title "${safeQuotedText(title)}"\n  x-axis [一月, 二月, 三月]\n  y-axis "数量" 0 --> 100\n  bar [42, 68, 81]\n  line [38, 64, 88]\n`,
  pie: (title) => `pie showData\n  title ${safeText(title)}\n  "核心" : 55\n  "次要" : 30\n  "其他" : 15\n`,
  radar: (title) => `radar-beta\n  title "${safeQuotedText(title)}"\n  axis speed["速度"], quality["质量"], cost["成本"], scale["规模"]\n  curve current["当前"]{72, 88, 64, 80}\n  curve target["目标"]{90, 92, 78, 90}\n  max 100\n  min 0\n`,
  treemap: (title) => `treemap-beta\n  "${safeQuotedText(title)}"\n    "核心": 55\n    "增长": 30\n    "其他": 15\n`,
  ishikawa: (title) => `ishikawa-beta\n  "${safeQuotedText(title)}"\n    "人员"\n      "能力与经验"\n    "流程"\n      "检查与反馈"\n    "工具"\n      "自动化与可观测性"\n`,
}

export function createTemplate(type: MermaidDiagramType, title: string): string {
  return templates[type](title.trim() || 'Diagram')
}

export function detectDiagramType(source: string): MermaidDiagramType | 'unknown' {
  const first = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'))

  if (!first) return 'unknown'
  if (/^(flowchart|graph)\b/i.test(first)) return 'flowchart'
  if (/^sequenceDiagram\b/i.test(first)) return 'sequence'
  if (/^mindmap\b/i.test(first)) return 'mindmap'
  if (/^classDiagram\b/i.test(first)) return 'class'
  if (/^erDiagram\b/i.test(first)) return 'er'
  if (/^stateDiagram(?:-v2)?\b/i.test(first)) return 'state'
  if (/^gantt\b/i.test(first)) return 'gantt'
  if (/^timeline\b/i.test(first)) return 'timeline'
  if (/^gitGraph\b/i.test(first)) return 'gitgraph'
  if (/^journey\b/i.test(first)) return 'journey'
  if (/^quadrantChart\b/i.test(first)) return 'quadrant'
  if (/^kanban\b/i.test(first)) return 'kanban'
  if (/^requirement(?:Diagram)?\b/i.test(first)) return 'requirement'
  if (/^sankey(?:-beta)?\b/i.test(first)) return 'sankey'
  if (/^xychart(?:-beta)?\b/i.test(first)) return 'xychart'
  if (/^pie\b/i.test(first)) return 'pie'
  if (/^radar-beta\b/i.test(first)) return 'radar'
  if (/^treemap(?:-beta)?\b/i.test(first)) return 'treemap'
  if (/^ishikawa(?:-beta)?\b/i.test(first)) return 'ishikawa'
  return 'unknown'
}

function safeClassName(value: string): string {
  const normalized = value.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/^\d/, '_$&')
  return normalized || 'Diagram'
}

function safeEntityName(value: string): string {
  return safeClassName(value).toUpperCase()
}

function safeStateName(value: string): string {
  return safeClassName(value)
}

function safeText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim() || 'Diagram'
}

function safeQuotedText(value: string): string {
  return safeText(value).replace(/["\\]/g, '')
}

function safeRequirementText(value: string): string {
  return safeText(value).replace(/[{}:]/g, ' ')
}
