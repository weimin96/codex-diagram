import type { DiagramDocument, DiagramType } from './types.js'

export interface DiagramGenerationRequest {
  type: DiagramType
  title: string
  scope: string
  instructions: string
}

export function buildGenerationPrompt(workspacePath: string, request: DiagramGenerationRequest): string {
  const scope = request.scope.trim()
  const instructions = request.instructions.trim()
  return [
    '基于当前 Codex 工作空间生成一张 Mermaid 图表，并写回 Diagram 插件。',
    `工作空间：${workspacePath}`,
    `目标类型：${request.type}`,
    `标题：${request.title.trim()}`,
    scope
      ? `优先分析范围：${scope}`
      : '分析范围：优先使用当前对话里已经明确指向的代码或功能；如果没有明确对象，再从工作空间定位最相关实现。',
    instructions ? `额外要求：${instructions}` : '',
    '',
    '执行要求：',
    '1. 先阅读真正相关的代码、配置或数据结构，不要凭文件名臆测。',
    '2. 调用 diagram.create 创建目标图，再调用 diagram.update 写入完整 Mermaid 源码。',
    '3. 图表只保留有决策价值的结构、调用、状态或数据关系，避免把所有低级符号都画进去。',
    '4. Mermaid 必须可渲染；完成后简要说明分析范围和生成的图表路径。',
  ].filter(Boolean).join('\n')
}

export function buildModificationPrompt(workspacePath: string, diagram: DiagramDocument, instruction: string): string {
  return [
    '修改 Diagram 插件中当前选中的 Mermaid 图表。',
    `工作空间：${workspacePath}`,
    `图表路径：${diagram.path}`,
    `当前类型：${diagram.type}`,
    `修改要求：${instruction.trim()}`,
    '',
    '执行要求：',
    '1. 先调用 diagram.get 读取最新内容；如修改依赖代码事实，再读取工作空间中的相关实现。',
    '2. 只更新这张图，除非用户明确要求新建另一张图。',
    '3. 使用 diagram.update 写回完整 Mermaid 源码，并保证语法可渲染。',
    '4. 不要为了显得完整增加与当前问题无关的节点或说明。',
  ].join('\n')
}
