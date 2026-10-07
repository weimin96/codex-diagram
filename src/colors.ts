export function normalizeMermaidColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (!trimmed) return fallback

  const srgb = trimmed.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i)
  if (srgb) {
    const red = channel(srgb[1])
    const green = channel(srgb[2])
    const blue = channel(srgb[3])
    const alpha = srgb[4] == null ? 1 : Math.min(1, Math.max(0, Number(srgb[4])))
    return alpha >= 1
      ? `rgb(${red}, ${green}, ${blue})`
      : `rgba(${red}, ${green}, ${blue}, ${trimAlpha(alpha)})`
  }

  if (/^(?:#[\da-f]{3,8}|rgba?\(|hsla?\()/i.test(trimmed)) return trimmed
  return fallback
}

function channel(value: string): number {
  return Math.round(Math.min(1, Math.max(0, Number(value))) * 255)
}

function trimAlpha(value: number): string {
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}
