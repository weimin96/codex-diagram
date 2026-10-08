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
      '4. node/note 使用 id,type,x,y,width,height,text；可选 tone(default/accent/success/warning/danger/muted)、shape(rounded/square/pill)、icon(user/web/api/service/database/cache/queue/cloud/file/external)、stencil(spring/react/vue/postgres/mysql/redis/kafka/docker/kubernetes/qdrant/opensearch/minio)、c4Type(person/software-system/container/component)、subtitle、description、tags、locked、groupId、laneId、sourcePaths。scene.groups 可配置 id,label,tone,kind(group/boundary),collapsed,parentId,c4Type(software-system/container),description，以 parentId 表达系统→容器的嵌套边界；scene.lanes 可配置 id,label,axis(horizontal/vertical),start,size,tone。arrow 使用 id,type=arrow,from,to，可选 label、lineStyle(solid/dashed)、routing(straight/orthogonal)、fromAnchor/toAnchor(auto/top/right/bottom/left)、points；from/to 必须引用现有 node/note id。',
      '5. 只在视觉语义明确时使用 tone：主路径可 accent，成功/完成可 success，风险可 warning/danger，次要信息可 muted；不要把每个节点都染色。架构/流程图优先用 orthogonal 路由，简单关系可以 straight。',
      '6. 画布默认 1600x1000。按从左到右或从上到下的主要阅读方向布置，节点不要明显重叠。C4/系统架构优先用 kind=boundary 的命名容器；跨角色流程适合 lanes；技术组件只在事实明确时填写 stencil 和真实 sourcePaths。',
      '7. 初次新建图使用 diagram.update 写回完整 JSON；不要写 Mermaid 语法。完成后简要说明分析范围和图表路径。',
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
      '3. 保留现有节点的 tone/shape/locked/groupId/laneId/icon/stencil/subtitle/description/tags/sourcePaths、scene.groups/scene.lanes 以及连线 lineStyle/routing/anchors/points，除非修改要求明确涉及这些属性；不要重排 locked 元素。',
      '4. 生成完整候选 JSON 后调用 diagram.proposeUpdate，不要直接 diagram.update。节点坐标应避免明显重叠，arrow.from/to 必须引用现有节点或备注；sourcePaths 只填写真实存在的工作区相对源码路径；不要为了整理布局删除 boundary、parentId 层级、lane、C4 c4Type、stencil、collapsed 状态或节点详情。',
      '5. 合理使用 C4 person/software-system/container/component 语义，以及 icon 标明运行角色、stencil 标明真实技术栈；不要为了装饰给所有节点重复相同图标或技术标签。',
      '6. 不要把 Mermaid 语法写进自由画布文件。diagram.proposeUpdate 只提交候选，不会直接覆盖文件；等待用户在右侧 Diagram 接受或拒绝。',
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
    '3. 生成完整 Mermaid 候选源码后调用 diagram.proposeUpdate，不要直接 diagram.update；保证候选语法可渲染。',
    '4. 不要为了显得完整增加与当前问题无关的节点或说明。diagram.proposeUpdate 不会写盘，等待用户在 Diagram 面板接受或拒绝。',
  ].join('\n')
}

export function buildSubgraphModificationPrompt(workspacePath: string, diagram: DiagramDocument, elementIds: string[], instruction: string): string {
  return [
    '只修改 Diagram 当前 Canvas 的指定子图，并提交可审查的 Subgraph Proposal。',
    `工作空间：${workspacePath}`,
    `图表路径：${diagram.path}`,
    `允许修改的现有元素：${JSON.stringify([...new Set(elementIds)])}`,
    `修改要求：${instruction.trim()}`,
    '',
    '执行要求：',
    '1. 先调用 diagram.get 读取最新完整 Canvas JSON；需要代码事实时再读取相关源码。',
    '2. 只修改上面列出的现有 element ids，以及为了保持这些元素关系正确而必须修改的直接连接；不要重排或改写范围外节点。',
    '3. 如果需要新增节点/备注/连线，使用新的稳定 id，并把所有新增 id 明确放进 diagram.proposeSubgraphUpdate 的 newElementIds。',
    '4. 生成完整候选 Canvas JSON，然后调用 diagram.proposeSubgraphUpdate，elementIds 使用上面的稳定 id。服务端会拒绝任何越界修改。',
    '5. 不要直接调用 diagram.update。等待用户在右侧 Diagram 审查并接受/拒绝。',
  ].join('\n')
}
