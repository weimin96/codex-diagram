import type { DiagramSkill } from './types.js'
import { commonMermaidModificationRules, commonMermaidVisualRules } from './common.js'

export const erSkill: DiagramSkill = {
  type: 'er',
  label: 'ER Diagram',
  intentHints: ['数据模型', '表关系', '实体关系', '数据库', '主外键'],
  compositionRules: [
    '先识别核心业务实体、聚合根和真正的关联表，再补 lookup/reference 实体；关系必须来自真实 FK、ORM 映射或业务约束。',
    '明确 1:1、1:N、N:M 基数和 optional/required 关系；N:M 有真实中间表时直接展示中间实体。',
    '实体字段优先展示 PK、FK、唯一业务键和决定关系/状态的字段，不默认展开所有审计字段、冗余文本字段。',
    '命名保持数据库或领域模型中的真实名称，不把 DTO/ViewModel 和持久化实体混成同一层。',
  ],
  densityRules: [
    '每个实体默认控制在 4~10 个关键字段；字段很多时只保留关系关键字段。',
    '超过约 12 个实体时按 bounded context/业务域拆分；超高连接实体放在视觉中心，其余围绕关系展开。',
  ],
  visualRules: [...commonMermaidVisualRules, '优先让关系标签和基数易读；不要用颜色代替 PK/FK/基数本身的语义。'],
  antiPatterns: ['把接口 DTO 当数据库实体', '省略基数', '为了完整罗列每个字段', '凭命名猜外键关系'],
  generationRules: ['优先读取 migration/schema/entity/ORM 定义交叉验证，再生成 erDiagram。'],
  modificationRules: [...commonMermaidModificationRules, '新增实体时同步检查与现有实体的真实基数；字段更新只改受影响实体。'],
}
