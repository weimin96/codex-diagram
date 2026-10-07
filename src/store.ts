import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTemplate, detectDiagramType } from './templates.js'
import type { DiagramDocument, DiagramRevision, DiagramSummary, DiagramType } from './types.js'

const allowedExtensions = new Set(['.mmd', '.mermaid'])
const allowedExportExtensions = new Set(['.svg', '.png'])
const sourceExtensions = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.gradle', '.graphql', '.gql', '.h', '.hpp', '.html', '.java',
  '.js', '.jsx', '.json', '.kt', '.kts', '.less', '.mjs', '.cjs', '.php', '.properties', '.proto', '.py', '.rb',
  '.rs', '.scala', '.scss', '.sql', '.svelte', '.swift', '.toml', '.ts', '.tsx', '.vue', '.xml', '.yaml', '.yml',
])
const sourceNames = new Set(['Dockerfile', 'Makefile', 'CMakeLists.txt', 'pom.xml', 'build.gradle', 'settings.gradle'])
const ignoredDirectories = new Set([
  '.git', '.idea', '.gradle', '.mvn', '.venv', '.dart_tool', '__pycache__',
  'node_modules', 'vendor', 'venv', 'Pods', 'dist', 'build', 'out', 'coverage', '.next', '.turbo', '.cache', 'target',
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

  async revision(relativePath: string): Promise<DiagramRevision> {
    const target = await this.resolveExistingDiagram(relativePath)
    const info = await stat(target)
    return {
      path: relativePathFromRoot(this.workspacePath, target),
      modifiedAt: info.mtime.toISOString(),
    }
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

  async listSourceFiles(limit = 5_000): Promise<string[]> {
    const results: string[] = []
    await this.scanSources(this.workspacePath, 0, results, Math.max(1, Math.min(limit, 10_000)))
    return results.sort((left, right) => left.localeCompare(right))
  }

  async update(relativePath: string, source: string, expectedModifiedAt?: string): Promise<DiagramDocument> {
    const target = await this.resolveExistingDiagram(relativePath)
    await assertExpectedRevision(target, expectedModifiedAt)
    await writeFile(target, normalizeSource(source), 'utf8')
    const info = await stat(target)
    return this.document(relativePathFromRoot(this.workspacePath, target), normalizeSource(source), info.mtime)
  }

  async rename(relativePath: string, title: string, expectedModifiedAt?: string): Promise<DiagramDocument> {
    const target = await this.resolveExistingDiagram(relativePath)
    await assertExpectedRevision(target, expectedModifiedAt)
    const source = await readFile(target, 'utf8')
    const base = slugify(title)
    if (!base) throw new Error('请输入有效的图表名称。')
    const destination = path.join(path.dirname(target), `${base}${path.extname(target).toLowerCase()}`)
    assertInside(this.workspacePath, destination)
    if (destination !== target) {
      const existing = await lstat(destination).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      })
      if (existing) throw new Error(`同目录下已存在图表：${path.basename(destination)}`)
      await rename(target, destination)
    }
    const info = await stat(destination)
    return this.document(relativePathFromRoot(this.workspacePath, destination), source, info.mtime)
  }

  async duplicate(relativePath: string, title?: string): Promise<DiagramDocument> {
    const target = await this.resolveExistingDiagram(relativePath)
    const source = await readFile(target, 'utf8')
    const originalName = path.basename(target, path.extname(target))
    const base = slugify(title?.trim() || `${originalName}-copy`) || `${originalName}-copy`
    const destination = await nextAvailablePath(path.dirname(target), base, path.extname(target).toLowerCase())
    await writeFile(destination, normalizeSource(source), { encoding: 'utf8', flag: 'wx' })
    const info = await stat(destination)
    return this.document(relativePathFromRoot(this.workspacePath, destination), normalizeSource(source), info.mtime)
  }

  async delete(relativePath: string, expectedModifiedAt?: string): Promise<string> {
    const target = await this.resolveExistingDiagram(relativePath)
    await assertExpectedRevision(target, expectedModifiedAt)
    const deletedPath = relativePathFromRoot(this.workspacePath, target)
    await unlink(target)
    return deletedPath
  }

  async exportAsset(filename: string, content: string | Uint8Array): Promise<string> {
    const requested = filename.trim()
    if (!requested || path.basename(requested) !== requested) throw new Error('导出文件名无效。')
    const extension = path.extname(requested).toLowerCase()
    if (!allowedExportExtensions.has(extension)) throw new Error('只支持导出 SVG 和 PNG。')
    const base = slugify(path.basename(requested, extension)) || 'diagram'
    const directory = path.join(this.workspacePath, 'docs', 'diagrams', 'exports')
    await mkdir(directory, { recursive: true })
    const target = await nextAvailablePath(directory, base, extension)
    await writeFile(target, content, { flag: 'wx' })
    return relativePathFromRoot(this.workspacePath, target)
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

  private async scanSources(directory: string, depth: number, results: string[], limit: number): Promise<void> {
    if (depth > maxDepth || results.length >= limit) return
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (results.length >= limit) return
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await this.scanSources(target, depth + 1, results, limit)
        continue
      }
      if (!entry.isFile()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (!sourceExtensions.has(extension) && !sourceNames.has(entry.name)) continue
      const info = await lstat(target).catch(() => null)
      if (!info || info.isSymbolicLink()) continue
      results.push(relativePathFromRoot(this.workspacePath, target))
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

async function nextAvailablePath(directory: string, base: string, extension = '.mmd'): Promise<string> {
  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = path.join(directory, `${base}${suffix}${extension}`)
    try {
      await lstat(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate
      throw error
    }
  }
  throw new Error('无法为新图表生成可用文件名。')
}

async function assertExpectedRevision(target: string, expectedModifiedAt?: string): Promise<void> {
  if (!expectedModifiedAt) return
  const current = await stat(target)
  if (current.mtime.toISOString() !== expectedModifiedAt) {
    throw new Error('图表已被其他编辑器修改，请重新载入最新版本后再继续。')
  }
}
