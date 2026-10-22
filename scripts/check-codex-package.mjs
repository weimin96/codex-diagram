import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

if (process.argv.length !== 3) throw new Error('请传入唯一的 npm tarball 路径。')
const archive = path.resolve(process.argv[2])
const root = await mkdtemp(path.join(os.tmpdir(), 'diagram-codex-release-'))
const codexHome = path.join(root, 'codex-home')
const env = { ...process.env, CODEX_HOME: codexHome }
const execute = (bin, args) => execFileSync(bin, args, { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

try {
  execFileSync('tar', ['-xzf', archive, '-C', root])
  const packageRoot = path.join(root, 'package')
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  const marketplace = JSON.parse(await readFile(path.join(packageRoot, '.agents/plugins/marketplace.json'), 'utf8'))
  const plugin = JSON.parse(await readFile(path.join(packageRoot, '.codex-plugin/plugin.json'), 'utf8'))
  const mcp = JSON.parse(await readFile(path.join(packageRoot, '.mcp.json'), 'utf8'))
  assert.equal(manifest.bin?.['diagram-plugin'], './bin/diagram-plugin.mjs')
  assert.equal(marketplace.name, 'diagram-plugin-npm')
  assert.equal(marketplace.plugins?.[0]?.source?.path, '.')
  assert.equal(plugin.version, manifest.version)
  assert.equal(plugin.mcpServers, './.mcp.json')
  assert.deepEqual(mcp.mcpServers['diagram-plugin'].args, ['./dist/server.mjs'])
  for (const name of ['dist/server.mjs', 'dist/app.js', 'dist/app.css', 'assets/icon.svg']) {
    await stat(path.join(packageRoot, name))
  }
  const installer = path.join(packageRoot, 'bin/diagram-plugin.mjs')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.match(execute(process.execPath, [installer, 'install', '--codex']), /Diagram 已安装到 Codex/)
    const sources = JSON.parse(execute('codex', ['plugin', 'marketplace', 'list', '--json'])).marketplaces
    const installed = JSON.parse(execute('codex', ['plugin', 'list', '--json'])).installed
    assert.equal(sources.filter((item) => item.name === marketplace.name).length, 1)
    assert.equal(installed.filter((item) => item.pluginId === 'diagram-plugin@diagram-plugin-npm' && item.enabled).length, 1)
    assert.equal(installed.find((item) => item.pluginId === 'diagram-plugin@diagram-plugin-npm').version, manifest.version)
    await stat(path.join(codexHome, 'diagram-plugin-npm/dist/server.mjs'))
  }
  console.log(`${manifest.name}@${manifest.version} Codex tarball 验证通过：独立环境首次安装、重复安装与已启用状态均正常。`)
} finally {
  await rm(root, { recursive: true, force: true })
}
