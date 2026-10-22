import assert from 'node:assert/strict'
import test from 'node:test'
import { createMermaidRenderQueue } from '../src/mermaidRenderQueue.js'

test('Mermaid 渲染串行执行且失败不阻断后续图表', async () => {
  const render = createMermaidRenderQueue()
  const events: string[] = []
  let finishFirst!: () => void
  const first = render(async () => {
    events.push('first:start')
    await new Promise<void>((resolve) => { finishFirst = resolve })
    events.push('first:finish')
    throw new Error('无效图表')
  })
  const second = render(async () => { events.push('second'); return '完成' })
  await Promise.resolve()
  assert.deepEqual(events, ['first:start'])
  finishFirst()
  await assert.rejects(first, /无效图表/)
  assert.equal(await second, '完成')
  assert.deepEqual(events, ['first:start', 'first:finish', 'second'])
})

test('失效的缩略图任务在执行前被丢弃', async () => {
  const render = createMermaidRenderQueue()
  let release!: () => void
  const first = render(async () => new Promise<void>((resolve) => { release = resolve }))
  let obsolete = false
  let invoked = false
  const stale = render(async () => { invoked = true }, () => obsolete)
  await Promise.resolve()
  obsolete = true
  release()
  await first
  await assert.rejects(stale, /过期/)
  assert.equal(invoked, false)
  assert.equal(await render(async () => '有效'), '有效')
})
