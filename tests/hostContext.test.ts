import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diagramSessionContext } from '../src/hosts/serverContext.js'

test('宿主上下文保留会话与绝对工作区，兼容没有扩展上下文的 Codex 请求', () => {
  assert.equal(diagramSessionContext({ threadId: 'codex-session' }), undefined)
  assert.deepEqual(diagramSessionContext({ 'diagram/context': { host: 'deepseek', sessionId: 'session-a', workspacePath: '/workspace/a' } }), {
    host: 'deepseek', sessionId: 'session-a', workspacePath: '/workspace/a',
  })
})

test('拒绝不完整或无效的宿主上下文', () => {
  for (const context of [null, {}, { host: 'deepseek', sessionId: '', workspacePath: '/workspace' }, { host: 'deepseek', sessionId: 'session', workspacePath: './project' }]) {
    assert.throws(() => diagramSessionContext({ 'diagram/context': context }), /无效/)
  }
})
