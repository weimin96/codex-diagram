import type { DiagramSkill } from './types.js'
import { commonMermaidModificationRules, commonMermaidVisualRules } from './common.js'

export const sequenceSkill: DiagramSkill = {
  type: 'sequence',
  label: 'Sequence Diagram',
  intentHints: ['调用链', '请求链路', '时序', '接口交互', '异步回调', '事务过程'],
  compositionRules: [
    'participant 按调用方向稳定排序：用户/客户端 → 网关/入口 → 应用服务 → 数据/消息 → 外部系统；同一参与者只声明一次。',
    '同步调用、异步消息和返回值要有区别；只保留对理解协议或状态有价值的返回，不为每次调用机械补 response。',
    '异步事件发布必须指向显式的消息端点 participant（例如 EventBus、Kafka Topic、Queue），并使用异步消息语义；禁止用 Service-->>Service 这类 self-message 冒充 publish。若真实 broker/topic 未知，使用中性的 EventBus/Queue 角色并标明事件名，不伪造具体产品。',
    '条件分支使用 alt/else，单条件可选逻辑使用 opt，并行流程使用 par，重试/轮询才使用 loop；不要用普通消息文本模拟这些控制结构。',
    '关键失败路径与正常路径放在同一上下文中对比；非常低概率或实现细节异常不要无限展开。',
  ],
  densityRules: [
    '参与者通常控制在 3~8 个；超过 10 个优先拆成总览时序与局部时序。',
    '消息超过约 24 条时优先按阶段用 rect/note/控制块收敛，不生成一屏几十条等权消息。',
  ],
  visualRules: [...commonMermaidVisualRules, '消息标签以“动作 + 核心参数/协议”表达，避免复制完整方法签名和长 JSON。'],
  antiPatterns: ['把静态模块依赖画成时序图', '同一服务重复 participant', '每个请求都强制画一条无信息量返回', '用 note 代替真实消息或控制块', '用服务发给自身的消息表示事件发布'],
  generationRules: ['优先从真实入口方法、RPC/HTTP/MQ 调用和持久化动作还原顺序；不确定的调用顺序不要臆造。'],
  modificationRules: [...commonMermaidModificationRules, '新增参与者时保持原调用顺序，新增错误分支时尽量局部使用 alt/opt，不重排无关 participant。'],
}
