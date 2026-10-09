import type { DiagramSkill } from './types.js'
import { commonMermaidEvidenceRules, commonMermaidModificationRules, commonMermaidValidationRules, commonMermaidVisualRules } from './common.js'

export const flowchartSkill: DiagramSkill = {
  type: 'flowchart',
  label: 'Flowchart',
  intentHints: ['流程', '工作流', '审批', '决策', '控制流', '异常路径'],
  compositionPatterns: ['linear-flow', 'decision-tree', 'swimlane', 'fan-out', 'convergence'],
  compositionRules: [
    '先识别唯一入口、主要成功路径、关键决策点和终止状态，再补异常/补偿路径；主路径应能从一个方向连续阅读。',
    '决策节点只表达一个可判断条件，分支边使用短条件标签；不要把判断条件重复写进下游节点标题。',
    '跨角色/跨系统流程优先用 subgraph 做阶段或责任边界；边界数量通常控制在 3~6 个。',
    '循环必须能看出返回条件和退出条件；补偿/失败路径应回到明确的恢复点或终止点。',
  ],
  densityRules: [
    '8 个节点以内保持单主链；9~20 个节点按阶段分组；超过 20 个节点优先拆成总览 + 子流程，不直接生成超长毛线图。',
    '宽而浅的业务流程优先 LR；决策树或多层分支优先 TB。',
    '审批/异常处理流程出现 3 个及以上 decision，或包含重试/回环时，默认优先 TB；不要用多个 direction LR 的 subgraph 串成超宽横图。只有分支很少且整体确实宽而浅时才选 LR。',
    '单张总览图最多保留约 5 个真正影响业务路径的 decision；重试计数、底层技术检查等次级判断应折叠进阶段/子流程节点。超过 5 个 decision 时优先拆子流程。',
  ],
  visualRules: [...commonMermaidVisualRules, '主路径保持稳定方向，异常路径尽量从主路径侧边分出并回收，减少反向长边。'],
  evidenceRules: commonMermaidEvidenceRules,
  antiPatterns: ['用流程图表达静态软件架构', '连续多个没有语义的矩形节点', '每条边都写“是/否”但看不出对应问题', '交叉线比业务信息更醒目', '在节点标签里写 <br/>、HTML 标签或依赖 HTML 换行控制尺寸'],
  generationRules: ['在写源码前先按分支深度选择方向：3+ decision、重试回环、多层审批优先 flowchart TB；线性或仅少量分支的宽浅流程可用 LR。节点标签保持单行短句，不写 <br/> 或其他 HTML。生成后实际数一遍语义节点与 decision：单图超过 20 个节点或 5 个 decision 必须合并次级判断或拆成总览 + 子流程，不要返回超长单图；同时检查所有 decision 分支和终点是否闭合，并避免多个横向 subgraph 造成超宽画布。'],
  modificationRules: [...commonMermaidModificationRules, '新增分支时优先挂到已有决策点或阶段边界，不平移重写整条主路径。'],
  validationRules: commonMermaidValidationRules,
}
