import type { DiagramCompositionPattern, DiagramSkill } from './types.js'
import { commonMermaidEvidenceRules, commonMermaidModificationRules, commonMermaidValidationRules, commonMermaidVisualRules } from './common.js'

const extendedPatterns: Partial<Record<DiagramSkill['type'], DiagramCompositionPattern[]>> = {
  kanban: ['work-board'],
  requirement: ['traceability'],
  sankey: ['quantity-flow'],
  xychart: ['metrics'],
  pie: ['composition'],
  radar: ['multi-axis'],
  treemap: ['hierarchical-composition'],
  ishikawa: ['root-cause'],
}

function extendedSkill(
  type: DiagramSkill['type'],
  label: string,
  intentHints: string[],
  compositionRules: string[],
  densityRules: string[],
  visualRules: string[],
  antiPatterns: string[],
  generationRules: string[],
): DiagramSkill {
  return {
    type,
    label,
    intentHints,
    compositionPatterns: extendedPatterns[type] ?? ['linear-flow'],
    compositionRules,
    densityRules,
    visualRules: [...commonMermaidVisualRules, ...visualRules],
    evidenceRules: commonMermaidEvidenceRules,
    antiPatterns,
    generationRules,
    modificationRules: commonMermaidModificationRules,
    validationRules: commonMermaidValidationRules,
  }
}

export const extendedSkills: DiagramSkill[] = [
  extendedSkill('kanban', 'Kanban', ['看板', '待办', 'WIP', '工作流状态', '任务流转'], [
    '列表示真实工作状态而不是组织部门；卡片只放当前可执行工作项，按真实阶段从左到右排列。',
    '如果存在阻塞/加急/高优先级，优先通过卡片命名或元数据表达，不额外制造虚假的状态列。',
  ], [
    '单图建议 3~7 列、每列 2~12 个代表工作项；大量 backlog 只保留代表项或拆成独立看板。',
  ], [
    '列宽和卡片粒度保持一致，避免某一列塞入长段说明。',
  ], [
    '把业务流程步骤误画成 Kanban 列',
    '为美观凭空添加 Done/In Progress 状态',
  ], [
    '优先从任务状态字段、Issue/PR 状态或真实项目计划提取列与卡片。',
  ]),

  extendedSkill('requirement', 'Requirement Diagram', ['需求追踪', '需求关系', '验证方法', '满足关系', '追踪矩阵'], [
    '以 requirement 为中心表达 requirement、element 及 contains/copies/derives/satisfies/verifies/refines/traces 关系。',
    'requirement id 使用稳定、简单且 Mermaid 可解析的值；复杂业务编号放在 text 中，不把带连字符的字符串硬塞进裸 id 字段。',
    'requirement 的 text 值统一使用双引号包裹，尤其中文或包含空格/标点时禁止裸写；例如 text: "下单必须校验库存"。element 的 type/docref 若包含空格或非 ASCII 文本也使用双引号。',
    'risk 与 verifymethod 必须来自需求事实；没有依据时直接省略字段，不得输出 unknown/none/unspecified。risk 只允许 low/medium/high，verifymethod 只允许 analysis/demonstration/inspection/test。',
    '实现、测试、文档等验证对象一律使用 element 块表达；Mermaid Requirement 不存在 test_case/testCase 这类元素语法。测试可以写成 element CheckoutIT { type: integration_test } 后用 verifies 关联 requirement。',
  ], [
    '单图优先 5~25 个需求与实现元素；更大的需求集按 feature/domain 拆分。',
  ], [
    '需求文字保持一到两行核心约束，长验收标准放到文档而不是节点里。',
  ], [
    '把普通依赖关系都写成 satisfies',
    '编造验证方法和风险等级',
    '输出 risk: unknown 或 test_case 等 Mermaid Requirement 不支持的语法',
    '使用无法稳定解析的 requirement id',
  ], [
    '优先读取需求文档、测试、接口契约和实现元素之间的真实追踪关系。',
  ]),

  extendedSkill('sankey', 'Sankey Diagram', ['流量', '资金流', '能量流', '转化流', '去向分布'], [
    'Sankey 只用于可加总的流量守恒/分配问题；source→target 的 value 必须是同一量纲。',
    '主流向从左到右，节点命名保持同一业务层级；需要对比两个完全不同指标时拆图而不是混在一张流图里。',
    'Mermaid 11.17 的 Sankey CSV lexer 对 Unicode 标签支持不可靠；节点名使用简短 ASCII-safe 标识，中文语义放在图外说明，避免生成后无法解析。',
  ], [
    '通常控制在 4~20 个节点、5~30 条流；长尾类别合并为“其他”但必须说明聚合口径。',
  ], [
    '最大流量形成视觉主干，小流量保持可见但不要抢占阅读焦点。',
  ], [
    '用 Sankey 表示没有数量权重的普通依赖',
    '不同单位的 value 混在一张图里',
    '为凑 100% 擅自修改原始数据',
  ], [
    '只有拿到真实或用户明确给出的数值时才生成 Sankey；否则优先建议 flowchart/data-flow Canvas。',
  ]),

  extendedSkill('xychart', 'XY Chart', ['趋势', '柱线图', '时间序列', '指标对比', '数值走势'], [
    '先确定 x 轴是有序时间/类别还是连续数值，再选择 bar、line 或二者组合；趋势优先 line，离散量比较优先 bar。',
    '同图多序列必须共享可比较的 y 轴量纲；不同单位不要伪装成同一尺度。',
    '分类横轴包含中文或其他 Unicode 文本时使用带引号的类别，例如 x-axis ["一月", "二月"]，避免 Mermaid lexer 解析失败。',
  ], [
    '推荐 3~24 个 x 点、1~4 条序列；超过后优先缩短时间窗口或拆图。',
  ], [
    '轴标题、单位和范围必须清楚；不要为了视觉效果截断关键基线或制造夸张趋势。',
  ], [
    '没有真实数据却生成精确数值',
    '时间序列使用无序类别顺序',
    '把多个不同单位的指标塞进同一 y 轴',
  ], [
    '优先读取真实指标、日志、评测或用户提供的数据；缺数据时明确使用示意值或不生成数值图。',
  ]),

  extendedSkill('pie', 'Pie Chart', ['占比', '构成', '份额', '比例', '组成'], [
    'Pie 只用于同一时点、同一总体的 part-to-whole；所有 slice 必须能解释为一个完整总量。',
    '按占比从大到小组织，必要时把长尾合并为“其他”，但不隐藏决策相关的小类别。',
  ], [
    '优先 2~6 个 slice；超过约 6 个类别时优先改用 bar/treemap。',
  ], [
    '标签简短并显示实际数值；不要用大量相近颜色制造阅读负担。',
  ], [
    '用 Pie 表示时间变化',
    '类别之和不是一个有意义的总体',
    '超过 8 个细碎 slice 仍坚持饼图',
  ], [
    '只有存在真实比例/数值时生成；否则改用结构图而不是编造百分比。',
  ]),

  extendedSkill('radar', 'Radar Chart', ['能力雷达', '多维对比', '评分维度', '成熟度'], [
    '所有 axis 必须共享同一数值尺度和方向（越高越好或越高越差要一致）；每条 curve 使用同一组 axis。',
    '维度应彼此区分且具有决策意义，不把高度相关的同义指标拆成多个轴。',
  ], [
    '推荐 3~8 个轴、1~4 条 curve；维度或对象更多时优先改用表格/条形图。',
  ], [
    '轴顺序尽量让相近主题相邻；曲线过多时减少比较对象而不是继续叠色。',
  ], [
    '不同轴使用不同量纲却不归一化',
    '用主观精确分数冒充测量结果',
    '超过 5 条曲线叠在一张雷达图',
  ], [
    '优先读取评测、评分或明确的归一化数据；主观评价必须注明为估计。',
  ]),

  extendedSkill('treemap', 'Treemap', ['层级占比', '资源分布', '容量分布', '成本构成', '目录规模'], [
    'Treemap 用面积表达同一量纲的层级组成；父子结构必须真实存在，叶节点 value 必须可比较。',
    '层级最多保留 2~3 层，让面积比较仍然可读；更深层级应拆成 drill-down 图。',
  ], [
    '优先 5~30 个叶节点；大量微小项聚合为业务上合理的“其他”。',
  ], [
    '标签优先展示名称和关键值，不在小矩形内塞入长文本。',
  ], [
    '用面积表示无法比较的不同单位',
    '层级过深导致大量不可读小块',
    '把普通组织树误用成 Treemap',
  ], [
    '优先从容量、成本、文件大小、流量等可加总数据提取层级和 value。',
  ]),

  extendedSkill('ishikawa', 'Ishikawa / Fishbone', ['鱼骨图', '根因分析', '原因分析', '故障原因', '质量问题'], [
    '鱼头只描述一个明确问题/结果；一级骨表示互斥度较高的原因类别，二三级骨表示可验证的具体原因。',
    '原因分类根据领域选择，例如人/流程/技术/环境/数据/管理，不机械套用 6M。',
    'Mermaid 11.17 Ishikawa 使用缩进式 quoted DSL：ishikawa-beta 后第一层直接写问题字符串，下一层写原因类别，再下一层写具体原因；不要输出 title/effect/category/cause 关键字，它们不是 Mermaid Ishikawa 语法。',
  ], [
    '建议 3~8 个一级原因，每类 1~6 个具体原因；过多原因先聚类再展示。',
  ], [
    '原因短语使用“可验证的原因”而不是解决方案或泛泛评价。',
  ], [
    '把解决措施写成原因',
    '一级分类互相重叠严重',
    '没有证据就把某个原因标成根因',
    '生成 title/effect/category/cause 伪 DSL',
  ], [
    '优先从事故复盘、日志、缺陷记录和用户提供事实中提炼候选原因；区分已证实与待验证原因。',
  ]),
]
