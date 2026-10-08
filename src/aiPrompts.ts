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
  if (request.type === 'canvas') {
    return [
      '基于当前 Codex 工作空间生成一张 Diagram 自由画布，并写回 Diagram 插件。',
      `工作空间：${workspacePath}`,
      `标题：${request.title.trim()}`,
      scope
        ? `优先分析范围：${scope}`
        : '分析范围：优先使用当前对话里已经明确指向的代码或功能；如果没有明确对象，再从工作空间定位最相关实现。',
      instructions ? `额外要求：${instructions}` : '',
      '',
      '执行要求：',
      '1. 先阅读真正相关的代码、配置或数据结构，不要凭文件名臆测。',
      '2. 调用 diagram.create，type 使用 canvas，创建 .diagram.json；再调用 diagram.get 获取模板并在其结构上修改。',
      '3. 保持 type=codex-diagram-canvas、version=1。elements 只使用 node、note、arrow。',
      '4. node/note 使用 id,type,x,y,width,height,text；可选 tone(default/accent/success/warning/danger/muted)、shape(rounded/square/pill)、locked、groupId、sourcePaths。arrow 使用 id,type=arrow,from,to，可选 label、lineStyle(solid/dashed)、routing(straight/orthogonal)、fromAnchor/toAnchor(auto/top/right/bottom/left)、points；from/to 必须引用现有 node/note id。',
      '5. 只在视觉语义明确时使用 tone：主路径可 accent，成功/完成可 success，风险可 warning/danger，次要信息可 muted；不要把每个节点都染色。架构/流程图优先用 orthogonal 路由，简单关系可以 straight。',
      '6. 画布默认 1600x1000。按从左到右或从上到下的主要阅读方向布置，节点不要明显重叠，给模块组留出空间。',
      '7. 调用 diagram.update 写回完整 JSON，不要写 Mermaid 语法。完成后简要说明分析范围和图表路径。',
    ].filter(Boolean).join('\n')
  }
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
  if (diagram.type === 'canvas') {
    return [
      '修改 Diagram 插件中当前选中的自由画布。',
      `工作空间：${workspacePath}`,
      `图表路径：${diagram.path}`,
      `修改要求：${instruction.trim()}`,
      '',
      '执行要求：',
      '1. 先调用 diagram.get 读取最新的 .diagram.json 内容；需要代码事实时再阅读相关实现。',
      '2. 保留 codex-diagram-canvas version 1 JSON 结构，只操作 node、note、arrow 元素。',
      '3. 保留现有节点的 tone/shape/locked 以及连线 lineStyle/routing，除非修改要求明确涉及这些属性；不要重排 locked 元素。',
      '4. 使用 diagram.update 写回完整 JSON；节点坐标应避免明显重叠，arrow.from/to 必须引用现有节点或备注；可用 groupId 表达需要一起操作的节点组，sourcePaths 只填写真实存在的工作区相对源码路径，连接可使用锚点和手工折点；不要随意移动 locked 元素。',
      '5. 不要把 Mermaid 语法写进自由画布文件。',
    ].join('\n')
  }
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
