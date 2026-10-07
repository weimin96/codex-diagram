import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { OpenAIUiToolMetadata } from '@openai/mcp-extensions/server'
import { z } from 'zod/v4'
import { loadDiagramIcons, diagramGlobalEntrypoint } from './icons.js'
import { DiagramStore } from './store.js'
import { diagramTypes, type DiagramType, type WorkspaceSnapshot } from './types.js'

declare const __CODEX_DIAGRAM_VERSION__: string

const version = __CODEX_DIAGRAM_VERSION__
const legacyUiUri = 'ui://codex-diagram/workspace-v1'
const uiUri = `ui://codex-diagram/workspace-v${version}`
const uiTemplate = 'ui://codex-diagram/workspace-v{version}'
const here = path.dirname(fileURLToPath(import.meta.url))
const [appJs, appCss] = await Promise.all([
  readFile(path.join(here, 'app.js'), 'utf8'),
  readFile(path.join(here, 'app.css'), 'utf8'),
])
const icons = await loadDiagramIcons()

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${appCss}</style>
</head>
<body>
  <div id="root"></div>
  <script>${appJs}</script>
</body>
</html>`

const server = new McpServer(
  { name: 'codex-diagram', title: 'Codex Diagram', version, icons },
  { instructions: 'Codex Diagram reads and writes Mermaid diagrams in the current workspace. Read the existing diagram before updating it.' },
)

const appOnly = { ui: { visibility: ['app'] as const } }
const readonly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
const sourceIndexCache = new Map<string, { expiresAt: number; files: string[] }>()
const ui = (entrypoints: OpenAIUiToolMetadata['entrypoints'] = []) => ({
  ui: { resourceUri: uiUri, visibility: ['app'] as const },
  'openai/ui': { entrypoints } satisfies OpenAIUiToolMetadata,
  'openai/iconStyle': 'monochrome',
})

registerWorkspaceResource('codex-diagram-workspace-current', uiUri)
registerWorkspaceResource('codex-diagram-workspace-legacy', legacyUiUri)
server.registerResource(
  'codex-diagram-workspace-versioned-history',
  new ResourceTemplate(uiTemplate, { list: undefined }),
  { title: 'Diagram 工作台（历史版本兼容）', mimeType: 'text/html;profile=mcp-app' },
  async (uri) => workspaceResource(uri.toString()),
)

server.registerTool('diagram.workspace', {
  title: 'Diagram 工作台',
  description: 'Open the visual diagram workspace.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: ui([diagramGlobalEntrypoint(icons)]),
}, async (_args, extra) => ({
  content: [],
  structuredContent: workspaceContent(await bootstrapWorkspace(toolThreadId(extra._meta))),
}))

server.registerTool('diagram.thread', {
  title: 'Diagram 工作台',
  description: 'Open the diagram workspace beside the current Codex conversation.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: ui([{ type: 'thread' }]),
}, async (_args, extra) => ({
  content: [],
  structuredContent: workspaceContent(await bootstrapWorkspace(toolThreadId(extra._meta))),
}))

server.registerTool('diagram.openWorkspace', {
  title: 'Open diagram workspace',
  description: 'Open a local directory in the Diagram sidebar app.',
  inputSchema: z.object({ workspacePath: z.string().min(1) }),
  annotations: readonly,
  _meta: appOnly,
}, async ({ workspacePath }) => ({
  content: [],
  structuredContent: workspaceContent(await openWorkspace(workspacePath)),
}))

server.registerTool('diagram.list', {
  title: 'List diagrams',
  description: 'List Mermaid .mmd and .mermaid files in the current workspace.',
  inputSchema: z.object({ workspacePath: z.string().optional() }),
  annotations: readonly,
}, async ({ workspacePath }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagrams = await store.list()
  return {
    content: [{ type: 'text', text: diagrams.length ? diagrams.map((diagram) => `${diagram.path} (${diagram.type})`).join('\n') : 'No Mermaid diagrams found.' }],
    structuredContent: { kind: 'diagram-list', workspacePath: store.workspacePath, diagrams },
  }
})

server.registerTool('diagram.get', {
  title: 'Read diagram',
  description: 'Read one Mermaid diagram from the current workspace before explaining or modifying it.',
  inputSchema: z.object({ workspacePath: z.string().optional(), path: z.string().min(1) }),
  annotations: readonly,
}, async ({ workspacePath, path: diagramPath }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.get(diagramPath)
  return {
    content: [{ type: 'text', text: `Path: ${diagram.path}\nType: ${diagram.type}\n\n${diagram.source}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.revision', {
  title: 'Read diagram revision',
  description: 'Internal app bridge for checking whether an open diagram changed on disk.',
  inputSchema: z.object({ workspacePath: z.string().optional(), path: z.string().min(1) }),
  annotations: readonly,
  _meta: appOnly,
}, async ({ workspacePath, path: diagramPath }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const revision = await store.revision(diagramPath)
  return {
    content: [],
    structuredContent: { kind: 'diagram-revision', workspacePath: store.workspacePath, revision },
  }
})

server.registerTool('diagram.sources', {
  title: 'Search workspace source files',
  description: 'Internal app bridge for choosing real source files when generating a diagram.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    query: z.string().max(240).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  annotations: readonly,
  _meta: appOnly,
}, async ({ workspacePath, query = '', limit = 40 }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const now = Date.now()
  let cached = sourceIndexCache.get(store.workspacePath)
  if (!cached || cached.expiresAt <= now) {
    cached = { files: await store.listSourceFiles(), expiresAt: now + 15_000 }
    sourceIndexCache.set(store.workspacePath, cached)
  }
  const needle = query.trim().toLocaleLowerCase()
  const files = (needle
    ? cached.files.filter((file) => fuzzyPathMatch(file.toLocaleLowerCase(), needle))
    : cached.files
  ).slice(0, limit)
  return {
    content: [],
    structuredContent: { kind: 'source-files', workspacePath: store.workspacePath, files },
  }
})

server.registerTool('diagram.create', {
  title: 'Create diagram',
  description: 'Create a Mermaid diagram under docs/diagrams in the current workspace.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    type: z.enum(diagramTypes.map((item) => item.type) as [DiagramType, ...DiagramType[]]),
    title: z.string().min(1).max(120),
  }),
  annotations: write,
}, async ({ workspacePath, type, title }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.create(type, title)
  return {
    content: [{ type: 'text', text: `Created ${diagram.path}\n\n${diagram.source}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.update', {
  title: 'Update diagram',
  description: 'Replace the Mermaid source of an existing diagram. Pass expectedModifiedAt from diagram.get when available to avoid overwriting concurrent edits.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    source: z.string().min(1),
    expectedModifiedAt: z.string().optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, source, expectedModifiedAt }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.update(diagramPath, source, expectedModifiedAt)
  return {
    content: [{ type: 'text', text: `Updated ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.rename', {
  title: 'Rename diagram',
  description: 'Rename an existing Mermaid diagram in place. Pass expectedModifiedAt when available to avoid racing external edits.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    title: z.string().min(1).max(120),
    expectedModifiedAt: z.string().optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, title, expectedModifiedAt }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.rename(diagramPath, title, expectedModifiedAt)
  return {
    content: [{ type: 'text', text: `Renamed ${diagramPath} to ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.duplicate', {
  title: 'Duplicate diagram',
  description: 'Duplicate an existing Mermaid diagram beside the source file.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    title: z.string().min(1).max(120).optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, title }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.duplicate(diagramPath, title)
  return {
    content: [{ type: 'text', text: `Duplicated ${diagramPath} as ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.delete', {
  title: 'Delete diagram',
  description: 'Delete one Mermaid diagram from the current workspace. Pass expectedModifiedAt when available to avoid deleting a newly changed file.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    expectedModifiedAt: z.string().optional(),
  }),
  annotations: destructive,
}, async ({ workspacePath, path: diagramPath, expectedModifiedAt }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const deletedPath = await store.delete(diagramPath, expectedModifiedAt)
  return {
    content: [{ type: 'text', text: `Deleted ${deletedPath}` }],
    structuredContent: { kind: 'diagram-deleted', workspacePath: store.workspacePath, path: deletedPath },
  }
})

server.registerTool('diagram.exportAsset', {
  title: 'Export diagram asset',
  description: 'Internal app bridge for saving an exported SVG or PNG into docs/diagrams/exports when the host cannot download files directly.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    filename: z.string().min(1).max(180),
    format: z.enum(['svg', 'png']),
    content: z.string().min(1).max(32 * 1024 * 1024),
  }),
  annotations: write,
  _meta: appOnly,
}, async ({ workspacePath, filename, format, content }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const data = format === 'png' ? Buffer.from(content, 'base64') : content
  const assetPath = await store.exportAsset(filename, data)
  return {
    content: [],
    structuredContent: { kind: 'diagram-export', workspacePath: store.workspacePath, path: assetPath },
  }
})

await server.connect(new StdioServerTransport())

function registerWorkspaceResource(name: string, uri: string): void {
  server.registerResource(name, uri, { title: 'Diagram 工作台', mimeType: 'text/html;profile=mcp-app' }, async () => workspaceResource(uri))
}

function workspaceResource(uri: string) {
  return {
    contents: [{
      uri,
      mimeType: 'text/html;profile=mcp-app',
      text: html,
      _meta: {
        'openai/ui': { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['inline', 'fullscreen'] },
        ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
      },
    }],
  }
}

async function bootstrapWorkspace(threadId?: string): Promise<WorkspaceSnapshot> {
  const recentWorkspaces = await readRecentWorkspaces()
  const candidates = uniquePaths([
    ...(await clientWorkspaceRoots()),
    ...(await readCodexDesktopRoots(threadId)),
    ...recentWorkspaces,
  ])
  for (const candidate of candidates) {
    try {
      return await openWorkspace(candidate)
    } catch {
      // Try the next known workspace. Stale recent entries are expected.
    }
  }
  return { kind: 'workspace', recentWorkspaces, diagrams: [] }
}

async function openWorkspace(input: string): Promise<WorkspaceSnapshot> {
  const store = await DiagramStore.open(input)
  const recent = await readRecentWorkspaces()
  const recentWorkspaces = [store.workspacePath, ...recent.filter((item) => item !== store.workspacePath)].slice(0, 12)
  await writeRecentWorkspaces(recentWorkspaces)
  return { kind: 'workspace', workspacePath: store.workspacePath, recentWorkspaces, diagrams: await store.list() }
}

async function resolveStore(workspacePath: string | undefined, threadId?: string): Promise<DiagramStore> {
  if (workspacePath) return DiagramStore.open(workspacePath)
  const snapshot = await bootstrapWorkspace(threadId)
  if (!snapshot.workspacePath) throw new Error('没有可用的 Codex 工作空间，请先在 Diagram 工作台中打开目录。')
  return DiagramStore.open(snapshot.workspacePath)
}

async function clientWorkspaceRoots(): Promise<string[]> {
  try {
    const result = await server.server.listRoots()
    return result.roots.flatMap((root) => {
      try {
        return root.uri.startsWith('file:') ? [fileURLToPath(root.uri)] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

async function readCodexDesktopRoots(threadId?: string): Promise<string[]> {
  const stateFile = process.env.CODEX_DIAGRAM_CODEX_STATE
    || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), '.codex-global-state.json')
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8')) as CodexDesktopState
    const roots: string[] = []
    if (threadId) {
      roots.push(...stringArray(state['thread-writable-roots']?.[threadId]))
      const hinted = state['thread-workspace-root-hints']?.[threadId]
      if (typeof hinted === 'string') roots.push(hinted)
      const assignment = state['thread-project-assignments']?.[threadId]
      if (assignment?.projectKind === 'local' && typeof assignment.projectId === 'string') {
        roots.push(...stringArray(state['local-projects']?.[assignment.projectId]?.rootPaths))
      }
    }
    if (roots.length === 0) {
      const selected = state['selected-project']
      if (selected?.type === 'local' && typeof selected.projectId === 'string') {
        roots.push(...stringArray(state['local-projects']?.[selected.projectId]?.rootPaths))
      }
    }
    return uniquePaths(roots)
  } catch {
    return []
  }
}

const recentStateFile = path.join(process.env.CODEX_DIAGRAM_STATE_HOME || path.join(os.homedir(), '.codex-diagram'), 'sidebar-state.json')

async function readRecentWorkspaces(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(recentStateFile, 'utf8')) as { recentWorkspaces?: unknown }
    return stringArray(parsed.recentWorkspaces)
  } catch {
    return []
  }
}

async function writeRecentWorkspaces(recentWorkspaces: string[]): Promise<void> {
  await mkdir(path.dirname(recentStateFile), { recursive: true })
  await writeFile(recentStateFile, JSON.stringify({ recentWorkspaces }, null, 2), 'utf8')
}

function toolThreadId(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const threadId = (meta as Record<string, unknown>).threadId
  return typeof threadId === 'string' && threadId.length > 0 ? threadId : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function uniquePaths(values: string[]): string[] {
  return [...new Set(values)]
}

function fuzzyPathMatch(pathValue: string, query: string): boolean {
  if (pathValue.includes(query)) return true
  const terms = query.split(/[\\/\s]+/).filter(Boolean)
  return terms.every((term) => pathValue.includes(term))
}

function workspaceContent(snapshot: WorkspaceSnapshot): Record<string, unknown> {
  return {
    kind: snapshot.kind,
    workspacePath: snapshot.workspacePath,
    recentWorkspaces: snapshot.recentWorkspaces,
    diagrams: snapshot.diagrams,
  }
}

interface CodexDesktopState {
  'thread-writable-roots'?: Record<string, unknown>
  'thread-workspace-root-hints'?: Record<string, unknown>
  'thread-project-assignments'?: Record<string, { projectKind?: unknown; projectId?: unknown } | undefined>
  'local-projects'?: Record<string, { rootPaths?: unknown } | undefined>
  'selected-project'?: { type?: unknown; projectId?: unknown }
}
