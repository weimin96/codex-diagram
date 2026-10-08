import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { OpenAIUiToolMetadata } from '@openai/mcp-extensions/server'
import { z } from 'zod/v4'
import { beautifyArchitectureScene, routeArchitectureEdges } from './architectureDesign.js'
import { loadDiagramIcons, diagramGlobalEntrypoint } from './icons.js'
import { parseCanvasScene, serializeCanvasScene, type CanvasArrow, type CanvasC4Type, type CanvasElement, type CanvasIcon, type CanvasNode, type CanvasNote, type CanvasScene, type CanvasStencil } from './canvas.js'
import { nextCanvasElementId, traceCanvasGraph } from './canvasOperations.js'
import { DiagramStore } from './store.js'
import { readGitChanges } from './gitChanges.js'
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
      'diagram.thread is only the UI-open action. Call it when the user explicitly asks to open/show the right-side Diagram panel, or once before the first diagram operation in a conversation when no prior diagram.thread call exists.',
      'If diagram.thread has already been called in this conversation, NEVER call it again for later create/get/update/proposal/beautify requests. The existing panel follows thread state automatically; use data tools directly.',
      'A software/system/module/service architecture request is NOT a flowchart request. For architecture, system architecture, module architecture, service topology, dependency architecture, deployment-style views, or C4 views, create type=canvas by default and use C4 boundaries/roles where useful.',
      'Use type=flowchart only for an explicit process/workflow/control-flow/decision-flow request, or when the user explicitly asks for Mermaid/flowchart. Do not represent a software architecture as a Mermaid flowchart merely because it has arrows.',
      'For conversational edits to an existing diagram, prefer diagram.proposeUpdate so the user can review the candidate diff in the side panel before it is written. Use diagram.update directly only when the user explicitly asks to apply immediately.',
      'For edits constrained to the currently selected Canvas nodes, prefer diagram.proposeSubgraphUpdate and declare any new element ids so changes outside the subgraph are rejected server-side.',
      'Use diagram.trace for upstream/downstream graph exploration. When the user asks what current code changes affect, use diagram.impactFromGit so real staged/unstaged/untracked Git files are mapped through Canvas sourcePaths instead of guessed.',
      'Use diagram.upsertSourceNode after reading one real source file, or diagram.upsertSourceNodes after analyzing a set of files, when architecture nodes should be refreshed without rewriting the whole Canvas.',
      'When an architecture Canvas is visually flat, crowded, weakly grouped, or has crossing/overlapping relationships, use diagram.beautifyArchitecture. It deterministically adds architecture partitions, semantic tones, role/technology badges and orthogonal routing; do not try to solve those presentation problems only with prose prompting.',
      'If the node placement is already acceptable and only relationship lines need cleanup, use diagram.routeArchitectureEdges instead of beautifyArchitecture so node positions and partitions stay unchanged.',
      'When creating a diagram for the current conversation, omit workspacePath unless the user explicitly names another workspace. diagram.create will then use the current thread workspace and save under docs/diagrams/.',
      'Use type=canvas for freeform drawing boards and architecture diagrams. Read an existing diagram before updating it.',
    ].join(' '),
  },
)

const appOnly = { ui: { visibility: ['app'] as const } }
const readonly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
const sourceIndexCache = new Map<string, { expiresAt: number; files: string[] }>()
type ThreadTraceState = { seedElementIds: string[]; direction: 'upstream' | 'downstream' | 'both'; depth: number }
type ThreadDrawActivity = { kind: 'create' | 'update' | 'proposal' | 'source-sync'; path: string; key: string }
const threadSelection = new Map<string, { path?: string; focusElementIds?: string[]; trace?: ThreadTraceState; activity?: ThreadDrawActivity; updatedAt: string }>()
interface ThreadDiagramProposal {
  workspacePath: string
  path: string
  source: string
  baseSource: string
  reason?: string
  baseModifiedAt: string
  updatedAt: string
  scopeElementIds?: string[]
  newElementIds?: string[]
}
const threadProposals = new Map<string, ThreadDiagramProposal>()
interface ThreadGitImpact {
  workspacePath: string
  path: string
  updatedAt: string
  report: Record<string, unknown>
}
const threadGitImpacts = new Map<string, ThreadGitImpact>()
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
  title: 'Open Diagram',
  description: 'Open the Diagram companion panel beside the current Codex conversation. This is a UI-open action, not a prerequisite for every diagram tool call. If diagram.thread was already called earlier in this conversation, do not call it again; use diagram.get/create/update/proposal directly because the existing panel follows thread state automatically.',
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
    trace: state?.trace,
    activity: state?.activity,
    proposal: threadId ? proposalSummary(threadProposals.get(threadId)) : undefined,
    gitImpact: threadId && threadGitImpacts.get(threadId)?.path === state?.path ? gitImpactSummary(threadGitImpacts.get(threadId)) : undefined,
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

server.registerTool('diagram.trace', {
  title: 'Trace diagram relationships',
  description: 'Trace upstream, downstream or bidirectional Canvas relationships from one or more node ids. The matching nodes are focused in the current Diagram panel.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().optional(),
    elementIds: z.array(z.string().min(1)).min(1).max(40),
    direction: z.enum(['upstream', 'downstream', 'both']).default('both'),
    depth: z.number().int().min(1).max(8).default(2),
  }),
  annotations: readonly,
}, async ({ workspacePath, path: diagramPath, elementIds, direction, depth }, extra) => {
  const threadId = toolThreadId(extra._meta)
  const store = await resolveStore(workspacePath, threadId)
  const targetPath = diagramPath ?? (threadId ? threadSelection.get(threadId)?.path : undefined)
  if (!targetPath) throw new Error('当前聊天没有活动图表，请先指定 Canvas 图表路径。')
  const diagram = await store.get(targetPath)
  if (diagram.type !== 'canvas') throw new Error('关系追踪仅支持自由 Canvas 图。')
  const scene = parseCanvasScene(diagram.source)
  const trace = traceCanvasGraph(scene, elementIds, direction, depth)
  const nodeMap = new Map(scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow').map((item) => [item.id, item]))
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow' && trace.arrowIds.includes(item.id))
  markThreadDiagram(extra._meta, diagram.path, trace.nodeIds, { seedElementIds: elementIds, direction, depth })
  return {
    content: [{
      type: 'text',
      text: trace.nodeIds.length
        ? trace.nodeIds.map((id) => `${id}: ${nodeMap.get(id)?.text ?? id} (distance ${trace.distanceById[id] ?? 0})`).join('\n')
        : 'No related Canvas nodes found.',
    }],
    structuredContent: {
      kind: 'diagram-trace',
      workspacePath: store.workspacePath,
      path: diagram.path,
      direction,
      depth,
      nodes: trace.nodeIds.map((id) => ({ id, text: nodeMap.get(id)?.text ?? id, distance: trace.distanceById[id] ?? 0 })),
      arrows: arrows.map((arrow) => ({ id: arrow.id, from: arrow.from, to: arrow.to, label: arrow.label })),
    },
  }
})

server.registerTool('diagram.gitChanges', {
  title: 'Read workspace Git changes',
  description: 'Read the real staged, unstaged and untracked files in the current Git workspace. Optionally include committed branch changes since a base ref.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    baseRef: z.string().min(1).max(200).optional(),
    includeUntracked: z.boolean().default(true),
  }),
  annotations: readonly,
}, async ({ workspacePath, baseRef, includeUntracked }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const git = await readGitChanges(store.workspacePath, { baseRef, includeUntracked })
  return {
    content: [{
      type: 'text',
      text: git.files.length
        ? git.files.map((file) => `${file.path} [${file.kinds.join(', ')}]`).join('\n')
        : 'No Git changes found in the current workspace.',
    }],
    structuredContent: { kind: 'diagram-git-changes', workspacePath: store.workspacePath, ...git },
  }
})

server.registerTool('diagram.impactFromGit', {
  title: 'Map Git changes to diagram impact',
  description: 'Map real Git-changed files to Canvas nodes through sourcePaths, then trace direct and indirect graph impact. The right-side Diagram panel switches to the matching impact view.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().optional(),
    baseRef: z.string().min(1).max(200).optional(),
    includeUntracked: z.boolean().default(true),
    direction: z.enum(['upstream', 'downstream', 'both']).default('both'),
    depth: z.number().int().min(1).max(5).default(2),
  }),
  annotations: readonly,
}, async ({ workspacePath, path: diagramPath, baseRef, includeUntracked, direction, depth }, extra) => {
  const threadId = toolThreadId(extra._meta)
  const store = await resolveStore(workspacePath, threadId)
  const targetPath = diagramPath ?? (threadId ? threadSelection.get(threadId)?.path : undefined)
  if (!targetPath) throw new Error('当前聊天没有活动 Canvas，请先打开或指定目标画板。')
  const diagram = await store.get(targetPath)
  if (diagram.type !== 'canvas') throw new Error('Git 影响分析仅支持自由 Canvas 图。')
  const git = await readGitChanges(store.workspacePath, { baseRef, includeUntracked })
  const scene = parseCanvasScene(diagram.source)
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const matchedFiles: Array<{ path: string; kinds: string[]; elementIds: string[] }> = []
  const unmatchedFiles: Array<{ path: string; kinds: string[] }> = []
  const direct = new Set<string>()
  for (const file of git.files) {
    const normalized = normalizeSourcePath(file.path)
    const elementIds = boxes
      .filter((item) => item.sourcePaths?.some((sourcePath) => sourcePathMatches(normalizeSourcePath(sourcePath), normalized)))
      .map((item) => item.id)
    if (elementIds.length) {
      elementIds.forEach((id) => direct.add(id))
      matchedFiles.push({ path: file.path, kinds: file.kinds, elementIds })
    } else {
      unmatchedFiles.push({ path: file.path, kinds: file.kinds })
    }
  }
  const directElementIds = [...direct]
  const trace = directElementIds.length
    ? traceCanvasGraph(scene, directElementIds, direction, depth)
    : { nodeIds: [] as string[], arrowIds: [] as string[], distanceById: {} as Record<string, number> }
  const buckets = Array.from({ length: depth + 1 }, (_, distance) => ({
    distance,
    elementIds: trace.nodeIds.filter((id) => (trace.distanceById[id] ?? 0) === distance),
  })).filter((bucket) => bucket.elementIds.length)
  if (directElementIds.length) {
    markThreadDiagram(extra._meta, diagram.path, trace.nodeIds, { seedElementIds: directElementIds, direction, depth })
  } else {
    markThreadDiagram(extra._meta, diagram.path)
  }
  const nodeMap = new Map(boxes.map((item) => [item.id, item]))
  const impactUpdatedAt = new Date().toISOString()
  const report = {
    kind: 'diagram-git-impact',
    updatedAt: impactUpdatedAt,
    workspacePath: store.workspacePath,
    path: diagram.path,
    direction,
    depth,
    git,
    matchedFiles,
    unmatchedFiles,
    directElementIds,
    buckets,
    trace: {
      nodeIds: trace.nodeIds,
      arrowIds: trace.arrowIds,
      distanceById: trace.distanceById,
      nodes: trace.nodeIds.map((id) => ({ id, text: nodeMap.get(id)?.text ?? id, distance: trace.distanceById[id] ?? 0 })),
    },
  }
  if (threadId) {
    threadGitImpacts.set(threadId, {
      workspacePath: store.workspacePath,
      path: diagram.path,
      updatedAt: impactUpdatedAt,
      report,
    })
  }
  return {
    content: [{
      type: 'text',
      text: [
        `Git changed files: ${git.files.length}`,
        `Mapped files: ${matchedFiles.length}`,
        `Direct diagram nodes: ${directElementIds.length}`,
        `Impacted diagram nodes: ${trace.nodeIds.length}`,
        `Unmapped files: ${unmatchedFiles.length}`,
      ].join('\n'),
    }],
    structuredContent: report,
  }
})

server.registerTool('diagram.gitImpact', {
  title: 'Read Git impact report for this conversation',
  description: 'Internal app bridge for loading the latest Git-to-Canvas impact report produced in the current conversation.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: appOnly,
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  const current = threadId ? threadGitImpacts.get(threadId) : undefined
  if (!current) throw new Error('当前聊天没有 Git 影响报告。')
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(current.report) }],
    structuredContent: current.report,
  }
})

server.registerTool('diagram.dismissGitImpact', {
  title: 'Dismiss Git impact report for this conversation',
  description: 'Internal app bridge for clearing the current conversation Git impact report without changing any diagram file.',
  inputSchema: z.object({}),
  annotations: readonly,
  _meta: appOnly,
}, async (_args, extra) => {
  const threadId = toolThreadId(extra._meta)
  if (threadId) {
    threadGitImpacts.delete(threadId)
    const current = threadSelection.get(threadId)
    threadSelection.set(threadId, { ...current, updatedAt: new Date().toISOString() })
  }
  const payload = { kind: 'diagram-git-impact-dismissed' }
  return {
    content: [{ type: 'text', text: encodeToolResultFallback(payload) }],
    structuredContent: payload,
  }
})

server.registerTool('diagram.upsertSourceNode', {
  title: 'Sync source file to diagram node',
  description: 'Create or update one Canvas node linked to a real source file in the current workspace. Use after reading code when the user wants the architecture diagram to reflect that file without rewriting the whole Canvas.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().optional(),
    sourcePath: z.string().min(1).max(600),
    elementId: z.string().min(1).optional(),
    text: z.string().min(1).max(160).optional(),
    subtitle: z.string().max(160).optional(),
    description: z.string().max(2_000).optional(),
    tags: z.array(z.string().min(1).max(80)).max(12).optional(),
    icon: z.enum(['user', 'web', 'api', 'gateway', 'service', 'worker', 'database', 'cache', 'queue', 'search', 'vector', 'cloud', 'file', 'auth', 'ai', 'mcp', 'scheduler', 'external']).optional(),
    stencil: z.enum(['spring', 'react', 'vue', 'postgres', 'mysql', 'redis', 'kafka', 'rabbitmq', 'docker', 'kubernetes', 'qdrant', 'opensearch', 'elasticsearch', 'mongodb', 'minio', 'nginx', 'grpc', 'oidc', 'openai', 'mcp']).optional(),
    c4Type: z.enum(['person', 'software-system', 'container', 'component']).optional(),
    groupId: z.string().min(1).optional(),
    laneId: z.string().min(1).optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, sourcePath, elementId, text, subtitle, description, tags, icon, stencil, c4Type, groupId, laneId }, extra) => {
  const threadId = toolThreadId(extra._meta)
  const store = await resolveStore(workspacePath, threadId)
  const targetPath = diagramPath ?? (threadId ? threadSelection.get(threadId)?.path : undefined)
  if (!targetPath) throw new Error('当前聊天没有活动 Canvas，请先打开或指定目标画板。')
  const diagram = await store.get(targetPath)
  if (diagram.type !== 'canvas') throw new Error('源码节点同步仅支持自由 Canvas 图。')

  const now = Date.now()
  let cached = sourceIndexCache.get(store.workspacePath)
  if (!cached || cached.expiresAt <= now) {
    cached = { files: await store.listSourceFiles(), expiresAt: now + 15_000 }
    sourceIndexCache.set(store.workspacePath, cached)
  }
  const normalized = normalizeSourcePath(sourcePath)
  const realSourcePath = cached.files.find((file) => sourcePathMatches(normalizeSourcePath(file), normalized))
  if (!realSourcePath) throw new Error(`工作区中不存在源码文件：${sourcePath}`)

  const scene = parseCanvasScene(diagram.source)
  if (groupId && !scene.groups?.some((group) => group.id === groupId)) throw new Error(`Canvas 中不存在容器：${groupId}`)
  if (laneId && !scene.lanes?.some((lane) => lane.id === laneId)) throw new Error(`Canvas 中不存在泳道：${laneId}`)
  const boxes = scene.elements.filter((item): item is CanvasNode => item.type === 'node')
  const linked = boxes.filter((item) => item.sourcePaths?.some((candidate) => sourcePathMatches(normalizeSourcePath(candidate), normalizeSourcePath(realSourcePath))))
  let target = elementId ? boxes.find((item) => item.id === elementId) : undefined
  if (elementId && !target) throw new Error(`Canvas 中不存在节点：${elementId}`)
  if (!target && linked.length > 1) throw new Error(`该源码已关联多个 Canvas 节点，请传 elementId：${linked.map((item) => item.id).join(', ')}`)
  if (!target) target = linked[0]

  const cleanTags = tags?.map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
  let nodeId: string
  let created = false
  if (target) {
    nodeId = target.id
    scene.elements = scene.elements.map((item) => {
      if (item.id !== target!.id || item.type === 'arrow') return item
      return {
        ...item,
        ...(text ? { text } : {}),
        ...(subtitle !== undefined ? { subtitle: subtitle || undefined } : {}),
        ...(description !== undefined ? { description: description || undefined } : {}),
        ...(cleanTags ? { tags: cleanTags.length ? cleanTags : undefined } : {}),
        ...(icon ? { icon: icon as CanvasIcon } : {}),
        ...(stencil ? { stencil: stencil as CanvasStencil } : {}),
        ...(c4Type ? { c4Type: c4Type as CanvasC4Type } : {}),
        ...(groupId ? { groupId } : {}),
        ...(laneId ? { laneId } : {}),
        sourcePaths: [...new Set([...(item.sourcePaths ?? []), realSourcePath])],
      }
    })
  } else {
    created = true
    nodeId = nextCanvasElementId('node', scene.elements)
    const index = boxes.length
    const columns = 4
    const fileName = path.basename(realSourcePath).replace(/\.[^.]+$/, '')
    const x = 120 + (index % columns) * 280
    const y = 120 + Math.floor(index / columns) * 160
    scene.height = Math.max(scene.height, y + 180)
    scene.elements.push({
      id: nodeId,
      type: 'node',
      x,
      y,
      width: 220,
      height: 96,
      text: text ?? fileName,
      ...(subtitle ? { subtitle } : {}),
      ...(description ? { description } : {}),
      ...(cleanTags?.length ? { tags: cleanTags } : {}),
      ...(icon ? { icon: icon as CanvasIcon } : {}),
      ...(stencil ? { stencil: stencil as CanvasStencil } : {}),
      ...(c4Type ? { c4Type: c4Type as CanvasC4Type } : {}),
      ...(groupId ? { groupId } : {}),
      ...(laneId ? { laneId } : {}),
      sourcePaths: [realSourcePath],
    })
  }
  const updated = await store.update(diagram.path, serializeCanvasScene(scene), diagram.modifiedAt)
  markThreadDiagram(extra._meta, updated.path, [nodeId], undefined, 'source-sync')
  return {
    content: [{ type: 'text', text: `${created ? 'Created' : 'Updated'} Canvas node ${nodeId} for ${realSourcePath} in ${updated.path}` }],
    structuredContent: { kind: 'diagram-source-node', workspacePath: store.workspacePath, diagram: updated, nodeId, sourcePath: realSourcePath, created },
  }
})

server.registerTool('diagram.upsertSourceNodes', {
  title: 'Batch sync source files to diagram nodes',
  description: 'Create or refresh multiple Canvas nodes from real workspace source files in one revision. Use after analyzing a module or changed file set; ambiguous existing links fail instead of guessing.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().optional(),
    nodes: z.array(z.object({
      sourcePath: z.string().min(1).max(600),
      elementId: z.string().min(1).optional(),
      text: z.string().min(1).max(160).optional(),
      subtitle: z.string().max(160).optional(),
      description: z.string().max(2_000).optional(),
      tags: z.array(z.string().min(1).max(80)).max(12).optional(),
      icon: z.enum(['user', 'web', 'api', 'gateway', 'service', 'worker', 'database', 'cache', 'queue', 'search', 'vector', 'cloud', 'file', 'auth', 'ai', 'mcp', 'scheduler', 'external']).optional(),
      stencil: z.enum(['spring', 'react', 'vue', 'postgres', 'mysql', 'redis', 'kafka', 'rabbitmq', 'docker', 'kubernetes', 'qdrant', 'opensearch', 'elasticsearch', 'mongodb', 'minio', 'nginx', 'grpc', 'oidc', 'openai', 'mcp']).optional(),
      c4Type: z.enum(['person', 'software-system', 'container', 'component']).optional(),
      groupId: z.string().min(1).optional(),
      laneId: z.string().min(1).optional(),
    })).min(1).max(80),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, nodes }, extra) => {
  const threadId = toolThreadId(extra._meta)
  const store = await resolveStore(workspacePath, threadId)
  const targetPath = diagramPath ?? (threadId ? threadSelection.get(threadId)?.path : undefined)
  if (!targetPath) throw new Error('当前聊天没有活动 Canvas，请先打开或指定目标画板。')
  const diagram = await store.get(targetPath)
  if (diagram.type !== 'canvas') throw new Error('批量源码节点同步仅支持自由 Canvas 图。')

  const now = Date.now()
  let cached = sourceIndexCache.get(store.workspacePath)
  if (!cached || cached.expiresAt <= now) {
    cached = { files: await store.listSourceFiles(), expiresAt: now + 15_000 }
    sourceIndexCache.set(store.workspacePath, cached)
  }
  const scene = parseCanvasScene(diagram.source)
  const results: Array<{ sourcePath: string; nodeId: string; created: boolean }> = []
  for (const spec of nodes) {
    const normalized = normalizeSourcePath(spec.sourcePath)
    const realSourcePath = cached.files.find((file) => sourcePathMatches(normalizeSourcePath(file), normalized))
    if (!realSourcePath) throw new Error(`工作区中不存在源码文件：${spec.sourcePath}`)
    const result = upsertSourceNodeInScene(scene, realSourcePath, spec as SourceNodeSpec)
    results.push({ sourcePath: realSourcePath, ...result })
  }
  const updated = await store.update(diagram.path, serializeCanvasScene(scene), diagram.modifiedAt)
  const nodeIds = [...new Set(results.map((item) => item.nodeId))]
  markThreadDiagram(extra._meta, updated.path, nodeIds, undefined, 'source-sync')
  return {
    content: [{
      type: 'text',
      text: `Synced ${results.length} source file(s) to ${nodeIds.length} Canvas node(s) in one revision. Created ${results.filter((item) => item.created).length}, updated ${results.filter((item) => !item.created).length}.`,
    }],
    structuredContent: {
      kind: 'diagram-source-nodes',
      workspacePath: store.workspacePath,
      diagram: updated,
      nodes: results,
    },
  }
})

server.registerTool('diagram.create', {
  title: 'Create diagram',
  description: 'Create a Mermaid or Canvas diagram under docs/diagrams in the current conversation workspace. Omit workspacePath to use the directory bound to this chat. IMPORTANT: use type=canvas for software/system/module/service architecture, service topology, dependency architecture and C4 views. Use type=flowchart only for explicit process/workflow/control-flow/decision-flow or Mermaid flowchart requests.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    type: z.enum(diagramTypes.map((item) => item.type) as [DiagramType, ...DiagramType[]]).describe('Diagram kind. Choose canvas for architecture/system/module/service/C4/topology diagrams. Choose flowchart only for explicit workflow/process/control-flow/decision-flow diagrams.'),
    title: z.string().min(1).max(120),
    animate: z.boolean().optional(),
  }),
  annotations: write,
}, async ({ workspacePath, type, title, animate }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.create(type, title)
  markThreadDiagram(extra._meta, diagram.path, undefined, undefined, animate === false ? undefined : 'create')
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
    animate: z.boolean().optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, source, expectedModifiedAt, animate }, extra) => {
  const store = await resolveStore(workspacePath, toolThreadId(extra._meta))
  const diagram = await store.update(diagramPath, source, expectedModifiedAt)
  markThreadDiagram(extra._meta, diagram.path, undefined, undefined, animate === false ? undefined : 'update')
  return {
    content: [{ type: 'text', text: `Updated ${diagram.path}` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram },
  }
})

server.registerTool('diagram.beautifyArchitecture', {
  title: 'Beautify architecture diagram',
  description: 'Apply the built-in architecture design system to a Canvas diagram: infer roles/technology badges, create semantic architecture partitions, apply a theme, re-layout nodes and spread orthogonal relationship routes. Use this when the user asks to beautify, reorganize or make a system architecture diagram presentation-ready.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().optional(),
    theme: z.enum(['enterprise', 'technical', 'presentation']).default('enterprise'),
    repartition: z.boolean().default(true),
    relayout: z.boolean().default(true),
    reroute: z.boolean().default(true),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, theme, repartition, relayout, reroute }, extra) => {
  const threadId = toolThreadId(extra._meta)
  const store = await resolveStore(workspacePath, threadId)
  const targetPath = diagramPath ?? (threadId ? threadSelection.get(threadId)?.path : undefined)
  if (!targetPath) throw new Error('当前聊天没有活动架构图，请先指定 Canvas 图表路径。')
  const current = await store.get(targetPath)
  if (current.type !== 'canvas') throw new Error('架构美化仅支持 Canvas 图；Mermaid 图请先转换或新建架构 Canvas。')
  const result = beautifyArchitectureScene(parseCanvasScene(current.source), { theme, repartition, relayout, reroute })
  const diagram = await store.update(current.path, serializeCanvasScene(result.scene), current.modifiedAt)
  markThreadDiagram(extra._meta, diagram.path, undefined, undefined, 'update')
  return {
    content: [{
      type: 'text',
      text: `Beautified ${diagram.path}: ${result.summary.partitions} architecture partition(s), ${result.summary.enrichedNodes} enriched node(s), ${result.summary.routedEdges} routed relation(s), theme=${theme}.`,
    }],
    structuredContent: {
      kind: 'diagram',
      workspacePath: store.workspacePath,
      diagram,
      architectureDesign: result.summary,
    },
  }
})

server.registerTool('diagram.routeArchitectureEdges', {
  title: 'Route architecture relationships',
  description: 'Recompute only Canvas relationship routes using obstacle-aware orthogonal routing. Keeps every node, lane, group and node coordinate unchanged. Use when the user asks to reduce crossing/overlapping lines without changing the layout.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath }, extra) => {
  const threadId = toolThreadId(extra._meta)
  const store = await resolveStore(workspacePath, threadId)
  const targetPath = diagramPath ?? (threadId ? threadSelection.get(threadId)?.path : undefined)
  if (!targetPath) throw new Error('当前聊天没有活动架构图，请先指定 Canvas 图表路径。')
  const current = await store.get(targetPath)
  if (current.type !== 'canvas') throw new Error('架构连线整理仅支持 Canvas 图。')
  const scene = routeArchitectureEdges(parseCanvasScene(current.source))
  const diagram = await store.update(current.path, serializeCanvasScene(scene), current.modifiedAt)
  const routedEdges = scene.elements.filter((item) => item.type === 'arrow').length
  markThreadDiagram(extra._meta, diagram.path, undefined, undefined, 'update')
  return {
    content: [{ type: 'text', text: `Routed ${routedEdges} architecture relationship(s) in ${diagram.path} without moving nodes.` }],
    structuredContent: { kind: 'diagram', workspacePath: store.workspacePath, diagram, routedEdges },
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

server.registerTool('diagram.proposeSubgraphUpdate', {
  title: 'Propose Canvas subgraph update',
  description: 'Prepare a reviewable Canvas proposal constrained to specific existing element ids plus explicitly declared new element ids. Existing elements outside the subgraph must remain unchanged.',
  inputSchema: z.object({
    workspacePath: z.string().optional(),
    path: z.string().min(1),
    source: z.string().min(1),
    elementIds: z.array(z.string().min(1)).min(1).max(120),
    newElementIds: z.array(z.string().min(1)).max(120).optional(),
    reason: z.string().max(2_000).optional(),
  }),
  annotations: write,
}, async ({ workspacePath, path: diagramPath, source, elementIds, newElementIds = [], reason }, extra) => {
  const threadId = toolThreadId(extra._meta)
  if (!threadId) throw new Error('当前调用没有聊天上下文，无法创建 Subgraph Proposal。')
  const store = await resolveStore(workspacePath, threadId)
  const current = await store.get(diagramPath)
  if (current.type !== 'canvas') throw new Error('Subgraph Proposal 仅支持自由 Canvas 图。')
  validateCanvasSubgraphProposal(current.source, source, elementIds, newElementIds)
  const scopeElementIds = [...new Set(elementIds)]
  const declaredNewElementIds = [...new Set(newElementIds)]
  const proposal: ThreadDiagramProposal = {
    workspacePath: store.workspacePath,
    path: current.path,
    source,
    baseSource: current.source,
    reason,
    baseModifiedAt: current.modifiedAt,
    updatedAt: new Date().toISOString(),
    scopeElementIds,
    newElementIds: declaredNewElementIds,
  }
  threadProposals.set(threadId, proposal)
  markThreadDiagram(extra._meta, current.path, scopeElementIds)
  return {
    content: [{
      type: 'text',
      text: `Prepared a scoped Diagram proposal for ${current.path}. ${scopeElementIds.length} existing element(s) are in scope${declaredNewElementIds.length ? ` with ${declaredNewElementIds.length} declared new element(s)` : ''}; elements outside that subgraph were verified unchanged.`,
    }],
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
  description: 'Internal app bridge for accepting the pending Diagram proposal after user review. Canvas proposals may pass elementIds to apply only selected nodes/links while preserving the rest of the current document.',
  inputSchema: z.object({ elementIds: z.array(z.string().min(1)).max(200).optional() }),
  annotations: write,
  _meta: appOnly,
}, async ({ elementIds }, extra) => {
  const threadId = toolThreadId(extra._meta)
  if (!threadId) throw new Error('当前调用没有聊天上下文。')
  const proposal = threadProposals.get(threadId)
  if (!proposal) throw new Error('当前聊天没有待应用的 Diagram Proposal。')
  const store = await DiagramStore.open(proposal.workspacePath)
  const source = elementIds?.length
    ? mergeCanvasProposalElements(proposal.baseSource, proposal.source, elementIds)
    : proposal.source
  const diagram = await store.update(proposal.path, source, proposal.baseModifiedAt)
  threadProposals.delete(threadId)
  markThreadDiagram(extra._meta, diagram.path, undefined, undefined, 'proposal')
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

interface SourceNodeSpec {
  sourcePath: string
  elementId?: string
  text?: string
  subtitle?: string
  description?: string
  tags?: string[]
  icon?: CanvasIcon
  stencil?: CanvasStencil
  c4Type?: CanvasC4Type
  groupId?: string
  laneId?: string
}

function upsertSourceNodeInScene(scene: CanvasScene, realSourcePath: string, spec: SourceNodeSpec): { nodeId: string; created: boolean } {
  if (spec.groupId && !scene.groups?.some((group) => group.id === spec.groupId)) throw new Error(`Canvas 中不存在容器：${spec.groupId}`)
  if (spec.laneId && !scene.lanes?.some((lane) => lane.id === spec.laneId)) throw new Error(`Canvas 中不存在泳道：${spec.laneId}`)
  const boxes = scene.elements.filter((item): item is CanvasNode => item.type === 'node')
  const normalizedRealPath = normalizeSourcePath(realSourcePath)
  const linked = boxes.filter((item) => item.sourcePaths?.some((candidate) => sourcePathMatches(normalizeSourcePath(candidate), normalizedRealPath)))
  let target = spec.elementId ? boxes.find((item) => item.id === spec.elementId) : undefined
  if (spec.elementId && !target) throw new Error(`Canvas 中不存在节点：${spec.elementId}`)
  if (!target && linked.length > 1) throw new Error(`源码 ${realSourcePath} 已关联多个 Canvas 节点，请传 elementId：${linked.map((item) => item.id).join(', ')}`)
  if (!target) target = linked[0]
  const cleanTags = spec.tags?.map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
  if (target) {
    scene.elements = scene.elements.map((item) => {
      if (item.id !== target!.id || item.type === 'arrow') return item
      return {
        ...item,
        ...(spec.text ? { text: spec.text } : {}),
        ...(spec.subtitle !== undefined ? { subtitle: spec.subtitle || undefined } : {}),
        ...(spec.description !== undefined ? { description: spec.description || undefined } : {}),
        ...(cleanTags ? { tags: cleanTags.length ? cleanTags : undefined } : {}),
        ...(spec.icon ? { icon: spec.icon } : {}),
        ...(spec.stencil ? { stencil: spec.stencil } : {}),
        ...(spec.c4Type ? { c4Type: spec.c4Type } : {}),
        ...(spec.groupId ? { groupId: spec.groupId } : {}),
        ...(spec.laneId ? { laneId: spec.laneId } : {}),
        sourcePaths: [...new Set([...(item.sourcePaths ?? []), realSourcePath])],
      }
    })
    return { nodeId: target.id, created: false }
  }

  const nodeId = nextCanvasElementId('node', scene.elements)
  const index = boxes.length
  const columns = 4
  const fileName = path.basename(realSourcePath).replace(/\.[^.]+$/, '')
  const x = 120 + (index % columns) * 280
  const y = 120 + Math.floor(index / columns) * 160
  scene.height = Math.max(scene.height, y + 180)
  scene.elements.push({
    id: nodeId,
    type: 'node',
    x,
    y,
    width: 220,
    height: 96,
    text: spec.text ?? fileName,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    ...(spec.description ? { description: spec.description } : {}),
    ...(cleanTags?.length ? { tags: cleanTags } : {}),
    ...(spec.icon ? { icon: spec.icon } : {}),
    ...(spec.stencil ? { stencil: spec.stencil } : {}),
    ...(spec.c4Type ? { c4Type: spec.c4Type } : {}),
    ...(spec.groupId ? { groupId: spec.groupId } : {}),
    ...(spec.laneId ? { laneId: spec.laneId } : {}),
    sourcePaths: [realSourcePath],
  })
  return { nodeId, created: true }
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

function markThreadDiagram(meta: unknown, diagramPath: string, focusElementIds?: string[], trace?: ThreadTraceState, activityKind?: ThreadDrawActivity['kind']): void {
  const threadId = toolThreadId(meta)
  if (!threadId) return
  const current = threadSelection.get(threadId)
  const now = new Date().toISOString()
  threadSelection.set(threadId, {
    path: diagramPath,
    focusElementIds,
    trace,
    activity: activityKind ? { kind: activityKind, path: diagramPath, key: `${activityKind}:${diagramPath}:${now}` } : current?.activity,
    updatedAt: now,
  })
}

function clearThreadDiagram(meta: unknown, deletedPath: string): void {
  const threadId = toolThreadId(meta)
  if (!threadId) return
  const current = threadSelection.get(threadId)
  if (current?.path !== deletedPath) return
  threadSelection.set(threadId, { updatedAt: new Date().toISOString() })
  if (threadGitImpacts.get(threadId)?.path === deletedPath) threadGitImpacts.delete(threadId)
}

function gitImpactSummary(value: ThreadGitImpact | undefined) {
  if (!value) return undefined
  const report = value.report as {
    git?: { files?: unknown[] }
    directElementIds?: unknown[]
    trace?: { nodeIds?: unknown[] }
    unmatchedFiles?: unknown[]
  }
  return {
    path: value.path,
    updatedAt: value.updatedAt,
    fileCount: report.git?.files?.length ?? 0,
    directCount: report.directElementIds?.length ?? 0,
    affectedCount: report.trace?.nodeIds?.length ?? 0,
    unmatchedCount: report.unmatchedFiles?.length ?? 0,
  }
}

function proposalSummary(proposal: ThreadDiagramProposal | undefined) {
  if (!proposal) return undefined
  return {
    path: proposal.path,
    reason: proposal.reason,
    baseModifiedAt: proposal.baseModifiedAt,
    updatedAt: proposal.updatedAt,
    scopeElementIds: proposal.scopeElementIds,
    newElementIds: proposal.newElementIds,
  }
}

function validateCanvasSubgraphProposal(baseSource: string, candidateSource: string, elementIds: string[], newElementIds: string[]): void {
  let base: CanvasScene
  let candidate: CanvasScene
  try {
    base = parseCanvasScene(baseSource)
    candidate = parseCanvasScene(candidateSource)
  } catch {
    throw new Error('Subgraph Proposal 必须提供结构有效的 Canvas JSON。')
  }
  const scope = new Set(elementIds)
  const declaredNew = new Set(newElementIds)
  const baseById = new Map(base.elements.map((item) => [item.id, item]))
  const candidateById = new Map(candidate.elements.map((item) => [item.id, item]))
  const missingScope = [...scope].filter((id) => !baseById.has(id))
  if (missingScope.length) throw new Error(`Subgraph Proposal 包含不存在的基线元素：${missingScope.join(', ')}`)
  const invalidDeclaredNew = [...declaredNew].filter((id) => baseById.has(id))
  if (invalidDeclaredNew.length) throw new Error(`newElementIds 只能声明新增元素：${invalidDeclaredNew.join(', ')}`)
  if (base.title !== candidate.title || base.width !== candidate.width || base.height !== candidate.height) {
    throw new Error('Subgraph Proposal 当前不允许修改画布标题或尺寸；请改用整图 Proposal。')
  }

  const scopedNodes = new Set([...scope].filter((id) => baseById.get(id)?.type !== 'arrow'))
  const allowedExisting = new Set(scope)
  for (const item of base.elements) {
    if (item.type === 'arrow' && (scopedNodes.has(item.from) || scopedNodes.has(item.to))) allowedExisting.add(item.id)
  }
  const changedOutsideScope: string[] = []
  for (const item of base.elements) {
    if (allowedExisting.has(item.id)) continue
    const next = candidateById.get(item.id)
    if (!next || JSON.stringify(item) !== JSON.stringify(next)) changedOutsideScope.push(item.id)
  }
  if (changedOutsideScope.length) {
    throw new Error(`Subgraph Proposal 越界修改了范围外元素：${changedOutsideScope.slice(0, 12).join(', ')}${changedOutsideScope.length > 12 ? '…' : ''}`)
  }

  const additions = candidate.elements.filter((item) => !baseById.has(item.id)).map((item) => item.id)
  const undeclared = additions.filter((id) => !declaredNew.has(id))
  if (undeclared.length) throw new Error(`Subgraph Proposal 含未声明的新元素：${undeclared.join(', ')}`)
  const absentDeclared = [...declaredNew].filter((id) => !candidateById.has(id))
  if (absentDeclared.length) throw new Error(`newElementIds 中的元素没有出现在候选图：${absentDeclared.join(', ')}`)
  const newArrowsOutsideScope = candidate.elements.flatMap((item) => {
    if (item.type !== 'arrow' || !declaredNew.has(item.id)) return []
    const touchesScope = scopedNodes.has(item.from) || scopedNodes.has(item.to) || declaredNew.has(item.from) || declaredNew.has(item.to)
    return touchesScope ? [] : [item.id]
  })
  if (newArrowsOutsideScope.length) {
    throw new Error(`Subgraph Proposal 的新增连线没有连接到当前子图：${newArrowsOutsideScope.join(', ')}`)
  }

  if (JSON.stringify(base.groups ?? []) !== JSON.stringify(candidate.groups ?? [])) {
    throw new Error('Subgraph Proposal 当前不允许修改容器元数据；请改用整图 Proposal。')
  }
  if (JSON.stringify(base.lanes ?? []) !== JSON.stringify(candidate.lanes ?? [])) {
    throw new Error('Subgraph Proposal 当前不允许修改泳道元数据；请改用整图 Proposal。')
  }
}

function mergeCanvasProposalElements(baseSource: string, candidateSource: string, elementIds: string[]): string {
  let base: CanvasScene
  let candidate: CanvasScene
  try {
    base = parseCanvasScene(baseSource)
    candidate = parseCanvasScene(candidateSource)
  } catch {
    throw new Error('部分接受仅支持结构有效的 Canvas Proposal。')
  }
  const selected = new Set(elementIds)
  const candidateById = new Map(candidate.elements.map((item) => [item.id, item]))
  const relatedArrowIds = new Set<string>()
  for (const item of candidate.elements) {
    if (item.type === 'arrow' && (selected.has(item.id) || selected.has(item.from) || selected.has(item.to))) relatedArrowIds.add(item.id)
  }
  for (const item of base.elements) {
    if (item.type === 'arrow' && (selected.has(item.id) || selected.has(item.from) || selected.has(item.to))) relatedArrowIds.add(item.id)
  }
  const affected = new Set([...selected, ...relatedArrowIds])
  const nextElements: CanvasElement[] = []
  const seen = new Set<string>()
  for (const item of base.elements) {
    if (!affected.has(item.id)) {
      nextElements.push(item)
      seen.add(item.id)
      continue
    }
    const replacement = candidateById.get(item.id)
    if (replacement) {
      nextElements.push(replacement)
      seen.add(item.id)
    }
  }
  for (const item of candidate.elements) {
    if (!affected.has(item.id) || seen.has(item.id)) continue
    nextElements.push(item)
    seen.add(item.id)
  }
  const liveNodeIds = new Set(nextElements.filter((item) => item.type !== 'arrow').map((item) => item.id))
  const sanitized = nextElements.filter((item) => item.type !== 'arrow' || (liveNodeIds.has(item.from) && liveNodeIds.has(item.to)))
  const groupIds = new Set(sanitized.flatMap((item) => item.type === 'arrow' || !item.groupId ? [] : [item.groupId]))
  const laneIds = new Set(sanitized.flatMap((item) => item.type === 'arrow' || !item.laneId ? [] : [item.laneId]))
  const groups = mergeCanvasMetadataById(base.groups, candidate.groups, groupIds)
  const lanes = mergeCanvasMetadataById(base.lanes, candidate.lanes, laneIds)
  return serializeCanvasScene({
    ...base,
    elements: sanitized,
    groups: groups.length ? groups : undefined,
    lanes: lanes.length ? lanes : undefined,
  })
}

function mergeCanvasMetadataById<T extends { id: string }>(base: T[] | undefined, candidate: T[] | undefined, usedIds: Set<string>): T[] {
  const candidateById = new Map((candidate ?? []).map((item) => [item.id, item]))
  const baseById = new Map((base ?? []).map((item) => [item.id, item]))
  return [...usedIds].flatMap((id) => {
    const item = candidateById.get(id) ?? baseById.get(id)
    return item ? [item] : []
  })
}

interface CodexDesktopState {
  'thread-writable-roots'?: Record<string, unknown>
  'thread-workspace-root-hints'?: Record<string, unknown>
  'thread-project-assignments'?: Record<string, { projectKind?: unknown; projectId?: unknown } | undefined>
  'local-projects'?: Record<string, { rootPaths?: unknown } | undefined>
  'selected-project'?: { type?: unknown; projectId?: unknown }
}
