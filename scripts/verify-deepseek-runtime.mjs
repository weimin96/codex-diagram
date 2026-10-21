import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

// Run with the target Desktop's Electron in Node mode, against its shipped API implementation.
const dshRoot = process.argv[2]
if (!dshRoot) throw new Error('请传入 Desktop app.asar/dsh 的绝对路径，并使用其 Electron 运行。')
const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-native-runtime-'))
const bundlePath = path.resolve('package/dist/.deepseek-runtime-check.mjs')
const disposers = []
try {
  const dependency = pathToFileURL(path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js')).href
  const source = (await readFile('package/dist/deepseek-host.mjs', 'utf8'))
    .replace('from "@deepseek-ai/dsh-mcp-client"', `from ${JSON.stringify(dependency)}`)
  await writeFile(bundlePath, source)
  const { apply } = await import(pathToFileURL(bundlePath).href)
  const definitions = new Map(), routes = new Map()
  let instructions = ''
  const workspacePath = await realpath(root)
  const ctx = {
    effect(setup) { const dispose = setup(); if (typeof dispose === 'function') disposers.push(dispose) },
    tools: { register(definition) { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) } },
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } },
    workingDirectory: { get: () => workspacePath },
    sessionController: { inspect: async () => ({ meta: { cwd: workspacePath }, events: [] }) },
    systemPrompt: { section(section) { instructions = section.text } },
  }
  await apply(ctx)
  assert.ok(definitions.has('diagram_create'))
  assert.ok(!definitions.has('diagram_applyProposal'))
  assert.match(instructions, /diagram_designGuide/)
  const signal = new AbortController().signal
  const execution = { agent: { session: { id: 'native-session' } }, signal }
  const created = await definitions.get('diagram_create').execute({ type: 'flowchart', title: '原生运行时验证' }, execution)
  const diagram = created.structuredContent.diagram
  assert.ok(diagram.path.endsWith('.mmd'))
  const route = routes.get('/api/diagram/call')
  const request = (method, params) => route.fetch(new Request('http://localhost/api/diagram/call', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'native-session', method, params }),
  }))
  const response = await request('tool', { name: 'diagram.get', arguments: { path: diagram.path } })
  assert.equal(response.status, 200)
  const result = (await response.json()).result
  assert.equal(result.structuredContent.diagram.path, diagram.path)
  const rejected = await request('tool', { name: 'diagram.list', arguments: { workspacePath: os.homedir() } })
  assert.equal(rejected.status, 400)
  const app = await routes.get('/api/diagram/app').fetch()
  assert.match(await app.text(), /data-diagram-host="deepseek"/)
  console.log(`DeepSeek 原生 MCP 结果适配与 Diagram 服务链路通过，注册 ${definitions.size} 个模型工具。`)
} finally {
  for (const dispose of disposers.reverse()) await dispose()
  await rm(bundlePath, { force: true })
  await rm(root, { recursive: true, force: true })
}
