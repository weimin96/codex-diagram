import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { diagramVisualStyles } from '../src/diagramVisualStyles.js'
import { createTemplate } from '../src/templates.js'
import { mermaidDiagramTypes } from '../src/types.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspace = await mkdtemp(path.join(os.tmpdir(), 'diagram-style-matrix-'))
const execute = promisify(execFile)
const results: Array<{ style: string; renders: number }> = []
try {
  for (const style of diagramVisualStyles) {
    const directory = path.join(workspace, style.id)
    await mkdir(directory)
    await Promise.all(mermaidDiagramTypes.map(({ type }) => writeFile(
      path.join(directory, `${type}.mmd`),
      `%% codex-diagram:style=${style.id}\n${createTemplate(type, '样式验证')}`,
      'utf8',
    )))
    try {
      const result = await execute(process.execPath, [path.join(root, 'scripts/visual-smoke.mjs'), '--source-dir', directory, '--quality-benchmark'], { cwd: root, maxBuffer: 4 * 1024 * 1024 })
      if (!result.stdout.includes(`passed: ${mermaidDiagramTypes.length * 2} browser renders`)) throw new Error(`浏览器未返回完整样式结果：${result.stdout}`)
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string }
      throw new Error(`${style.id} 样式验证失败：\n${failure.stdout ?? ''}\n${failure.stderr ?? failure.message}`, { cause: error })
    }
    results.push({ style: style.id, renders: mermaidDiagramTypes.length * 2 })
    console.log(`${style.id}: ${mermaidDiagramTypes.length} 种图表 × 明暗主题，通过`)
  }
  const output = path.join(root, 'test-results', 'visual-styles')
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'summary.json'), `${JSON.stringify({ styles: results, renders: results.reduce((sum, row) => sum + row.renders, 0) }, null, 2)}\n`)
  console.log(`共享样式矩阵通过：${results.reduce((sum, row) => sum + row.renders, 0)} 次真实浏览器渲染。`)
} finally {
  await rm(workspace, { recursive: true, force: true })
}
