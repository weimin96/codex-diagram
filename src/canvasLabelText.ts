let labelContext: CanvasRenderingContext2D | undefined
const labelTextLayouts = new Map<string, { lines: string[]; width: number; height: number }>()

function measureLabelText(text: string): number {
  if (typeof document === 'undefined') {
    // 服务端无浏览器字体，按全角和半角估算；预览与导出使用实际字形宽度。
    return Array.from(text).reduce((width, char) => width + (char.codePointAt(0)! > 255 ? 12 : 7), 0)
  }
  if (!labelContext) {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('无法测量图表关系标签。')
    labelContext = context
    labelContext.font = '600 12px Arial, sans-serif'
  }
  return labelContext.measureText(text).width
}

export function canvasArrowLabelText(label: string): { lines: string[]; width: number; height: number } {
  const cached = labelTextLayouts.get(label)
  if (cached) return cached
  let remaining = Array.from(label.replace(/\s+/g, ' ').trim())
  const lines: string[] = []
  const totalWidth = measureLabelText(remaining.join(''))
  const firstLineWidth = totalWidth > 200 ? Math.min(200, totalWidth / 2 + 6) : 200
  while (remaining.length && lines.length < 2) {
    let length = 0
    while (length < remaining.length && measureLabelText(remaining.slice(0, length + 1).join('')) <= (lines.length ? 200 : firstLineWidth)) length += 1
    if (length === remaining.length) {
      lines.push(remaining.join(''))
      break
    }
    if (lines.length === 1) {
      while (length > 0 && measureLabelText(`${remaining.slice(0, length).join('')}…`) > 200) length -= 1
      lines.push(`${remaining.slice(0, length).join('').trimEnd()}…`)
      break
    }
    const wordBoundary = remaining.slice(0, length).lastIndexOf(' ')
    const consumed = wordBoundary > 0 ? wordBoundary + 1 : Math.max(1, length)
    lines.push(remaining.slice(0, consumed).join('').trimEnd())
    remaining = remaining.slice(consumed)
  }
  if (!lines.length) lines.push('')
  const layout = {
    lines,
    width: Math.max(48, Math.ceil(Math.max(...lines.map(measureLabelText))) + 18),
    height: lines.length * 16 + 8,
  }
  if (labelTextLayouts.size >= 512) labelTextLayouts.delete(labelTextLayouts.keys().next().value!)
  labelTextLayouts.set(label, layout)
  return layout
}
