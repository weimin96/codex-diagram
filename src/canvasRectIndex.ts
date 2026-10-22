export interface CanvasRect { x: number; y: number; width: number; height: number }

// A transient broad-phase index. Exact rectangle intersection is still checked on lookup.
export class CanvasRectIndex<T extends CanvasRect> {
  private readonly cells = new Map<string, T[]>()
  private readonly large: T[] = []
  private readonly all: T[] = []
  private readonly order = new Map<T, number>()

  constructor(rectangles: readonly T[] = [], private readonly cellSize = 256) {
    for (const rect of rectangles) this.add(rect)
  }

  add(rect: T): void {
    this.order.set(rect, this.all.length)
    this.all.push(rect)
    const left = Math.floor(rect.x / this.cellSize)
    const right = Math.floor((rect.x + rect.width) / this.cellSize)
    const top = Math.floor(rect.y / this.cellSize)
    const bottom = Math.floor((rect.y + rect.height) / this.cellSize)
    if ((right - left + 1) * (bottom - top + 1) > 64) {
      this.large.push(rect)
      return
    }
    for (let x = left; x <= right; x += 1) {
      for (let y = top; y <= bottom; y += 1) {
        const key = `${x}:${y}`
        const bucket = this.cells.get(key)
        if (bucket) bucket.push(rect)
        else this.cells.set(key, [rect])
      }
    }
  }

  // Return intersecting rectangles in source order (SVG stacking order), plus pinned selections.
  find(query: CanvasRect, pinned: readonly T[] = []): T[] {
    const left = Math.floor(query.x / this.cellSize)
    const right = Math.floor((query.x + query.width) / this.cellSize)
    const top = Math.floor(query.y / this.cellSize)
    const bottom = Math.floor((query.y + query.height) / this.cellSize)
    const intersects = (rect: T) => rect.x < query.x + query.width
      && rect.x + rect.width > query.x && rect.y < query.y + query.height
      && rect.y + rect.height > query.y
    const retained = new Set(pinned)
    if ((right - left + 1) * (bottom - top + 1) > 2048) {
      return this.all.filter((rect) => retained.has(rect) || intersects(rect))
    }
    for (const rect of this.large) if (intersects(rect)) retained.add(rect)
    for (let x = left; x <= right; x += 1) {
      for (let y = top; y <= bottom; y += 1) {
        for (const rect of this.cells.get(`${x}:${y}`) ?? []) {
          if (!retained.has(rect) && intersects(rect)) retained.add(rect)
        }
      }
    }
    return [...retained].sort((a, b) => (this.order.get(a) ?? Infinity) - (this.order.get(b) ?? Infinity))
  }

  overlaps(query: CanvasRect, accept: (rect: T) => boolean = () => true): boolean {
    const left = Math.floor(query.x / this.cellSize)
    const right = Math.floor((query.x + query.width) / this.cellSize)
    const top = Math.floor(query.y / this.cellSize)
    const bottom = Math.floor((query.y + query.height) / this.cellSize)
    const intersects = (rect: T) => accept(rect)
      && rect.x < query.x + query.width && rect.x + rect.width > query.x
      && rect.y < query.y + query.height && rect.y + rect.height > query.y
    if ((right - left + 1) * (bottom - top + 1) > 64) return this.all.some(intersects)
    if (this.large.some(intersects)) return true
    const checked = new Set<T>()
    for (let x = left; x <= right; x += 1) {
      for (let y = top; y <= bottom; y += 1) {
        for (const rect of this.cells.get(`${x}:${y}`) ?? []) {
          if (checked.has(rect)) continue
          checked.add(rect)
          if (intersects(rect)) return true
        }
      }
    }
    return false
  }
}
