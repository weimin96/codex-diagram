import type { DiagramType } from './types.js'

const templates: Record<DiagramType, (title: string) => string> = {
  flowchart: (title) => `flowchart LR\n  A[${title}] --> B[下一步]\n`,
  sequence: (title) => `sequenceDiagram\n  participant A as 调用方\n  participant B as ${title}\n  A->>B: 请求\n  B-->>A: 响应\n`,
  mindmap: (title) => `mindmap\n  root((${title}))\n    主题 A\n      子主题\n    主题 B\n`,
  class: (title) => `classDiagram\n  class ${safeClassName(title)} {\n    +String id\n    +run()\n  }\n`,
  er: (title) => `erDiagram\n  ${safeEntityName(title)} {\n    string id PK\n  }\n`,
  state: (title) => `stateDiagram-v2\n  [*] --> ${safeStateName(title)}\n  ${safeStateName(title)} --> [*]\n`,
}

export function createTemplate(type: DiagramType, title: string): string {
  return templates[type](title.trim() || 'Diagram')
}

export function detectDiagramType(source: string): DiagramType | 'unknown' {
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
