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
    '主阅读方向优先左→右；同一区域内垂直对齐，避免节点重叠并保留足够留白。',
    '依赖关系优先正交路由；并行关系错开 routing channel，异步消息链使用 dashed；减少穿过节点和多条线完全重叠。',
    '图上文字保持短：节点标题表达职责，subtitle 表达技术/协议；长解释放 description，不把段落塞进节点。',
    '完成语义内容后调用 diagram.beautifyArchitecture，让插件统一执行分区、配色、图标补全、布局和连线整理。',
  ]
}
