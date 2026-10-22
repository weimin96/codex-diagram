import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { boundArguments, inspectionDirectory, isModelTool, toolName } from '../../integrations/deepseek/bridge.mjs'

async function connect() {
  const client = new Client({ name: 'diagram-integration', version: '1.0.0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [path.resolve('package/dist/server.mjs')], cwd: os.tmpdir(),
    env: { ...process.env, DIAGRAM_PLUGIN_HOST: 'deepseek' }, stderr: 'inherit',
  }))
  return client
}
function call(client, workspacePath, sessionId, name, args = {}) {
  return client.callTool({ name, arguments: args, _meta: { 'diagram/context': { host: 'deepseek', sessionId, workspacePath } } })
}

test('DeepSeek 适配拒绝跨工作区操作，模型不暴露面板内部工具', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-bridge-'))
  try {
    await mkdir(path.join(root, 'outside'))
    assert.equal((await boundArguments({}, root)).workspacePath, await realpath(root))
    await assert.rejects(boundArguments({ workspacePath: path.join(root, 'outside') }, root), /超出/)
    assert.equal(isModelTool({ _meta: { ui: { visibility: ['app'] } } }), false)
    assert.equal(isModelTool({}), true)
    assert.equal(toolName('diagram.proposeUpdate'), 'diagram_proposeUpdate')
    assert.equal(inspectionDirectory({ meta: { cwd: '/original' }, events: [{ type: 'working-directory/change', data: { cwd: '/changed' } }] }), '/changed')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('真实 stdio 服务隔离会话与项目，缺失身份显式失败', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-sessions-'))
  const client = await connect()
  try {
    const first = path.join(root, 'first'), second = path.join(root, 'second')
    await Promise.all([mkdir(first), mkdir(second)])
    const a = await call(client, first, 'session-a', 'diagram.create', { type: 'flowchart', title: '项目甲' })
    const b = await call(client, second, 'session-b', 'diagram.create', { type: 'flowchart', title: '项目乙' })
    assert.equal(a.isError, undefined)
    assert.equal(b.isError, undefined)
    const aState = await call(client, first, 'session-a', 'diagram.threadState')
    const bState = await call(client, second, 'session-b', 'diagram.threadState')
    // Internal state uses the text bridge, exactly as the production editor does.
    assert.ok(JSON.stringify(aState).includes(a.structuredContent.diagram.path))
    assert.ok(!JSON.stringify(aState).includes(b.structuredContent.diagram.path))
    assert.ok(JSON.stringify(bState).includes(b.structuredContent.diagram.path))
    assert.equal((await client.callTool({ name: 'diagram.list', arguments: {} })).isError, true)
    assert.equal((await call(client, first, 'session-a', 'diagram.list', { workspacePath: first })).isError, undefined)
    assert.equal((await call(client, second, 'session-b', 'diagram.list', { workspacePath: first })).isError, true)
    assert.equal((await call(client, second, 'session-b', 'diagram.openWorkspace', { workspacePath: first })).isError, true)
    const visible = (await client.listTools()).tools.filter(isModelTool)
    assert.ok(visible.some((tool) => tool.name === 'diagram.create'))
    assert.ok(!visible.some((tool) => tool.name === 'diagram.applyProposal'))
  } finally { await client.close(); await rm(root, { recursive: true, force: true }) }
})

test('两个服务进程竞争同一图表版本时只允许一个写入成功', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-processes-'))
  const clients = await Promise.all([connect(), connect()])
  try {
    const created = (await call(clients[0], root, 'session-a', 'diagram.create', { type: 'flowchart', title: '并发写入' })).structuredContent.diagram
    const sources = ['flowchart LR\n A-->B\n', 'flowchart LR\n A-->C\n']
    const results = await Promise.all(clients.map((client, index) => call(client, root, `session-${index}`, 'diagram.update', {
      path: created.path, source: sources[index], expectedModifiedAt: created.modifiedAt,
    })))
    assert.equal(results.filter((result) => !result.isError).length, 1)
    assert.match(JSON.stringify(results.find((result) => result.isError)), /已被其他编辑器修改/)
    assert.equal(await readFile(path.join(root, created.path), 'utf8'), sources[results.findIndex((result) => !result.isError)])
  } finally { await Promise.all(clients.map((client) => client.close())); await rm(root, { recursive: true, force: true }) }
})


test('候选修改属于原会话，接受前不写盘，确认后才保存', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-proposal-'))
  const client = await connect()
  try {
    const created = (await call(client, root, 'proposal-owner', 'diagram.create', { type: 'flowchart', title: '待确认修改' })).structuredContent.diagram
    const candidate = 'flowchart LR\n A-->Approved\n'
    const proposal = await call(client, root, 'proposal-owner', 'diagram.proposeUpdate', { path: created.path, source: candidate })
    assert.equal(proposal.isError, undefined)
    assert.equal(await readFile(path.join(root, created.path), 'utf8'), created.source)
    assert.equal((await call(client, root, 'other-session', 'diagram.applyProposal')).isError, true)
    assert.equal((await call(client, root, 'proposal-owner', 'diagram.applyProposal')).isError, undefined)
    assert.equal(await readFile(path.join(root, created.path), 'utf8'), candidate)
  } finally { await client.close(); await rm(root, { recursive: true, force: true }) }
})

test('会话切换工作目录后不能应用原项目的候选修改', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-directory-change-'))
  const client = await connect()
  try {
    const changed = path.join(root, 'changed')
    await mkdir(changed)
    const created = (await call(client, root, 'moving-session', 'diagram.create', { type: 'flowchart', title: '原项目候选' })).structuredContent.diagram
    await call(client, root, 'moving-session', 'diagram.proposeUpdate', { path: created.path, source: 'flowchart LR\n A-->Changed\n' })
    const applied = await call(client, changed, 'moving-session', 'diagram.applyProposal')
    assert.equal(applied.isError, true)
    assert.equal(await readFile(path.join(root, created.path), 'utf8'), created.source)
  } finally { await client.close(); await rm(root, { recursive: true, force: true }) }
})

test('长期运行时按最近访问清理旧会话 Proposal，不删除已保存图表', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-session-cleanup-'))
  const client = await connect()
  try {
    const created = (await call(client, root, 'old-session', 'diagram.create', { type: 'flowchart', title: '保留文件' })).structuredContent.diagram
    await call(client, root, 'old-session', 'diagram.proposeUpdate', { path: created.path, source: 'flowchart LR\n A-->B\n' })
    for (let index = 0; index <= 512; index++) {
      const result = await call(client, root, `new-session-${index}`, 'diagram.threadState')
      assert.equal(result.isError, undefined)
    }
    assert.equal((await call(client, root, 'old-session', 'diagram.applyProposal')).isError, true)
    assert.equal(await readFile(path.join(root, created.path), 'utf8'), created.source)
  } finally { await client.close(); await rm(root, { recursive: true, force: true }) }
})
