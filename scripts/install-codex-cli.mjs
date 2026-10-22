#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const marketplace = 'diagram-plugin-npm'
const plugin = `diagram-plugin@${marketplace}`
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('安装 Codex Diagram 插件：npx @weimin96/diagram-plugin install --codex')
} else if (args.length !== 2 || args[0] !== 'install' || args[1] !== '--codex') {
  console.error('不支持的参数。使用：diagram-plugin install --codex')
  process.exitCode = 2
} else {
  try {
    await install()
  } catch (error) {
    console.error(`Codex Diagram 安装失败：${error.message}`)
    process.exitCode = 1
  }
}

async function install() {
  const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'))
  const target = path.join(codexHome, marketplace)
  await mkdir(codexHome, { recursive: true })
  const manifest = JSON.parse(await readFile(path.join(root, '.agents/plugins/marketplace.json'), 'utf8'))
  if (manifest.name !== marketplace || manifest.plugins?.[0]?.source?.path !== '.') {
    throw new Error('npm 包缺少完整的 Codex marketplace 配置，请安装新版 npm 包')
  }
  for (const filename of ['.codex-plugin/plugin.json', '.mcp.json', 'dist/server.mjs', 'dist/app.js', 'dist/app.css']) {
    await stat(path.join(root, filename))
  }

  const run = (args) => execFileSync('codex', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim()
  let markets
  try {
    markets = JSON.parse(run(['plugin', 'marketplace', 'list', '--json'])).marketplaces
  } catch (error) {
    throw new Error(`无法执行 Codex CLI，请先安装最新 Codex：${error.message}`)
  }
  const installedMarket = markets.find((entry) => entry.name === marketplace)
  let oldTarget = false
  try {
    oldTarget = (await readFile(path.join(target, '.agents/plugins/marketplace.json'), 'utf8')).includes(`"name": "${marketplace}"`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    try {
      await stat(target)
      throw new Error(`安装目录已存在且不是本插件：${target}`)
    } catch (statError) {
      if (statError.code !== 'ENOENT') throw statError
    }
  }
  if (installedMarket && !oldTarget) throw new Error('已注册的 marketplace 缺少原始文件，避免自动覆盖')
  if (installedMarket && await realpath(installedMarket.root) !== await realpath(target)) {
    throw new Error(`${marketplace} 已指向其他位置，不能覆盖现有用户配置`)
  }
  const installedPlugins = JSON.parse(run(['plugin', 'list', '--json'])).installed
  const conflicting = installedPlugins.find((entry) => entry.installed && entry.name === 'diagram-plugin' && entry.pluginId !== plugin)
  if (conflicting) {
    throw new Error(`已安装另一来源的 Diagram（${conflicting.pluginId}），请先执行 codex plugin remove ${conflicting.pluginId}，避免重复注册`)
  }
  const installedPlugin = installedPlugins.some((entry) => entry.pluginId === plugin && entry.installed)

  const staging = await mkdtemp(path.join(codexHome, '.diagram-plugin-stage-'))
  const backup = path.join(codexHome, `.diagram-plugin-previous-${randomUUID()}`)
  let backedUp = false
  let registered = false
  let installedNew = false
  let removedExistingMarket = false
  try {
    for (const entry of ['.agents', '.codex-plugin', '.mcp.json', 'dist', 'assets']) {
      await cp(path.join(root, entry), path.join(staging, entry), { recursive: true })
    }
    if (installedMarket) {
      if (installedPlugin) run(['plugin', 'remove', plugin])
      run(['plugin', 'marketplace', 'remove', marketplace])
      removedExistingMarket = true
    }
    if (oldTarget) {
      // Only managed directories are ever replaced; leave a recovery copy until success.
      await rename(target, backup)
      backedUp = true
    }
    await rename(staging, target)
    installedNew = true
    run(['plugin', 'marketplace', 'add', target, '--json'])
    registered = true
    run(['plugin', 'add', plugin, '--json'])
    const available = JSON.parse(run(['plugin', 'marketplace', 'list', '--json'])).marketplaces
    if (!available.some((entry) => entry.name === marketplace)) throw new Error('Codex marketplace 注册未生效')
    await rm(backup, { recursive: true, force: true })
    console.log('Diagram 已安装到 Codex。请重新打开 Codex Desktop。')
  } catch (error) {
    if (registered) run(['plugin', 'marketplace', 'remove', marketplace])
    if (installedNew) await rm(target, { recursive: true, force: true })
    if (backedUp) await rename(backup, target)
    if (removedExistingMarket) {
      run(['plugin', 'marketplace', 'add', target])
      if (installedPlugin) run(['plugin', 'add', plugin])
    }
    throw error
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
