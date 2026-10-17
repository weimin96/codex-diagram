/** Mermaid 部分图种的原生 viewBox 未计入标题和数值标签。只扩展真实越界内容。 */
export function fitMermaidSvgToContent(markup: string, background?: string): string {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none'
  host.innerHTML = markup
  document.body.appendChild(host)
  try {
    const svg = host.querySelector('svg')
    if (!svg) throw new Error('Mermaid 没有返回有效的 SVG。')
    const view = svg.viewBox.baseVal
    const matrix = svg.getScreenCTM()
    if (!matrix || !view.width || !view.height) throw new Error('无法测量 Mermaid 图表边界。')
    const inverse = matrix.inverse()
    let left = view.x
    let top = view.y
    let right = view.x + view.width
    let bottom = view.y + view.height
    for (const element of svg.querySelectorAll('text, foreignObject, image')) {
      if (!element.textContent?.trim() && element.tagName !== 'image' && !element.querySelector('img,svg')) continue
      const bounds = element.getBoundingClientRect()
      if (!bounds.width || !bounds.height) continue
      const start = new DOMPoint(bounds.left, bounds.top).matrixTransform(inverse)
      const end = new DOMPoint(bounds.right, bounds.bottom).matrixTransform(inverse)
      if (start.x < left - 1) left = start.x - 8
      if (start.y < top - 1) top = start.y - 8
      if (end.x > right + 1) right = end.x + 8
      if (end.y > bottom + 1) bottom = end.y + 8
    }
    const changed = left !== view.x || top !== view.y || right !== view.x + view.width || bottom !== view.y + view.height
    if (!changed && !background) return markup
    if (changed) {
      svg.setAttribute('viewBox', `${left} ${top} ${right - left} ${bottom - top}`)
      svg.setAttribute('width', String(right - left))
      svg.setAttribute('height', String(bottom - top))
      svg.style.removeProperty('max-width')
    }
    if (background) svg.style.backgroundColor = background
    return new XMLSerializer().serializeToString(svg)
  } finally {
    host.remove()
  }
}
