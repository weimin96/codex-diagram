export const commonMermaidVisualRules = [
  '只保留有决策价值的结构；图上文字短句化，详细解释留在图外，不把段落塞进节点、消息或状态。',
  '优先建立一个清晰阅读方向和一条主叙事线；次要分支降低视觉权重，不让所有元素同等抢眼。',
  '把图当作视觉论证而不是信息清单：主对象、关键关系和结果必须先被看到，辅助说明退到第二层级；不要把所有内容都包成相同大小的卡片。',
  '留白用于表达层级和边界；同一语义组内部可以紧凑，不同阶段/角色/领域之间要有可感知的间距。',
  '名称使用业务/技术事实，不使用“模块A / 服务B / 下一步”等占位词作为最终内容。',
  '同类元素命名和粒度保持一致；不要在同一张图里混用系统级、类级和方法级节点。',
  '当内容超过单屏可读密度时优先抽象、分区或拆图，不靠缩小字体硬塞。',
  '默认不要在 Mermaid 源码里写固定颜色的 style/classDef 或 %%{init}%% 主题覆盖；明暗主题和视觉 token 由 Diagram Visual Grammar 统一管理。只有用户明确要求特殊语义高亮时才例外。',
  '需要明显风格时只使用一条首部注释 `%% codex-diagram:style=<profile>`：technical 适合工程文档，minimal 适合小而直接的结构，editorial 适合叙事/知识表达，presentation 适合评审与汇报。未明确需要风格时省略，默认 technical；不要再用 style/classDef 重造主题。',
]

export const commonMermaidEvidenceRules = [
  '结构、名称、关系和数值优先来自已读取的代码、配置、Schema、计划或用户明确给出的事实；不确定内容不要伪装成确定事实。',
  '技术细节只保留能帮助理解关系的证据，例如协议、事件、关键字段、真实状态或数据口径；不要为了“专业感”堆砌无关 metadata。',
]

export const commonMermaidValidationRules = [
  '生成后检查主阅读路径是否能连续读完、是否存在孤立节点/未闭合分支，以及标签是否短到无需靠 HTML 或极小字体才能容纳。',
  '调用 diagram.inspectQuality 做一次结构/密度质量回检；修改已有图时把完整候选源码通过 source 传入，避免检查到旧版本。若返回 needsRevision=true，只针对报告的问题修正并再回检一次，不做无关重写。',
]

export const commonMermaidModificationRules = [
  '保留仍然正确的结构、顺序、分组和命名，仅修改用户要求影响的部分。',
  '不要为了“顺便美化”重写与当前修改无关的大段 Mermaid 源码。',
]
