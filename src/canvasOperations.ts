import type { CanvasArrow, CanvasElement, CanvasNode, CanvasNote, CanvasScene } from './canvas.js'

export function copyCanvasSelection(scene: CanvasScene, ids: string[]): CanvasElement[] {
  const chosen = new Set(ids)
  return scene.elements
    .filter((item) => chosen.has(item.id) || (item.type === 'arrow' && chosen.has(item.from) && chosen.has(item.to)))
    .map((item) => ({ ...item }))
}

export function pasteCanvasSelection(scene: CanvasScene, copied: CanvasElement[], offset = 32): { scene: CanvasScene; selectedIds: string[] } {
  const idMap = new Map<string, string>()
  const used: Array<Pick<CanvasElement, 'id'>> = [...scene.elements]
  const boxes = copied.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => {
    const id = nextCanvasElementId(item.type, used)
    idMap.set(item.id, id)
    const pasted = {
      ...item,
      id,
      x: clamp(item.x + offset, 0, scene.width - item.width),
      y: clamp(item.y + offset, 0, scene.height - item.height),
    }
    used.push(pasted)
    return pasted
  })
  const arrows = copied.filter((item): item is CanvasArrow => item.type === 'arrow').flatMap((item) => {
    const from = idMap.get(item.from)
    const to = idMap.get(item.to)
    if (!from || !to) return []
    const pasted: CanvasArrow = { ...item, id: nextCanvasElementId('arrow', used), from, to }
    used.push(pasted)
    return [pasted]
  })
  return {
    scene: { ...scene, elements: [...scene.elements, ...boxes, ...arrows] },
    selectedIds: boxes.map((item) => item.id),
  }
}

export function deleteCanvasSelection(scene: CanvasScene, ids: string[]): CanvasScene {
  const removed = new Set(ids)
  return {
    ...scene,
    elements: scene.elements.filter((item) => (
      !removed.has(item.id)
      && !(item.type === 'arrow' && (removed.has(item.from) || removed.has(item.to)))
    )),
  }
}

export function alignCanvasSelection(scene: CanvasScene, ids: string[], axis: 'x' | 'y', grid = 16): CanvasScene {
  const chosen = scene.elements.filter((item): item is CanvasNode | CanvasNote => ids.includes(item.id) && item.type !== 'arrow' && !item.locked)
  if (chosen.length < 2) return scene
  const target = axis === 'x'
    ? chosen.reduce((sum, item) => sum + item.x + item.width / 2, 0) / chosen.length
    : chosen.reduce((sum, item) => sum + item.y + item.height / 2, 0) / chosen.length
  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow' || !ids.includes(item.id) || item.locked) return item
      return axis === 'x'
        ? { ...item, x: clamp(snap(target - item.width / 2, grid), 0, scene.width - item.width) }
        : { ...item, y: clamp(snap(target - item.height / 2, grid), 0, scene.height - item.height) }
    }),
  }
}

export function distributeCanvasSelection(scene: CanvasScene, ids: string[], axis: 'x' | 'y', grid = 16): CanvasScene {
  const chosen = scene.elements
    .filter((item): item is CanvasNode | CanvasNote => ids.includes(item.id) && item.type !== 'arrow' && !item.locked)
    .sort((a, b) => axis === 'x' ? a.x - b.x : a.y - b.y)
  if (chosen.length < 3) return scene

  const first = chosen[0]
  const last = chosen[chosen.length - 1]
  const firstCenter = axis === 'x' ? first.x + first.width / 2 : first.y + first.height / 2
  const lastCenter = axis === 'x' ? last.x + last.width / 2 : last.y + last.height / 2
  const step = (lastCenter - firstCenter) / (chosen.length - 1)
  const positions = new Map<string, number>()
  chosen.forEach((item, index) => {
    const center = firstCenter + step * index
    const value = axis === 'x' ? center - item.width / 2 : center - item.height / 2
    positions.set(item.id, snap(value, grid))
  })

  return {
    ...scene,
    elements: scene.elements.map((item) => {
      if (item.type === 'arrow') return item
      const next = positions.get(item.id)
      if (next === undefined) return item
      return axis === 'x'
        ? { ...item, x: clamp(next, 0, scene.width - item.width) }
        : { ...item, y: clamp(next, 0, scene.height - item.height) }
    }),
  }
}

export function reorderCanvasSelection(scene: CanvasScene, ids: string[], direction: 'front' | 'back'): CanvasScene {
  const selected = new Set(ids)
  const arrows = scene.elements.filter((item) => item.type === 'arrow')
  const boxes = scene.elements.filter((item) => item.type !== 'arrow')
  const chosen = boxes.filter((item) => selected.has(item.id))
  if (chosen.length === 0) return scene
  const rest = boxes.filter((item) => !selected.has(item.id))
  return {
    ...scene,
    elements: direction === 'front'
      ? [...arrows, ...rest, ...chosen]
      : [...arrows, ...chosen, ...rest],
  }
}

export function nextCanvasElementId(prefix: string, elements: Array<Pick<CanvasElement, 'id'>>): string {
  const used = new Set(elements.map((item) => item.id))
  for (let index = 1; index < 100_000; index += 1) {
    const id = `${prefix}-${index}`
    if (!used.has(id)) return id
  }
  return `${prefix}-${Date.now()}`
}

function snap(value: number, grid: number) {
  return Math.round(value / grid) * grid
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
