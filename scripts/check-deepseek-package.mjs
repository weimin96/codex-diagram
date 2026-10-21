import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

if (process.argv.length !== 3) throw new Error('请传入唯一的 npm tarball 路径。')
const archive = path.resolve(process.argv[2])
const rootManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-release-'))
let client
try {
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  assert.ok(entries.every((entry) => /^package\/(?:dist\/[^/]+\.(?:mjs|js|css)|assets\/[^/]+\.svg|package\.json|cordis\.patch\.yml|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md)$/.test(entry)), '发布包包含非运行时文件。')
  execFileSync('tar', ['-xzf', archive, '-C', root])
  const packageRoot = path.join(root, 'package')
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@weimin96/diagram-deepseek')
  assert.equal(manifest.version, rootManifest.version)
  assert.equal(manifest.license, rootManifest.license)
  assert.equal(manifest.publishConfig.access, 'public')
  for (const file of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.ok((await readFile(path.join(packageRoot, file), 'utf8')).trim())
  const patch = await readFile(path.join(packageRoot, manifest.dsh.bundle.patch), 'utf8')
  assert.ok(patch.includes(`name: '${manifest.name}'`))
  const clientSource = await readFile(path.join(packageRoot, manifest.exports['./client']), 'utf8')
  assert.ok(clientSource.includes(`id:"${manifest.name}"`))
  assert.ok(!clientSource.includes('@local/diagram-deepseek'))

  client = new Client({ name: 'diagram-release-check', version: '1.0.0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.join(packageRoot, 'dist/server.mjs')],
    cwd: os.tmpdir(),
    env: { ...process.env, CODEX_DIAGRAM_HOST: 'deepseek' },
    stderr: 'inherit',
  }))
  const tools = (await client.listTools()).tools
  assert.ok(tools.some((tool) => tool.name === 'diagram.create'))
  const result = await client.callTool({
    name: 'diagram.create', arguments: { type: 'flowchart', title: '发布包验收' },
    _meta: { 'diagram/context': { host: 'deepseek', sessionId: 'release-check', workspacePath: root } },
  })
  assert.ok(!result.isError, JSON.stringify(result))
  const diagram = result.structuredContent.diagram
  assert.ok((await readFile(path.join(root, diagram.path), 'utf8')).includes('flowchart'))
  console.log(`${manifest.name}@${manifest.version} tarball 验证通过：${entries.length} 个文件，可从项目外启动并创建图表。`)
} finally {
  await client?.close()
  await rm(root, { recursive: true, force: true })
}
