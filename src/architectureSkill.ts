import type { ArchitectureTheme } from './architectureDesign.js'

export function isArchitectureIntent(value: string): boolean {
  return /(架构|拓扑|系统图|architecture|c4|topology|service map|system design)/i.test(value)
}

export function architectureDesignSkill(theme: ArchitectureTheme = 'enterprise'): string[] {
  return [
    `架构视觉主题：${theme}。`,
    '先表达系统边界和职责层次，再表达细节；不要把所有节点平铺成一层。',
    '优先区分外部参与方、体验/入口、核心应用、后台处理/异步、数据/检索等区域；已有明确 C4 boundary 时保留其业务层级。',
    '节点必须尽量填写真实 role(icon) 和已确认的 technology stencil；不要用装饰性图标冒充未知技术。',
    '颜色只表达架构语义：入口/关键交互、处理/异步、数据/存储、外部依赖应能快速区分；避免彩虹式逐节点随机配色。',
    '图必须有视觉主次：主业务/主数据链路使用 primary，直接相关依赖使用 secondary，配置性或外围关系弱化为 muted；不要让所有线和节点具有相同视觉权重。',
    '优先形成明确的 Software System 外边界与内部 Container/Domain 子边界；外部参与方和第三方系统留在系统边界之外。',
    '主阅读方向优先左→右；同一区域内垂直对齐，避免节点重叠并保留足够留白。',
    '依赖关系优先正交路由；并行关系错开 routing channel，异步消息链使用 dashed；减少穿过节点和多条线完全重叠。',
    '同一节点扇出到多个同层目标时允许共享一段关系 trunk 再分叉，形成 bundle/汇聚，而不是每条线从节点边缘独立炸开。',
    '关系标签只写协议、动作或关键语义，保持短且避免重复节点名称；插件会把标签优先放到较长的空闲线段，并自动避开节点与已有标签。',
    '图上文字保持短：节点标题表达职责，subtitle 表达技术/协议；长解释放 description，不把段落塞进节点。',
    '需要用于评审、方案汇报或截图交付时使用 presentation 主题；该模式会保留标题带、图例、更宽松的列距与卡片信息层级。',
    '当图超过约 20 个节点时优先使用 density=auto，让插件自动从 comfortable 切到 compact/dense；不要靠缩小字体硬塞节点。',
    '大型架构图需要先给 overview，再按需要切 detail：overview 只隐藏低优先级显示项，不删除节点数据，并保留主链路、直接依赖和每个区域的代表节点。',
    '节点卡片按 Actor / Edge / Runtime / Async / Data / External 等语义模板呈现；真实技术仍由 stencil/subtitle 表达，不要把模板标签当成具体技术。',
    '完成语义内容后调用 diagram.beautifyArchitecture，让插件统一执行分区、配色、图标补全、布局和连线整理。',
    '如果节点位置和分区已经合适，只需要减少交叉/穿节点/叠线，则调用 diagram.routeArchitectureEdges，不要重新布局整张图。',
  ]
}
