import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { OpenAIUiToolMetadata } from '@openai/mcp-extensions/server'
import { z } from 'zod/v4'
import { loadDiagramIcons, diagramGlobalEntrypoint } from './icons.js'
import { parseCanvasScene } from './canvas.js'
import { DiagramStore } from './store.js'
import { encodeToolResultFallback } from './toolResult.js'
import { diagramTypes, type DiagramSurface, type DiagramType, type WorkspaceSnapshot } from './types.js'

declare const __CODEX_DIAGRAM_VERSION__: string

const version = __CODEX_DIAGRAM_VERSION__
const legacyUiUri = 'ui://codex-diagram/workspace-v1'
const workspaceUiUri = `ui://codex-diagram/workspace-v${version}`
const threadUiUri = `ui://codex-diagram/thread-v${version}`
const uiTemplate = 'ui://codex-diagram/workspace-v{version}'
const here = path.dirname(fileURLToPath(import.meta.url))
const [appJs, appCss] = await Promise.all([
  readFile(path.join(here, 'app.js'), 'utf8'),
  readFile(path.join(here, 'app.css'), 'utf8'),
])
const icons = await loadDiagramIcons()

const html = (surface: DiagramSurface) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${appCss}</style>
</head>
<body>
  <div id="root" data-diagram-surface="${surface}"></div>
  <script>${appJs}</script>
</body>
</html>`

const server = new McpServer(
  { name: 'codex-diagram', title: 'Codex Diagram', version, icons },
  {
    instructions: [
      'Codex Diagram reads and writes Mermaid diagrams and Codex Diagram Canvas documents in the workspace bound to the current conversation.',
      'When the user asks to draw, create, inspect or modify a diagram and wants to see it beside the conversation, call diagram.thread first. It is the single tool responsible for opening the persistent right-side Diagram panel.',
      'After diagram.thread is open, use diagram.get/create/update for data only; the existing panel follows the current thread state automatically.',
      'For conversational edits to an existing diagram, prefer diagram.proposeUpdate so the user can review the candidate diff in the side panel before it is written. Use diagram.update directly only when the user explicitly asks to apply immediately.',
      'When creating a diagram for the current conversation, omit workspacePath unless the user explicitly names another workspace. diagram.create will then use the current thread workspace and save under docs/diagrams/.',
      'Use type=canvas for a freeform drawing board. Read an existing diagram before updating it.',
    ].join(' '),
  },
)

const appOnly = { ui: { visibility: ['app'] as const } }
const readonly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
const sourceIndexCache = new Map<string, { expiresAt: number; files: string[] }>()
const threadSelection = new Map<string, { path?: string; focusElementIds?: string[]; updatedAt: string }>()
const threadProposals = new Map<string, { workspacePath: string; path: string; source: string; baseSource: string; reason?: string; baseModifiedAt: string; updatedAt: string }>()
const ui = (
  resourceUri: string,
  entrypoints: OpenAIUiToolMetadata['entrypoints'] = [],
  visibility: readonly ('model' | 'app')[] = ['app'],
) => ({
  ui: { resourceUri, visibility },
  'openai/ui': { entrypoints } satisfies OpenAIUiToolMetadata,
  'openai/iconStyle': 'monochrome',
})

registerWorkspaceResource('codex-diagram-workspace-current', workspaceUiUri, 'workspace')
registerWorkspaceResource('codex-diagram-thread-current', threadUiUri, 'thread')
registerWorkspaceResource('codex-diagram-workspace-legacy', legacyUiUri)
server.registerResource(
  'codex-diagram-workspace-versioned-history',
  new ResourceTemplate(uiTemplate, { list: undefined }),
  { title: 'Diagram 工作台（历史版本兼容）', mimeType: 'text/html;profile=mcp-app' },
  async (uri) => workspaceResource(uri.toString(), 'workspace'),
)

server.registerTool('diagram.workspace', {
  title: 'Diagram 图表库',
  description: 'Open the full-screen Diagram library for browsing, managing, exporting and editing workspace diagrams.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: ui(workspaceUiUri, [diagramGlobalEntrypoint(icons)]),
}, async (_args, extra) => ({
  content: [],
  structuredContent: workspaceContent(await bootstrapWorkspace(toolThreadId(extra._meta)), 'workspace'),
}))

server.registerTool('diagram.thread', {
  title: 'Diagram',
  description: 'Open the Diagram companion panel beside the current Codex conversation. Call this when the user asks to open/show a diagram, drawing board or visual canvas in the right-side conversation workspace.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: ui(threadUiUri, [{ type: 'thread' }], ['model', 'app']),
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  const payload = workspaceContent(await bootstrapWorkspace(threadId), 'thread', threadId)
  const workspacePath = typeof payload.workspacePath === 'string' ? payload.workspacePath : undefined
  return {
    content: [{
      type: 'text',
      text: workspacePath
        ? `Opened Diagram beside this conversation. Current conversation workspace: ${workspacePath}`
        : 'Opened Diagram beside this conversation. No writable workspace is currently bound to this thread.',
    }],
    structuredContent: payload,
  }
})

server.registerTool('diagram.openWorkspace', {
  title: 'Open diagram workspace',
  description: 'Open a local directory in the Diagram sidebar app.',
  inputSchema: z.object({ workspacePath: z.string().min(1) }),
  annotations: readonly,
  _meta: appOnly,
}, async ({ workspacePath }, extra) => {
  const payload = workspaceContent(await openWorkspace(workspacePath), undefined, toolThreadId(extra._meta))
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(payload) }],
    structuredContent: payload,
  }
})

server.registerTool('diagram.threadState', {
  title: 'Read active diagram for this conversation',
  description: 'Internal app bridge for keeping the thread sidebar synchronized with diagram tool usage in the same Codex conversation.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: appOnly,
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  const state = threadId ? threadSelection.get(threadId) : undefined
  const payload = {
    kind: 'diagram-thread-state',
    activeDiagramPath: state?.path,
    focusElementIds: state?.focusElementIds,
    proposal: threadId ? proposalSummary(threadProposals.get(threadId)) : undefined,
    updatedAt: state?.updatedAt,
  }
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(payload) }],
    structuredContent: payload,
  }
})

server.registerTool('diagram.list', {
  title: 'List diagrams',
  description: 'List Mermaid and Canvas diagram files in the current workspace.',
  inputSchema: z.object({ workspacePath: z.string().optional() }),
  annotations: readonly,
}, async ({ workspacePath }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagrams = await store.list()
  return {
    content: [{ type: 'text', text: diagrams.length ? diagrams.map((diagram) => `${diagram.path} (${diagram.type})`).join('\n') : 'No diagrams found.' }],
    structuredContent: { kind: 'diagram-list', workspacePath: store.workspacePath, diagrams },
  }
})

server.registerTool('diagram.get', {
  title: 'Read diagram',
  description: 'Read one Mermaid or Canvas diagram from the current workspace before explaining or modifying it.',
  inputSchema: z.object({ workspacePath: z.string().optional(), path: z.string().min(1) }),
  annotations: readonly,
}, async ({ workspacePath, path: diagramPath }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.get(diagramPath)
  markThreadDiagram(extra._meta, diagram.path)
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
  const payload = { kind: 'diagram-revision', workspacePath: store.workspacePath, revision }
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(payload) }],
    structuredContent: payload,
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
  const payload = { kind: 'source-files', workspacePath: store.workspacePath, files }
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(payload) }],
    structuredContent: payload,
  }
})

server.registerTool('diagram.findBySource', {
  title: 'Find diagram nodes by source file',
  description: 'Find Canvas nodes linked to a workspace source file. Use this to locate the visual node for code the user is discussing.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    sourcePath: z.string().min(1).max(600),
  }),
  annotations: readonly,
}, async ({ workspacePath, sourcePath }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const normalized = normalizeSourcePath(sourcePath)
  const summaries = await store.list()
  const matches: Array<{ diagramPath: string; diagramName: string; nodes: Array<{ id: string; text: string; sourcePaths: string[] }> }> = []
  for (const summary of summaries) {
    if (summary.type !== 'canvas') continue
    const diagram = await store.get(summary.path)
    try {
      const scene = parseCanvasScene(diagram.source)
      const nodes = scene.elements.flatMap((element) => {
        if (element.type === 'arrow' || !element.sourcePaths?.some((path) => sourcePathMatches(normalizeSourcePath(path), normalized))) return []
        return [{ id: element.id, text: element.text, sourcePaths: element.sourcePaths }]
      })
      if (nodes.length) matches.push({ diagramPath: summary.path, diagramName: summary.name, nodes })
    } catch {
      // Ignore malformed Canvas files here; diagram.get remains the source of truth for repair flows.
    }
  }
  if (matches.length === 1) markThreadDiagram(extra._meta, matches[0].diagramPath, matches[0].nodes.map((node) => node.id))
  return {
    content: [{
      type: 'text',
      text: matches.length
        ? matches.map((match) => `${match.diagramPath}: ${match.nodes.map((node) => `${node.id} (${node.text})`).join(', ')}`).join('\n')
        : `No Canvas nodes are linked to ${sourcePath}.`,
    }],
    structuredContent: { kind: 'diagram-source-matches', workspacePath: store.workspacePath, sourcePath, matches },
  }
})

server.registerTool('diagram.create', {
  title: 'Create diagram',
  description: 'Create a Mermaid or freeform Canvas diagram under docs/diagrams in the current conversation workspace. Omit workspacePath to use the directory bound to this chat; use type=canvas for a drawing board.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    type: z.enum(diagramTypes.map((item) => item.type) as [DiagramType, ...DiagramType[]]),
    title: z.string().min(1).max(120),
  }),
  annotations: write,
}, async ({ workspacePath, type, title }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.create(type, title)
  markThreadDiagram(extra._meta, diagram.path)
  return {
    content: [{ type: 'text', text: `Created ${diagram.path}\n\n${diagram.source}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.update', {
  title: 'Update diagram',
  description: 'Replace the source of an existing Mermaid or Canvas diagram. Pass expectedModifiedAt from diagram.get when available to avoid overwriting concurrent edits.',
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
  markThreadDiagram(extra._meta, diagram.path)
  return {
    content: [{ type: 'text', text: `Updated ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.proposeUpdate', {
  title: 'Propose diagram update',
  description: 'Prepare a candidate full-source update for an existing Mermaid or Canvas diagram without writing it to disk. Prefer this for conversational edits so the user can review the diff in Diagram first.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    source: z.string().min(1),
    reason: z.string().max(2_000).optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, source, reason }, extra) => {
  const threadId = toolThreadId(extra._meta)
  if (!threadId) throw new Error('当前调用没有聊天上下文，无法创建可审查的 Diagram Proposal。')
  const store = await resolveStore(workspacePath, threadId)
  const current = await store.get(diagramPath)
  const proposal = { workspacePath: store.workspacePath, path: current.path, source, baseSource: current.source, reason, baseModifiedAt: current.modifiedAt, updatedAt: new Date().toISOString() }
  threadProposals.set(threadId, proposal)
  markThreadDiagram(extra._meta, current.path)
  return {
    content: [{ type: 'text', text: `Prepared a Diagram proposal for ${current.path}. The file was not modified; wait for the user to accept or reject it in the Diagram panel.` }],
    structuredContent: { kind: 'diagram-proposal', workspacePath: store.workspacePath, proposal: proposalSummary(proposal) },
  }
})

server.registerTool('diagram.proposal', {
  title: 'Read diagram proposal',
  description: 'Internal app bridge for loading the pending candidate source for the current conversation.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: appOnly,
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  const proposal = threadId ? threadProposals.get(threadId) : undefined
  if (!proposal) throw new Error('当前聊天没有待审查的 Diagram Proposal。')
  const store = await DiagramStore.open(proposal.workspacePath)
  const current = await store.get(proposal.path)
  const before = { ...current, source: proposal.baseSource, modifiedAt: proposal.baseModifiedAt }
  return {
    content: [{ type: 'text', text: encodeToolResultFallback({ kind: 'diagram-proposal-source', path: proposal.path, source: proposal.source }) }],
    structuredContent: {
      kind: 'diagram-proposal-source',
      workspacePath: store.workspacePath,
      proposal: proposalSummary(proposal),
      before,
      candidateSource: proposal.source,
    },
  }
})

server.registerTool('diagram.applyProposal', {
  title: 'Apply diagram proposal',
  description: 'Internal app bridge for accepting the pending Diagram proposal after user review.',
  inputSchema: z.object({}),
  annotations: write,
  _meta: appOnly,
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  if (!threadId) throw new Error('当前调用没有聊天上下文。')
  const proposal = threadProposals.get(threadId)
  if (!proposal) throw new Error('当前聊天没有待应用的 Diagram Proposal。')
  const store = await DiagramStore.open(proposal.workspacePath)
  const diagram = await store.update(proposal.path, proposal.source, proposal.baseModifiedAt)
  threadProposals.delete(threadId)
  markThreadDiagram(extra._meta, diagram.path)
  return {
    content: [{ type: 'text', text: encodeToolResultFallback({ kind: 'diagram', workspacePath: store.workspacePath, diagram }) }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.dismissProposal', {
  title: 'Dismiss diagram proposal',
  description: 'Internal app bridge for rejecting the pending Diagram proposal without changing the file.',
  inputSchema: z.object({}),
  annotations: write,
  _meta: appOnly,
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  if (threadId) {
    threadProposals.delete(threadId)
    const current = threadSelection.get(threadId)
    threadSelection.set(threadId, { ...current, updatedAt: new Date().toISOString() })
  }
  return { content: [{ type: 'text', text: encodeToolResultFallback({ kind: 'diagram-proposal-dismissed' }) }], structuredContent: { kind: 'diagram-proposal-dismissed' } }
})

server.registerTool('diagram.rename', {
  title: 'Rename diagram',
  description: 'Rename an existing diagram in place. Pass expectedModifiedAt when available to avoid racing external edits.',
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
  markThreadDiagram(extra._meta, diagram.path)
  return {
    content: [{ type: 'text', text: `Renamed ${diagramPath} to ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.duplicate', {
  title: 'Duplicate diagram',
  description: 'Duplicate an existing diagram beside the source file.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    title: z.string().min(1).max(120).optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, title }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.duplicate(diagramPath, title)
  markThreadDiagram(extra._meta, diagram.path)
  return {
    content: [{ type: 'text', text: `Duplicated ${diagramPath} as ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.delete', {
  title: 'Delete diagram',
  description: 'Delete one diagram from the current workspace. Pass expectedModifiedAt when available to avoid deleting a newly changed file.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    expectedModifiedAt: z.string().optional(),
  }),
  annotations: destructive,
}, async ({ workspacePath, path: diagramPath, expectedModifiedAt }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const deletedPath = await store.delete(diagramPath, expectedModifiedAt)
  clearThreadDiagram(extra._meta, deletedPath)
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
  const payload = { kind: 'diagram-export', workspacePath: store.workspacePath, path: assetPath }
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(payload) }],
    structuredContent: payload,
  }
})

await server.connect(new StdioServerTransport())

function registerWorkspaceResource(name: string, uri: string, surface: DiagramSurface = 'workspace'): void {
  server.registerResource(
    name,
    uri,
    { title: surface === 'thread' ? 'Diagram' : 'Diagram 图表库', mimeType: 'text/html;profile=mcp-app' },
    async () => workspaceResource(uri, surface),
  )
}

function workspaceResource(uri: string, surface: DiagramSurface) {
  return {
    contents: [{
      uri,
      mimeType: 'text/html;profile=mcp-app',
      text: html(surface),
      _meta: {
        'openai/ui': {
          // Codex opens fullscreen MCP Apps as the tab/panel beside the thread.
          // This mirrors MCP for Blender's viewport resource. Inline mode leaves
          // only a tool card in the transcript and does not reliably expose the
          // persistent right-side working surface the Diagram workflow needs.
          preferredDisplayMode: 'fullscreen',
          availableDisplayModes: ['fullscreen'],
        },
        ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
      },
    }],
  }
}

async function bootstrapWorkspace(threadId?: string): Promise<WorkspaceSnapshot> {
  const recentWorkspaces = await readRecentWorkspaces()
  const threadWorkspaces = threadId ? await readCodexDesktopRoots(threadId) : []
  const candidates = uniquePaths([
    // A thread-specific writable root/project assignment is the strongest
    // signal for "the directory of this conversation". Keep it ahead of
    // generic MCP roots and recently opened Diagram workspaces so a model
    // initiated diagram.create cannot accidentally write into another project.
    ...threadWorkspaces,
    ...(await clientWorkspaceRoots()),
    ...(!threadId ? await readCodexDesktopRoots() : []),
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

function normalizeSourcePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLocaleLowerCase()
}

function sourcePathMatches(candidate: string, query: string): boolean {
  return candidate === query || candidate.endsWith(`/${query}`) || query.endsWith(`/${candidate}`)
}

function workspaceContent(snapshot: WorkspaceSnapshot, surface?: DiagramSurface, threadId?: string): Record<string, unknown> {
  const activeDiagramPath = threadId ? threadSelection.get(threadId)?.path : snapshot.activeDiagramPath
  return {
    kind: snapshot.kind,
    surface: surface ?? snapshot.surface,
    workspacePath: snapshot.workspacePath,
    recentWorkspaces: snapshot.recentWorkspaces,
    diagrams: snapshot.diagrams,
    activeDiagramPath,
  }
}

function markThreadDiagram(meta: unknown, diagramPath: string, focusElementIds?: string[]): void {
  const threadId = toolThreadId(meta)
  if (!threadId) return
  threadSelection.set(threadId, { path: diagramPath, focusElementIds, updatedAt: new Date().toISOString() })
}

function clearThreadDiagram(meta: unknown, deletedPath: string): void {
  const threadId = toolThreadId(meta)
  if (!threadId) return
  const current = threadSelection.get(threadId)
  if (current?.path !== deletedPath) return
  threadSelection.set(threadId, { updatedAt: new Date().toISOString() })
}

function proposalSummary(proposal: { path: string; reason?: string; baseModifiedAt: string; updatedAt: string } | undefined) {
  if (!proposal) return undefined
  return {
    path: proposal.path,
    reason: proposal.reason,
    baseModifiedAt: proposal.baseModifiedAt,
    updatedAt: proposal.updatedAt,
  }
}

interface CodexDesktopState {
  'thread-writable-roots'?: Record<string, unknown>
  'thread-workspace-root-hints'?: Record<string, unknown>
  'thread-project-assignments'?: Record<string, { projectKind?: unknown; projectId?: unknown } | undefined>
  'local-projects'?: Record<string, { rootPaths?: unknown } | undefined>
  'selected-project'?: { type?: unknown; projectId?: unknown }
}
