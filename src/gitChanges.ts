import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type GitChangeKind = 'unstaged' | 'staged' | 'untracked' | 'base'

export interface GitChangedFile {
  path: string
  kinds: GitChangeKind[]
}

export interface GitChangesSnapshot {
  repoRoot: string
  workspacePrefix: string
  baseRef?: string
  files: GitChangedFile[]
}

export async function readGitChanges(workspacePath: string, options: { baseRef?: string; includeUntracked?: boolean } = {}): Promise<GitChangesSnapshot> {
  const repoRoot = (await git(workspacePath, ['rev-parse', '--show-toplevel'])).trim()
  if (!repoRoot) throw new Error('当前工作区不在 Git 仓库中。')
  const relativePrefix = normalize(path.relative(repoRoot, workspacePath))
  if (relativePrefix.startsWith('../')) throw new Error('当前工作区不在 Git 仓库根目录范围内。')
  const pathspec = relativePrefix || '.'
  const changes = new Map<string, Set<GitChangeKind>>()

  await collect(repoRoot, ['diff', '--name-only', '-z', '--', pathspec], 'unstaged', relativePrefix, changes)
  await collect(repoRoot, ['diff', '--cached', '--name-only', '-z', '--', pathspec], 'staged', relativePrefix, changes)
  if (options.includeUntracked !== false) {
    await collect(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', pathspec], 'untracked', relativePrefix, changes)
  }
  if (options.baseRef?.trim()) {
    const baseRef = options.baseRef.trim()
    await collect(repoRoot, ['diff', '--name-only', '-z', `${baseRef}...HEAD`, '--', pathspec], 'base', relativePrefix, changes)
  }

  return {
    repoRoot,
    workspacePrefix: relativePrefix,
    ...(options.baseRef?.trim() ? { baseRef: options.baseRef.trim() } : {}),
    files: [...changes.entries()]
      .map(([filePath, kinds]) => ({ path: filePath, kinds: [...kinds] }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}

async function collect(
  repoRoot: string,
  args: string[],
  kind: GitChangeKind,
  relativePrefix: string,
  changes: Map<string, Set<GitChangeKind>>,
): Promise<void> {
  const output = await git(repoRoot, args)
  for (const raw of output.split('\0')) {
    if (!raw) continue
    const filePath = toWorkspaceRelative(raw, relativePrefix)
    if (!filePath) continue
    const kinds = changes.get(filePath) ?? new Set<GitChangeKind>()
    kinds.add(kind)
    changes.set(filePath, kinds)
  }
}

function toWorkspaceRelative(repoRelativePath: string, relativePrefix: string): string | null {
  const normalized = normalize(repoRelativePath)
  if (!relativePrefix) return normalized
  if (normalized === relativePrefix) return path.posix.basename(normalized)
  const prefix = `${relativePrefix}/`
  if (!normalized.startsWith(prefix)) return null
  return normalized.slice(prefix.length)
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
    return String(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Git 命令执行失败：${message}`)
  }
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}
