import type { DiagramDocument, DiagramType } from './types.js'
import { architectureDesignSkill, isArchitectureIntent } from './architectureSkill.js'

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
    const architecture = isArchitectureIntent(`${request.title} ${instructions}`)
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
      '4. node/note 使用 id,type,x,y,width,height,text；可选 tone(default/accent/success/warning/danger/muted)、shape(rounded/square/pill)、icon(user/web/api/gateway/service/worker/database/cache/queue/search/vector/cloud/file/auth/ai/mcp/scheduler/external)、stencil(spring/react/vue/postgres/mysql/redis/kafka/rabbitmq/docker/kubernetes/qdrant/opensearch/elasticsearch/mongodb/minio/nginx/grpc/oidc/openai/mcp)、c4Type(person/software-system/container/component)、subtitle、description、tags、locked、groupId、laneId、sourcePaths、emphasis(primary/secondary/muted)。scene.groups 可配置 id,label,tone,kind(group/boundary),collapsed,parentId,c4Type(software-system/container),description，以 parentId 表达系统→容器的嵌套边界；scene.lanes 可配置 id,label,axis(horizontal/vertical),start,size,tone。arrow 使用 id,type=arrow,from,to，可选 label、lineStyle(solid/dashed)、routing(straight/orthogonal)、fromAnchor/toAnchor(auto/top/right/bottom/left)、points、labelPosition({x,y})、emphasis；from/to 必须引用现有 node/note id。labelPosition 属于用户手调标签位置，已有值应尽量保留；bundleKey 由插件理线器生成，不要手工编造。',
      '5. 只在视觉语义明确时使用 tone：主路径可 accent，成功/完成可 success，风险可 warning/danger，次要信息可 muted；不要把每个节点都染色。架构/流程图优先用 orthogonal 路由，简单关系可以 straight。',
      '6. 画布默认 1600x1000。按从左到右或从上到下的主要阅读方向布置，节点不要明显重叠。C4/系统架构优先用 kind=boundary 的命名容器；跨角色流程适合 lanes；技术组件只在事实明确时填写 stencil 和真实 sourcePaths。',
      '7. 初次新建图使用 diagram.update 写回完整 JSON；不要写 Mermaid 语法。完成后简要说明分析范围和图表路径。',
      ...(architecture ? ['', '内置 Architecture Diagram Skill：', ...architectureDesignSkill('enterprise')] : []),
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
      '1. 如果当前对话/选区已经给出稳定 element ids，先调用 diagram.getSubgraph 读取这些元素和直接邻域，不要为了局部修改加载整张大图；只有还不知道目标 ids 或任务确实涉及整图状态时才调用 diagram.get。需要代码事实时再阅读相关实现。',
      '2. 保留 codex-diagram-canvas version 1 JSON 结构，只操作 node、note、arrow 元素。',
      '3. 保留现有节点的 tone/shape/locked/groupId/laneId/icon/stencil/subtitle/description/tags/sourcePaths/emphasis、scene.groups/scene.lanes 以及连线 lineStyle/routing/anchors/points/labelPosition/emphasis/bundleKey，除非修改要求明确涉及这些属性；不要重排 locked 元素。',
      '4. 如果本次只涉及有限节点/关系，优先调用 diagram.proposeSubgraphPatch：elementIds 只放允许修改的已有 id，updates 只发送真正变化的字段，adds 只发送新增元素，removeIds 只发送删除项。不要把未变化的 x/y/width/height、arrow.points、labelPosition 重复发送。只有修改标题/画布尺寸/Group/Lane 元数据或确实需要整图重构时才调用 diagram.proposeUpdate。',
      '5. 合理使用 C4 person/software-system/container/component 语义，以及 icon 标明运行角色、stencil 标明真实技术栈；不要为了装饰给所有节点重复相同图标或技术标签。',
      '6. diagram.proposeSubgraphPatch 的 layout 默认 preserve；只有用户明确要求整理/重排当前局部结构时才用 local。服务端会保留未声明的人工布局和 Label，并自动计算受影响关系。不要把 Mermaid 语法写进自由画布文件。Proposal 不会直接覆盖文件，等待用户在右侧 Diagram 接受或拒绝。',
      '7. 默认只提交一个候选。只有用户明确要求多个方案、A/B 对比或备选实现时，才对同一 base revision 分别调用 diagram.proposeSubgraphPatch，并为每个候选设置不同 branchLabel（例如“保守方案”“重构方案”）；不要为了显得丰富自动制造分支。',
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
    '只修改 Diagram 当前 Canvas 的指定子图，并提交可审查的增量 Patch Proposal。',
    `工作空间：${workspacePath}`,
    `图表路径：${diagram.path}`,
    `允许修改的现有元素：${JSON.stringify([...new Set(elementIds)])}`,
    `修改要求：${instruction.trim()}`,
    '',
    '执行要求：',
    '1. 先调用 diagram.getSubgraph，path 使用当前图表路径、elementIds 使用上面的稳定 id、depth 默认 0；只有明确需要更远依赖时才提高到 1～2。不要先读取完整 Canvas。返回值会区分 scopeNodeIds、directRelationshipIds、contextElementIds；contextElementIds 默认只读。需要代码事实时再读取相关源码。',
    '2. 调用 diagram.proposeSubgraphPatch，不要生成或传回完整 Canvas JSON。elementIds 默认使用上面的稳定 id；如果用户要求明确涉及这些节点的直接关系，可把 getSubgraph 返回的 directRelationshipIds 中相关关系一并加入 elementIds。不要仅因为看到了 contextElementIds 就扩大修改范围。',
    '3. updates 只写真正发生变化的字段；没有要移动节点时，不要写 x/y/width/height。没有要人工改线路时，不要写 arrow.points/labelPosition/bundleKey。null 只用于明确清除可选字段。',
    '4. 新增元素放在 adds 中并使用新的稳定 id。新增 node/note 可以省略 x/y，由服务端在当前子图附近寻找位置；当当前 scope 的 group/lane 唯一且明确时，服务端也会继承该上下文。新增 arrow 必须提供 from/to。删除已有元素放在 removeIds。',
    '5. layout 默认 preserve；只有用户明确要求当前子图重新布局/整理时才使用 local。服务端会计算关系重路由、删除节点的连带关系等自动影响，并在 Proposal 中单独显示。',
    '6. 不要直接调用 diagram.update，也不要优先使用旧的 diagram.proposeSubgraphUpdate。等待用户在右侧 Diagram 审查并接受/拒绝。',
    '7. 默认只提交一个候选。只有用户明确要求多个方案、A/B 对比或备选实现时，才在相同 base revision 上分别提交带不同 branchLabel 的 diagram.proposeSubgraphPatch，让右侧进行候选对比；不要自动生成无意义分支。',
  ].join('\n')
}
