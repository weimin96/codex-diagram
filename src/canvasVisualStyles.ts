import type { CanvasNode, CanvasNote, CanvasTone } from './canvas.js'

export const canvasVisualStyles = [
  { id: 'ocean', label: '蓝色产品', usage: '产品方案、接口流程、技术说明；蓝色主链、白色节点、柔和投影' },
  { id: 'warm', label: '暖色叙事', usage: '业务说明、知识梳理、培训材料；纸色背景、暖色线条、衬线标题' },
  { id: 'ink', label: '高对比评审', usage: '评审、汇报、关键决策；实色节点、清晰边框、方正轮廓' },
  { id: 'pastel', label: '柔彩语义', usage: '跨角色流程、协作规划；按 tone 区分职责与状态，柔彩填充' },
] as const
export type CanvasVisualStyle = typeof canvasVisualStyles[number]['id']

const palettes = {
  ocean: { accent: '#2563eb', success: '#15803d', warning: '#a16207', danger: '#be123c', muted: '#64748b', background: '#f3f7ff', darkBackground: '#151b29', fill: '#ffffff', radius: 12, font: 'Arial, sans-serif' },
  warm: { accent: '#9a4e2b', success: '#53734b', warning: '#96651a', danger: '#b33d43', muted: '#7c7065', background: '#faf6ec', darkBackground: '#211e1a', fill: '#fffdf7', radius: 4, font: 'Georgia, serif' },
  ink: { accent: '#4338ca', success: '#166534', warning: '#854d0e', danger: '#9f1239', muted: '#475569', background: '#ffffff', darkBackground: '#111827', fill: '#1e293b', radius: 2, font: 'Arial, sans-serif' },
  pastel: { accent: '#6d28d9', success: '#047857', warning: '#a16207', danger: '#be185d', muted: '#64748b', background: '#faf8ff', darkBackground: '#211b2e', fill: '#f1ebff', radius: 18, font: 'Arial, sans-serif' },
} as const

export function isCanvasVisualStyle(value: unknown): value is CanvasVisualStyle {
  return canvasVisualStyles.some((style) => style.id === value)
}

function mixStyleColor(color: string, background: string, amount: number): string {
  return `#${[1, 3, 5].map((offset) => Math.round(
    parseInt(color.slice(offset, offset + 2), 16) * amount
    + parseInt(background.slice(offset, offset + 2), 16) * (1 - amount),
  ).toString(16).padStart(2, '0')).join('')}`
}

export function canvasVisualSkin(style: CanvasVisualStyle | undefined, dark: boolean, tone: CanvasTone = 'default', primary = false) {
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

export function canvasVisualStyleGuide(): string[] {
  return [
    '新建通用 Canvas/流程画布时，AI 根据用途主动选择一套 scene.style；只保存样式名，不向节点批量写入颜色。用户明确指定的风格优先。',
    ...canvasVisualStyles.map((style) => `scene.style="${style.id}"（${style.label}）：${style.usage}。`),
    '同一张图只选一套样式；通过已有 tone 与 emphasis 表达真实语义和主次，不按节点序号随机染色。style 只改变渲染，不改变坐标、关系、形状语义或业务文本。',
    '架构画布继续使用 architecture.theme 的 enterprise/technical/presentation/cloud/editorial/sketch，不叠加 scene.style；修改已有图时保留原 style，只有用户要求换风格才切换。',
  ]
}
