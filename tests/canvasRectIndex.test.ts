import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRectIndex, type CanvasRect } from '../src/canvasRectIndex.js'

interface Item extends CanvasRect { id: number }

const overlaps = (left: CanvasRect, right: CanvasRect) => left.x < right.x + right.width
  && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y

test('空间索引和完整扫描返回相同的节点碰撞结果', () => {
  let seed = 13841
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const rect = (id: number): Item => ({
    id,
    x: Math.floor(random() * 16000) - 8000,
    y: Math.floor(random() * 12000) - 6000,
    width: Math.floor(random() * 350) + 12,
    height: Math.floor(random() * 300) + 12,
  })
  const items = Array.from({ length: 650 }, (_, index) => rect(index))
  const index = new CanvasRectIndex(items)
  for (let n = 0; n < 350; n += 1) {
    const query = rect(1000 + n)
    const exclude = n % 9
    assert.equal(index.overlaps(query, (item) => item.id % 9 !== exclude),
      items.some((item) => item.id % 9 !== exclude && overlaps(query, item)), `查询 ${n}`)
  }
})

test('支持超大矩形、负坐标、增量插入和边缘相接', () => {
  const index = new CanvasRectIndex<Item>()
  index.add({ id: 1, x: -1800, y: -1600, width: 7200, height: 6000 })
  assert.equal(index.overlaps({ x: -1700, y: -1500, width: 1, height: 1 }), true)
  assert.equal(index.overlaps({ x: 5400, y: 0, width: 20, height: 20 }), false)
  index.add({ id: 2, x: 5400, y: 0, width: 180, height: 40 })
  assert.equal(index.overlaps({ x: 5400, y: 0, width: 20, height: 20 }), true)
  assert.equal(index.overlaps({ x: 5400, y: 0, width: 20, height: 20 }, (item) => item.id !== 2), false)
  assert.equal(index.overlaps({ x: -10000, y: -10000, width: 19000, height: 20000 }), true)
})
