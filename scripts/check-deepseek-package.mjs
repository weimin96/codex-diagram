import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

if (process.argv.length !== 3) throw new Error('请传入唯一的 npm tarball 路径。')

/** 按 Node 的 exports 规则解析一个资源子路径，支持单个 `*` 通配。 */
function resolveExport(exports, resource) {
  const exact = exports[`./${resource}`]
  if (typeof exact === 'string') return exact
  for (const [key, target] of Object.entries(exports)) {
    const [prefix, suffix] = key.split('*')
    if (suffix === undefined || typeof target !== 'string') continue
    if (!key.startsWith('./') || !resource.startsWith(prefix.slice(2)) || !resource.endsWith(suffix)) continue
    return target.replace('*', resource.slice(prefix.length - 2, resource.length - suffix.length))
  }
  return undefined
}

const archive = path.resolve(process.argv[2])
const rootManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-release-'))
let client
try {
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  assert.ok(entries.every((entry) => /^package\/(?:dist\/[^/]+\.(?:mjs|js|css)|assets\/[^/]+\.svg|locale\/[a-z]{2}(?:-[a-z0-9]+)*\.json|bin\/diagram-plugin\.mjs|\.agents\/plugins\/marketplace\.json|\.codex-plugin\/plugin\.json|\.mcp\.json|package\.json|cordis\.patch\.yml|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md)$/.test(entry)), '发布包包含非运行时文件。')
  execFileSync('tar', ['-xzf', archive, '-C', root])
  const packageRoot = path.join(root, 'package')
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@weimin96/diagram-plugin')
  assert.equal(manifest.version, rootManifest.version)
  assert.equal(manifest.license, rootManifest.license)
  assert.equal(manifest.publishConfig.access, 'public')
  for (const file of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.ok((await readFile(path.join(packageRoot, file), 'utf8')).trim())
  const patch = await readFile(path.join(packageRoot, manifest.dsh.bundle.patch), 'utf8')
  assert.ok(patch.includes(`name: '${manifest.name}'`))
  const clientSource = await readFile(path.join(packageRoot, manifest.exports['./client']), 'utf8')
  assert.ok(clientSource.includes(`id:"${manifest.name}"`))
  assert.ok(!clientSource.includes('@local/diagram-plugin'))

  // 插件市场按 npm 关键词 dsh-plugin 自动扫描，并按 engines.dsh 判定兼容性。
  assert.ok(manifest.keywords?.includes('dsh-plugin'), '发布包缺少 dsh-plugin 关键词，插件市场将无法自动发现。')
  assert.equal(typeof manifest.engines?.dsh, 'string', '发布包缺少 engines.dsh，插件市场无法判定兼容性。')
  assert.ok(!manifest.engines.dsh.includes('workspace:'), 'engines.dsh 不能使用 workspace: 范围。')
  assert.ok(manifest.icon, '发布包缺少 icon，插件列表将没有图标。')
  const english = JSON.parse(await readFile(path.join(packageRoot, 'locale/en.json'), 'utf8'))
  assert.ok(english.meta?.title && english.meta?.description, 'locale/en.json 必须提供 meta.title 与 meta.description。')
  await readFile(path.join(packageRoot, 'locale/zh.json'), 'utf8')
  for (const resource of ['icon', 'locale/en.json', 'package.json']) {
    const target = resolveExport(manifest.exports, resource)
    assert.ok(target, `发布包 exports 未声明 ${resource}。`)
    await readFile(path.join(packageRoot, target))
  }

  client = new Client({ name: 'diagram-release-check', version: '1.0.0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.join(packageRoot, 'dist/server.mjs')],
    cwd: os.tmpdir(),
    env: { ...process.env, DIAGRAM_PLUGIN_HOST: 'deepseek' },
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
