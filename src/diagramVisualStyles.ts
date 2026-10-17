import type { CanvasNode, CanvasNote, CanvasTone } from './canvas.js'

export const diagramVisualStyles = [
  { id: 'ocean', label: '蓝色产品', usage: '产品方案、接口流程、技术说明；蓝色主链、白色节点、柔和投影' },
  { id: 'warm', label: '暖色叙事', usage: '业务说明、知识梳理、培训材料；纸色背景、暖色线条、衬线标题' },
  { id: 'ink', label: '高对比评审', usage: '评审、汇报、关键决策；实色节点、清晰边框、方正轮廓' },
  { id: 'pastel', label: '柔彩语义', usage: '跨角色流程、协作规划；按 tone 区分职责与状态，柔彩填充' },
  { id: 'forest', label: '森绿数据', usage: '数据模型、ER、检索与数据流；绿色层次、紧凑边框' },
  { id: 'blueprint', label: '工程蓝图', usage: '架构、时序、类图和技术评审；等宽字体、方正轮廓' },
  { id: 'rose', label: '玫瑰叙事', usage: '用户旅程、时间线、服务体验；暖粉色层次、柔和边角' },
  { id: 'violet', label: '紫罗兰方案', usage: '方案评审、能力地图、需求关系；紫色重点、清晰层次' },
  { id: 'amber', label: '琥珀运营', usage: '看板、甘特、计划和状态流转；琥珀色重点、克制边框' },
  { id: 'graphite', label: '石墨极简', usage: '正式文档、打印与高密信息；单色层次、细边框、方角' },
  { id: 'nord', label: '北欧冷静', usage: '系统说明、长期阅读、思维导图；冷灰蓝底、低饱和层次' },
  { id: 'coral', label: '珊瑚演示', usage: '演示、业务流程和数据摘要；珊瑚色主线、较大圆角' },
] as const
export type DiagramVisualStyle = typeof diagramVisualStyles[number]['id']

const palettes = {
  ocean: { accent: '#2563eb', success: '#15803d', warning: '#a16207', danger: '#be123c', muted: '#64748b', background: '#f3f7ff', darkBackground: '#151b29', fill: '#ffffff', radius: 12, font: 'Arial, sans-serif' },
  warm: { accent: '#9a4e2b', success: '#53734b', warning: '#96651a', danger: '#b33d43', muted: '#7c7065', background: '#faf6ec', darkBackground: '#211e1a', fill: '#fffdf7', radius: 4, font: 'Georgia, serif' },
  ink: { accent: '#4338ca', success: '#166534', warning: '#854d0e', danger: '#9f1239', muted: '#475569', background: '#ffffff', darkBackground: '#111827', fill: '#1e293b', radius: 2, font: 'Arial, sans-serif' },
  pastel: { accent: '#6d28d9', success: '#047857', warning: '#a16207', danger: '#be185d', muted: '#64748b', background: '#faf8ff', darkBackground: '#211b2e', fill: '#f1ebff', radius: 18, font: 'Arial, sans-serif' },
  forest: { accent: '#176b47', success: '#218253', warning: '#a16a16', danger: '#b43c48', muted: '#63716c', background: '#f3f8f4', darkBackground: '#14251e', fill: '#ffffff', radius: 6, font: 'Arial, sans-serif' },
  blueprint: { accent: '#1d4ed8', success: '#176c61', warning: '#9a650d', danger: '#b13f55', muted: '#536b83', background: '#f0f6ff', darkBackground: '#102238', fill: '#ffffff', radius: 2, font: 'ui-monospace, SFMono-Regular, monospace' },
  rose: { accent: '#a84068', success: '#35745e', warning: '#96621e', danger: '#b12d41', muted: '#806875', background: '#fcf3f6', darkBackground: '#2b1c25', fill: '#fffafd', radius: 16, font: 'Georgia, serif' },
  violet: { accent: '#6634ad', success: '#23795e', warning: '#98621b', danger: '#b13758', muted: '#726580', background: '#f7f3fd', darkBackground: '#221a32', fill: '#ffffff', radius: 10, font: 'Arial, sans-serif' },
  amber: { accent: '#98600e', success: '#357254', warning: '#ad7011', danger: '#af3d32', muted: '#7a7062', background: '#fcf8ee', darkBackground: '#2b2416', fill: '#fffdf7', radius: 8, font: 'Arial, sans-serif' },
  graphite: { accent: '#374151', success: '#4b6355', warning: '#77633b', danger: '#8c4750', muted: '#6b7280', background: '#ffffff', darkBackground: '#171a1f', fill: '#f9fafb', radius: 0, font: 'Arial, sans-serif' },
  nord: { accent: '#426a80', success: '#467467', warning: '#907047', danger: '#a05160', muted: '#6a7583', background: '#f0f4f7', darkBackground: '#202b37', fill: '#f9fbfc', radius: 8, font: 'Arial, sans-serif' },
  coral: { accent: '#b94837', success: '#377764', warning: '#926718', danger: '#a82e48', muted: '#856e69', background: '#fff5ef', darkBackground: '#30201d', fill: '#fffdfb', radius: 20, font: 'Arial, sans-serif' },
} as const

export function isDiagramVisualStyle(value: unknown): value is DiagramVisualStyle {
  return diagramVisualStyles.some((style) => style.id === value)
}

function mixStyleColor(color: string, background: string, amount: number): string {
  return `#${[1, 3, 5].map((offset) => Math.round(
    parseInt(color.slice(offset, offset + 2), 16) * amount
    + parseInt(background.slice(offset, offset + 2), 16) * (1 - amount),
  ).toString(16).padStart(2, '0')).join('')}`
}

export function canvasVisualSkin(style: DiagramVisualStyle | undefined, dark: boolean, tone: CanvasTone = 'default', primary = false) {
  if (!style) return undefined
  const palette = palettes[style]
  const accent = tone === 'default' ? palette.accent : palette[tone]
  const solid = style === 'ink' || primary
  return {
    background: dark ? palette.darkBackground : palette.background,
    fill: solid ? tone === 'default' && style === 'ink' ? palette.fill : accent
      : dark ? mixStyleColor(accent, palette.darkBackground, 0.18) : style === 'pastel' || tone !== 'default' ? `${accent}14` : palette.fill,
    text: solid || dark ? '#f8fafc' : style === 'warm' ? '#48372a' : '#243247',
    stroke: dark ? mixStyleColor(accent, '#ffffff', 0.52) : accent,
    edge: dark ? mixStyleColor(palette.accent, '#ffffff', 0.52) : style === 'warm' ? '#9a795b' : style === 'ink' ? '#334155' : palette.accent,
    radius: palette.radius,
    font: palette.font,
    shadow: style === 'ocean' ? 'drop-shadow(0px 4px 6px #0f172a18)' : 'none',
    strokeWidth: style === 'ink' ? 2 : 1.4,
  }
}

export function canvasStyledBox<T extends CanvasNode | CanvasNote>(item: T, skin: ReturnType<typeof canvasVisualSkin>): T {
  if (!skin || item.type === 'note') return item
  return {
    ...item,
    fillColor: item.fillColor ?? skin.fill,
    strokeColor: item.strokeColor ?? skin.stroke,
    strokeWidth: item.strokeWidth ?? skin.strokeWidth,
    ...(!item.shape || item.shape === 'rounded' ? { cornerRadius: item.cornerRadius ?? skin.radius } : {}),
  }
}

export function diagramVisualStyleGuide(format: 'canvas' | 'mermaid' = 'canvas'): string[] {
  return [
    format === 'canvas'
      ? '新建 Canvas（含架构与流程画布）时，AI 根据用途主动选择一套 scene.style；只保存样式名，不向节点批量写入颜色。用户指定的风格优先。'
      : '全部 Mermaid 图种均可使用共享样式；AI 根据图种和用途选择，在首部写一行 %% codex-diagram:style=<id>，不改变图种与业务内容。',
    ...diagramVisualStyles.map((style) => `${format === 'canvas' ? `scene.style="${style.id}"` : `%% codex-diagram:style=${style.id}`}（${style.label}）：${style.usage}。`),
    '同一张图只选一套样式，不按节点序号随机染色；保留真实语义和主次，不改变坐标、关系与业务文本。修改已有图时保留原样式，只有用户要求换风格才切换。',
    format === 'canvas' ? '架构画布的 architecture.theme 继续控制图元与边界形态，scene.style 控制共享色彩语言。' : 'technical/minimal/editorial/presentation 四个旧 Profile 仍然有效；不要与共享样式叠加多条声明。',
  ]
}

export function diagramStylePalette(style: DiagramVisualStyle, background: string) {
  const hex = background.match(/^#([0-9a-f]{6})$/i)
  const channels = hex ? [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16)) : background.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  const dark = Boolean(channels?.length === 3 && channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 < 128)
  const palette = palettes[style]
  const skin = canvasVisualSkin(style, dark)!
  const surface = dark ? mixStyleColor(palette.accent, palette.darkBackground, 0.12) : palette.fill
  return {
    dark,
    background: skin.background,
    surface: style === 'ink' ? dark ? '#273449' : '#f1f5f9' : surface,
    raised: dark ? mixStyleColor(palette.accent, palette.darkBackground, 0.22) : style === 'ink' ? '#e2e8f0' : mixStyleColor(palette.accent, '#ffffff', 0.1),
    muted: dark ? mixStyleColor(palette.accent, palette.darkBackground, 0.3) : mixStyleColor(palette.accent, '#ffffff', 0.17),
    text: dark ? '#f8fafc' : '#243247',
    secondaryText: dark ? '#c3cddc' : '#475569',
    border: dark ? mixStyleColor(palette.accent, '#ffffff', 0.52) : mixStyleColor(palette.accent, '#ffffff', 0.42),
    strongBorder: skin.stroke,
    accent: dark ? mixStyleColor(palette.accent, '#ffffff', 0.58) : palette.accent,
    success: dark ? mixStyleColor(palette.success, '#ffffff', 0.58) : palette.success,
    warning: dark ? mixStyleColor(palette.warning, '#ffffff', 0.58) : palette.warning,
    danger: dark ? mixStyleColor(palette.danger, '#ffffff', 0.58) : palette.danger,
    font: palette.font,
    radius: skin.radius,
    strokeWidth: skin.strokeWidth,
  }
}
