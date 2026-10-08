import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { OpenAIUiToolMetadata } from '@openai/mcp-extensions/server'
import { z } from 'zod/v4'
import { loadDiagramIcons, diagramGlobalEntrypoint } from './icons.js'
import { parseCanvasScene, serializeCanvasScene, type CanvasC4Type, type CanvasElement, type CanvasIcon, type CanvasNode, type CanvasNote, type CanvasScene, type CanvasStencil } from './canvas.js'
import { nextCanvasElementId, traceCanvasGraph } from './canvasOperations.js'
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
      'For edits constrained to the currently selected Canvas nodes, prefer diagram.proposeSubgraphUpdate and declare any new element ids so changes outside the subgraph are rejected server-side.',
      'Use diagram.trace for upstream/downstream/impact exploration and diagram.upsertSourceNode after reading a real source file when only one architecture node needs to be created or refreshed.',
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
type ThreadTraceState = { seedElementIds: string[]; direction: 'upstream' | 'downstream' | 'both'; depth: number }
const threadSelection = new Map<string, { path?: string; focusElementIds?: string[]; trace?: ThreadTraceState; updatedAt: string }>()
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
    trace: state?.trace,
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
  const arrows = scene.elements.filter((item) => item.type === 'arrow' && trace.arrowIds.includes(item.id))
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
    icon: z.enum(['user', 'web', 'api', 'service', 'database', 'cache', 'queue', 'cloud', 'file', 'external']).optional(),
    stencil: z.enum(['spring', 'react', 'vue', 'postgres', 'mysql', 'redis', 'kafka', 'docker', 'kubernetes', 'qdrant', 'opensearch', 'minio']).optional(),
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
  markThreadDiagram(extra._meta, updated.path, [nodeId])
  return {
    content: [{ type: 'text', text: `${created ? 'Created' : 'Updated'} Canvas node ${nodeId} for ${realSourcePath} in ${updated.path}` }],
    structuredContent: { kind: 'diagram-source-node', workspacePath: store.workspacePath, diagram: updated, nodeId, sourcePath: realSourcePath, created },
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
  const proposal: ThreadDiagramProposal = {
    workspacePath: store.workspacePath,
    path: current.path,
    source,
    baseSource: current.source,
    reason,
    baseModifiedAt: current.modifiedAt,
    updatedAt: new Date().toISOString(),
    scopeElementIds: [...new Set(elementIds)],
    newElementIds: [...new Set(newElementIds)],
  }
  threadProposals.set(threadId, proposal)
  markThreadDiagram(extra._meta, current.path, proposal.scopeElementIds)
  return {
    content: [{
      type: 'text',
      text: `Prepared a scoped Diagram proposal for ${current.path}. ${proposal.scopeElementIds.length} existing element(s) are in scope${proposal.newElementIds.length ? ` with ${proposal.newElementIds.length} declared new element(s)` : ''}; elements outside that subgraph were verified unchanged.`,
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

function markThreadDiagram(meta: unknown, diagramPath: string, focusElementIds?: string[], trace?: ThreadTraceState): void {
  const threadId = toolThreadId(meta)
  if (!threadId) return
  threadSelection.set(threadId, { path: diagramPath, focusElementIds, trace, updatedAt: new Date().toISOString() })
}

function clearThreadDiagram(meta: unknown, deletedPath: string): void {
  const threadId = toolThreadId(meta)
  if (!threadId) return
  const current = threadSelection.get(threadId)
  if (current?.path !== deletedPath) return
  threadSelection.set(threadId, { updatedAt: new Date().toISOString() })
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
