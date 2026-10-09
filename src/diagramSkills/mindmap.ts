import type { DiagramSkill } from './types.js'
import { commonMermaidModificationRules, commonMermaidVisualRules } from './common.js'

export const mindmapSkill: DiagramSkill = {
  type: 'mindmap',
  label: 'Mindmap',
  intentHints: ['脑图', '知识结构', '功能拆解', '主题分析', '能力地图'],
  compositionRules: [
    '根节点只表达一个中心问题；一级分支必须是互相可区分的维度，不把“背景/其他/补充”当主要分类。',
    '同层节点保持同一抽象粒度；叶子节点表达事实、任务或结论，不复制父节点措辞。',
    '优先 3~7 个一级分支，每个一级分支再展开 2~6 个二级主题；深度通常不超过 4 层。',
  ],
  densityRules: ['节点过多时优先减少深度或拆成多个专题脑图，不生成单根 100+ 叶子节点。'],
  visualRules: [...commonMermaidVisualRules, '视觉权重从中心向外递减；中心和一级主题最醒目，叶子保持紧凑。'],
  antiPatterns: ['一级分支混合不同抽象层', '把长段落直接放叶子', '只有一条很深的链还使用 mindmap'],
  generationRules: ['先确定分类维度，再填充子主题；不要按文件夹结构机械映射源码目录。'],
  modificationRules: [...commonMermaidModificationRules, '新增主题时先判断属于现有分支还是需要新增一级维度，避免随意挂到根节点。'],
}
