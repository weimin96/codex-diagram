import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTemplate, detectDiagramType } from './templates.js'
import type { DiagramDocument, DiagramSummary, DiagramType } from './types.js'

const allowedExtensions = new Set(['.mmd', '.mermaid'])
const ignoredDirectories = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.turbo', '.cache', 'target',
])
const maxDepth = 7
const maxDiagrams = 500

export class DiagramStore {
  constructor(readonly workspacePath: string) {}

  static async open(input: string): Promise<DiagramStore> {
    const expanded = expandHome(input.trim())
    if (!expanded) throw new Error('请输入工作空间路径。')
    const resolved = await realpath(path.resolve(expanded)).catch(() => null)
    if (!resolved) throw new Error('工作空间不存在。')
    const info = await stat(resolved)
    if (!info.isDirectory()) throw new Error('工作空间路径不是目录。')
    return new DiagramStore(resolved)
  }

  async list(): Promise<DiagramSummary[]> {
    const results: DiagramSummary[] = []
    await this.scan(this.workspacePath, 0, results)
    return results.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  }

  async get(relativePath: string): Promise<DiagramDocument> {
    const target = await this.resolveExistingDiagram(relativePath)
    const [source, info] = await Promise.all([readFile(target, 'utf8'), stat(target)])
    return this.document(relativePathFromRoot(this.workspacePath, target), source, info.mtime)
  }

  async create(type: DiagramType, title: string): Promise<DiagramDocument> {
    const directory = path.join(this.workspacePath, 'docs', 'diagrams')
    await mkdir(directory, { recursive: true })
    const base = slugify(title) || type
    const target = await nextAvailablePath(directory, base)
    const source = createTemplate(type, title)
    await writeFile(target, source, { encoding: 'utf8', flag: 'wx' })
    const info = await stat(target)
    return this.document(relativePathFromRoot(this.workspacePath, target), source, info.mtime)
  }

  async update(relativePath: string, source: string): Promise<DiagramDocument> {
    const target = await this.resolveExistingDiagram(relativePath)
    await writeFile(target, normalizeSource(source), 'utf8')
    const info = await stat(target)
    return this.document(relativePathFromRoot(this.workspacePath, target), normalizeSource(source), info.mtime)
  }

  private async scan(directory: string, depth: number, results: DiagramSummary[]): Promise<void> {
    if (depth > maxDepth || results.length >= maxDiagrams) return
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (results.length >= maxDiagrams) return
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await this.scan(target, depth + 1, results)
        continue
      }
      if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue
      const info = await lstat(target)
      if (info.isSymbolicLink()) continue
      const source = await readFile(target, 'utf8')
      results.push(this.summary(relativePathFromRoot(this.workspacePath, target), source, info.mtime))
    }
  }

  private async resolveExistingDiagram(relativePath: string): Promise<string> {
    if (!relativePath.trim()) throw new Error('图表路径不能为空。')
    const lexical = path.resolve(this.workspacePath, relativePath)
    assertInside(this.workspacePath, lexical)
    if (!allowedExtensions.has(path.extname(lexical).toLowerCase())) throw new Error('只支持 .mmd 和 .mermaid 文件。')
    const target = await realpath(lexical).catch(() => null)
    if (!target) throw new Error(`图表不存在：${relativePath}`)
    assertInside(this.workspacePath, target)
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('图表路径必须指向普通文件。')
    return target
  }

  private summary(relativePath: string, source: string, modifiedAt: Date): DiagramSummary {
    return {
      path: relativePath,
      name: path.basename(relativePath, path.extname(relativePath)),
      type: detectDiagramType(source),
      modifiedAt: modifiedAt.toISOString(),
    }
  }

  private document(relativePath: string, source: string, modifiedAt: Date): DiagramDocument {
    return { ...this.summary(relativePath, source, modifiedAt), source }
  }
}

function assertInside(root: string, target: string): void {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('图表路径必须位于当前工作空间内。')
}

function relativePathFromRoot(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/')
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  return value
}

function normalizeSource(source: string): string {
  return source.endsWith('\n') ? source : `${source}\n`
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function nextAvailablePath(directory: string, base: string): Promise<string> {
  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = path.join(directory, `${base}${suffix}.mmd`)
    try {
      await lstat(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate
      throw error
    }
  }
  throw new Error('无法为新图表生成可用文件名。')
}
