import React, { Component, type CSSProperties, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import mermaid from 'mermaid'
import {
  App as McpApp,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps'
import { OpenAIExtensions } from '@openai/mcp-extensions/app'
import { AiPanel } from './AiPanel.js'
import { buildGenerationPrompt, buildModificationPrompt, buildSubgraphModificationPrompt, type DiagramGenerationRequest } from './aiPrompts.js'
import { CanvasEditor, type CanvasPlaybackRequest, type CanvasSelection } from './CanvasEditor.js'
import { canvasSceneToSvg, parseCanvasScene } from './canvas.js'
import { normalizeMermaidColor } from './colors.js'
import { MermaidEditor } from './MermaidEditor.js'
import { mermaidVisualConfig } from './mermaidVisualGrammar.js'
import { detectDiagramType } from './templates.js'
import { extractToolResultError, extractToolResultPayload, type ToolResultLike } from './toolResult.js'
import { diagramTypeGroups, diagramTypes, type DiagramDocument, type DiagramRevision, type DiagramSummary, type DiagramSurface, type DiagramType, type WorkspaceSnapshot } from './types.js'

declare const __CODEX_DIAGRAM_VERSION__: string

interface ServerToolResult extends ToolResultLike {}

interface DiagramResult {
  kind: 'diagram'
  workspacePath: string
  diagram: DiagramDocument
  proposalApply?: { rebased: boolean; beforeSource?: string; historyEntryId?: string; historyRecorded?: boolean }
}

interface DiagramListResult {
  kind: 'diagram-list'
  workspacePath: string
  diagrams: DiagramSummary[]
}

interface DiagramRevisionResult {
  kind: 'diagram-revision'
  workspacePath: string
  revision: DiagramRevision
}

interface SourceFilesResult {
  kind: 'source-files'
  workspacePath: string
  files: string[]
}

interface DiagramDeletedResult {
  kind: 'diagram-deleted'
  workspacePath: string
  path: string
}

interface DiagramExportResult {
  kind: 'diagram-export'
  workspacePath: string
  path: string
}

interface DiagramThreadStateResult {
  kind: 'diagram-thread-state'
  activeDiagramPath?: string
  focusElementIds?: string[]
  trace?: { seedElementIds: string[]; direction: 'upstream' | 'downstream' | 'both'; depth: number }
  activity?: { kind: 'create' | 'update' | 'proposal' | 'source-sync' | 'history-undo' | 'history-redo'; path: string; key: string; modifiedAt?: string }
  proposal?: DiagramProposalSummary
  gitImpact?: { path: string; updatedAt: string; fileCount: number; directCount: number; affectedCount: number; unmatchedCount: number }
  updatedAt?: string
}

interface DiagramProposalSummary {
  path: string
  reason?: string
  baseModifiedAt: string
  updatedAt: string
  scopeElementIds?: string[]
  newElementIds?: string[]
  impactElementIds?: string[]
  automaticElementIds?: string[]
  branchId?: string
  branchLabel?: string
  branchGroupId?: string
  rebaseable?: boolean
  patchSummary?: {
    updated: number
    added: number
    removed: number
    layout: 'preserve' | 'local'
  }
}

interface DiagramProposalBranchSet {
  groupId: string
  activeBranchId: string
  branches: DiagramProposalSummary[]
}

interface DiagramProposalSourceResult {
  kind: 'diagram-proposal-source'
  workspacePath: string
  proposal: DiagramProposalSummary
  before: DiagramDocument
  candidateSource: string
  branchSet?: DiagramProposalBranchSet
}

interface DiagramProposalRefreshResult {
  kind: 'diagram-proposal-refresh'
  workspacePath: string
  proposal: DiagramProposalSummary
  before: DiagramDocument
  candidateSource: string
  reviewElementIds: string[]
}

interface DiagramPatchHistoryChange {
  id: string
  kind: 'add' | 'remove' | 'update'
  automatic: boolean
  declared: boolean
  label: string
  fields: string[]
}

interface DiagramPatchHistoryEntry {
  id: string
  path: string
  appliedAt: string
  reason?: string
  layout: 'preserve' | 'local'
  rebased: boolean
  partial: boolean
  acceptedElementIds?: string[]
  scopeElementIds: string[]
  automaticElementIds: string[]
  proposalBranchId?: string
  proposalBranchLabel?: string
  proposalBranchGroupId?: string
  dependsOnIds: string[]
  dependentIds: string[]
  dependencyDepth: number
  undoneAt?: string
  undoEventId?: string
  undoBatchId?: string
  redoneAt?: string
  redoEventId?: string
  redoBatchId?: string
  counts: { updated: number; added: number; removed: number; automatic: number }
  changes: DiagramPatchHistoryChange[]
}

interface DiagramPatchHistoryChainUndoResult {
  kind: 'diagram-patch-history-chain-undo'
  workspacePath: string
  diagram: DiagramDocument
  rootHistoryId: string
  historyIds: string[]
  revertedElementIds: string[]
}

interface DiagramPatchHistoryChainRedoResult {
  kind: 'diagram-patch-history-chain-redo'
  workspacePath: string
  diagram: DiagramDocument
  rootHistoryId: string
  historyIds: string[]
  reappliedElementIds: string[]
}

interface DiagramPatchHistoryResult {
  kind: 'diagram-patch-history'
  workspacePath: string
  path?: string
  entries: DiagramPatchHistoryEntry[]
}

interface DiagramPatchHistoryUndoResult {
  kind: 'diagram-patch-history-undo'
  workspacePath: string
  diagram: DiagramDocument
  historyId: string
  undoEventId: string
  revertedElementIds: string[]
}

interface DiagramPatchHistoryRedoResult {
  kind: 'diagram-patch-history-redo'
  workspacePath: string
  diagram: DiagramDocument
  historyId: string
  redoEventId: string
  reappliedElementIds: string[]
}

interface DiagramGitImpactResult {
  kind: 'diagram-git-impact'
  updatedAt: string
  workspacePath: string
  path: string
  direction: 'upstream' | 'downstream' | 'both'
  depth: number
  git: {
    repoRoot: string
    workspacePrefix: string
    baseRef?: string
    files: Array<{ path: string; kinds: string[] }>
  }
  matchedFiles: Array<{ path: string; kinds: string[]; elementIds: string[] }>
  unmatchedFiles: Array<{ path: string; kinds: string[] }>
  directElementIds: string[]
  buckets: Array<{ distance: number; elementIds: string[] }>
  trace: {
    nodeIds: string[]
    arrowIds: string[]
    distanceById: Record<string, number>
    nodes: Array<{ id: string; text: string; distance: number }>
  }
}

type ViewMode = 'preview' | 'source' | 'split'

const mcpApp = new McpApp({ name: 'codex-diagram-sidebar', version: __CODEX_DIAGRAM_VERSION__ })
const openai = new OpenAIExtensions(mcpApp)
const rootElement = document.getElementById('root')!
const hostSurface: DiagramSurface = rootElement.dataset.diagramSurface === 'thread' ? 'thread' : 'workspace'
let initialWorkspace: WorkspaceSnapshot | null = null

mcpApp.ontoolresult = (result) => {
  const content = result.structuredContent as Partial<WorkspaceSnapshot> | undefined
  if (content?.kind === 'workspace') initialWorkspace = content as WorkspaceSnapshot
}

function applyHostContext(context: ReturnType<McpApp['getHostContext']>) {
  if (context?.theme) applyDocumentTheme(context.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
  window.dispatchEvent(new Event('diagram-theme-change'))
}

mcpApp.addEventListener('hostcontextchanged', applyHostContext)

renderBootStatus('正在连接 Diagram…')
void main().catch(renderFatalError)

async function main() {
  await mcpApp.connect()
  applyHostContext(mcpApp.getHostContext())

  if (!initialWorkspace) {
    const result = await mcpApp.callServerTool({ name: hostSurface === 'thread' ? 'diagram.thread' : 'diagram.workspace', arguments: {} }) as ServerToolResult
    const content = result.structuredContent as WorkspaceSnapshot | undefined
    if (content?.kind === 'workspace') initialWorkspace = content
  }

  if (initialWorkspace && !initialWorkspace.surface) initialWorkspace = { ...initialWorkspace, surface: hostSurface }

  createRoot(rootElement).render(
    <RuntimeErrorBoundary>
      <Root initial={initialWorkspace ?? { kind: 'workspace', recentWorkspaces: [], diagrams: [] }} />
    </RuntimeErrorBoundary>,
  )
}

function Root({ initial }: { initial: WorkspaceSnapshot }) {
  const [workspace, setWorkspace] = useState(initial)
  const [switching, setSwitching] = useState(!initial.workspacePath)

  if (!workspace.workspacePath || switching) {
    return (
      <WorkspacePicker
        current={workspace}
        onOpen={(next) => {
          setWorkspace({ ...next, surface: workspace.surface ?? hostSurface })
          setSwitching(false)
        }}
      />
    )
  }

  return <DiagramWorkspace snapshot={workspace} onSnapshot={setWorkspace} onSwitch={() => setSwitching(true)} />
}

function WorkspacePicker({ current, onOpen }: { current: WorkspaceSnapshot; onOpen: (snapshot: WorkspaceSnapshot) => void }) {
  const [workspacePath, setWorkspacePath] = useState(current.workspacePath ?? '')
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open(candidate: string) {
    setOpening(true)
    setError(null)
    try {
      const result = await callTool<WorkspaceSnapshot>('diagram.openWorkspace', { workspacePath: candidate })
      if (!result.workspacePath) throw new Error('未能打开工作空间。')
      onOpen(result)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setOpening(false)
    }
  }

  return (
    <main className="workspace-picker-shell">
      <section className="workspace-picker">
        <div>
          <div className="eyebrow">DIAGRAM WORKSPACE</div>
          <h1>打开项目中的图表</h1>
          <p>识别工作空间里的 Mermaid 文件，并让 Codex 与可视化编辑器操作同一份源码。</p>
        </div>
        <form
          className="workspace-open-row"
          onSubmit={(event) => {
            event.preventDefault()
            void open(workspacePath)
          }}
        >
          <input autoFocus value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} placeholder="/Users/me/project 或 ~/project" />
          <button className="primary-button" disabled={opening || !workspacePath.trim()}>{opening ? '打开中…' : '打开'}</button>
        </form>
        {error ? <div className="inline-error">{error}</div> : null}
        {current.recentWorkspaces.length > 0 ? (
          <div className="recent-workspaces">
            <div className="section-label">最近工作空间</div>
            {current.recentWorkspaces.map((candidate) => (
              <button key={candidate} type="button" className="recent-workspace" onClick={() => void open(candidate)}>{candidate}</button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}

function DiagramWorkspace({ snapshot, onSnapshot, onSwitch }: {
  snapshot: WorkspaceSnapshot
  onSnapshot: (snapshot: WorkspaceSnapshot) => void
  onSwitch: () => void
}) {
  const workspacePath = snapshot.workspacePath!
  const isThread = (snapshot.surface ?? hostSurface) === 'thread'
  const [selected, setSelected] = useState<DiagramDocument | null>(null)
  const [source, setSource] = useState('')
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>(() => isThread ? 'preview' : 'split')
  const [creating, setCreating] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [diagramQuery, setDiagramQuery] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [generationPreset, setGenerationPreset] = useState<{ key: number; scope?: string; title?: string; instructions?: string } | undefined>()
  const [aiSending, setAiSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [externalChange, setExternalChange] = useState(false)
  const [splitPercent, setSplitPercent] = useState(44)
  const [sourceSearchRequest, setSourceSearchRequest] = useState(0)
  const [documentMenuOpen, setDocumentMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [followConversation, setFollowConversation] = useState(true)
  const [threadTabs, setThreadTabs] = useState<string[]>([])
  const [canvasSelection, setCanvasSelection] = useState<CanvasSelection | null>(null)
  const [canvasFocus, setCanvasFocus] = useState<{ ids: string[]; key: string; trace?: DiagramThreadStateResult['trace'] } | null>(null)
  const [canvasPlayback, setCanvasPlayback] = useState<CanvasPlaybackRequest | null>(null)
  const [gitImpactReport, setGitImpactReport] = useState<DiagramGitImpactResult | null>(null)
  const [gitImpactOpen, setGitImpactOpen] = useState(false)
  const [aiProposal, setAiProposal] = useState<{ summary: DiagramProposalSummary; before: DiagramDocument; after: DiagramDocument } | null>(null)
  const [proposalBranchSet, setProposalBranchSet] = useState<DiagramProposalBranchSet | null>(null)
  const [proposalReviewOpen, setProposalReviewOpen] = useState(false)
  const [patchHistoryOpen, setPatchHistoryOpen] = useState(false)
  const [patchHistoryEntries, setPatchHistoryEntries] = useState<DiagramPatchHistoryEntry[]>([])
  const [patchHistoryLoading, setPatchHistoryLoading] = useState(false)
  const [patchHistoryUndoingId, setPatchHistoryUndoingId] = useState<string | null>(null)
  const [patchHistoryRedoingId, setPatchHistoryRedoingId] = useState<string | null>(null)
  const [changeReview, setChangeReview] = useState<{ before: DiagramDocument; after: DiagramDocument } | null>(null)
  const [changeReviewOpen, setChangeReviewOpen] = useState(false)
  const [syncIssue, setSyncIssue] = useState<string | null>(null)
  const [discardTarget, setDiscardTarget] = useState<{ kind: 'diagram'; path: string } | { kind: 'workspace' } | null>(null)
  const aiWatch = useRef<{ until: number; existingPaths: Set<string> } | null>(null)
  const editorWorkspace = useRef<HTMLDivElement>(null)
  const splitDrag = useRef<{ pointerId: number; left: number; width: number } | null>(null)
  const lastThreadStateAt = useRef<string | undefined>(undefined)
  const lastPlaybackActivity = useRef<string | undefined>(undefined)
  const pendingPlaybackActivity = useRef<DiagramThreadStateResult['activity'] | undefined>(undefined)
  const selectRequestSeq = useRef(0)
  const patchHistoryRequestSeq = useRef(0)
  const threadStateInitialized = useRef(false)
  const backgroundFailures = useRef({ thread: 0, revision: 0 })
  const dirty = Boolean(selected && source !== selected.source)
  const visibleDiagrams = useMemo(() => {
    const query = diagramQuery.trim().toLocaleLowerCase()
    if (!query) return snapshot.diagrams
    return snapshot.diagrams.filter((diagram) => (
      diagram.name.toLocaleLowerCase().includes(query)
      || diagram.path.toLocaleLowerCase().includes(query)
      || diagramLabel(diagram.type).toLocaleLowerCase().includes(query)
    ))
  }, [diagramQuery, snapshot.diagrams])

  function backgroundSyncSucceeded(kind: 'thread' | 'revision') {
    backgroundFailures.current[kind] = 0
    if (backgroundFailures.current.thread < 3 && backgroundFailures.current.revision < 3) setSyncIssue(null)
  }

  function backgroundSyncFailed(kind: 'thread' | 'revision') {
    backgroundFailures.current[kind] += 1
    if (backgroundFailures.current[kind] < 3) return
    setSyncIssue(kind === 'thread' ? '对话联动正在重试' : '文件同步正在重试')
  }

  useEffect(() => {
    selectRequestSeq.current += 1
    patchHistoryRequestSeq.current += 1
    setSelected(null)
    setThreadTabs([])
    setCanvasSelection(null)
    setCanvasFocus(null)
    setCanvasPlayback(null)
    pendingPlaybackActivity.current = undefined
    lastPlaybackActivity.current = undefined
    lastThreadStateAt.current = undefined
    threadStateInitialized.current = false
    setGitImpactReport(null)
    setGitImpactOpen(false)
    setAiProposal(null)
    setProposalBranchSet(null)
    setProposalReviewOpen(false)
    setPatchHistoryOpen(false)
    setPatchHistoryEntries([])
    setPatchHistoryLoading(false)
    setPatchHistoryUndoingId(null)
    setChangeReview(null)
    setChangeReviewOpen(false)
    setSource('')
    setExternalChange(false)
    setDocumentMenuOpen(false)
    setRenaming(false)
    setDeleteConfirmOpen(false)
    setDiscardTarget(null)
    const initialDiagram = snapshot.activeDiagramPath
      ? snapshot.diagrams.find((diagram) => diagram.path === snapshot.activeDiagramPath)
      : undefined
    if (initialDiagram ?? snapshot.diagrams[0]) void selectDiagram((initialDiagram ?? snapshot.diagrams[0])!.path, true)
    // Workspace changes intentionally discard selection from the previous project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath])

  useEffect(() => {
    if (!isThread) return
    const available = new Set(snapshot.diagrams.map((diagram) => diagram.path))
    setThreadTabs((current) => current.filter((path) => available.has(path)))
  }, [isThread, snapshot.diagrams])

  useEffect(() => {
    if (!selected || selected.type !== 'canvas') {
      if (canvasSelection) setCanvasSelection(null)
    }
  }, [canvasSelection, selected])

  useEffect(() => {
    if (!isThread) return
    let disposed = false
    let inFlight = false
    const handle = window.setInterval(() => {
      if (disposed || inFlight || dirty) return
      inFlight = true
      void callTool<DiagramThreadStateResult>('diagram.threadState', {})
        .then(async (state) => {
          backgroundSyncSucceeded('thread')
          if (disposed) return
          if (!state.updatedAt || state.updatedAt === lastThreadStateAt.current) return
          if (!threadStateInitialized.current) {
            threadStateInitialized.current = true
            lastPlaybackActivity.current = state.activity?.key
          } else if (state.activity?.key && state.activity.key !== lastPlaybackActivity.current) {
            lastPlaybackActivity.current = state.activity.key
            const alreadyAppliedProposal = (state.activity.kind === 'proposal' || state.activity.kind === 'history-undo')
              && state.activity.path === selected?.path
              && Boolean(state.activity.modifiedAt)
              && state.activity.modifiedAt === selected?.modifiedAt
            pendingPlaybackActivity.current = alreadyAppliedProposal ? undefined : state.activity
          }
          if (state.proposal && state.proposal.updatedAt !== aiProposal?.summary.updatedAt) {
            try {
              const proposal = await callTool<DiagramProposalSourceResult>('diagram.proposal', {})
              if (!disposed) {
                const after: DiagramDocument = {
                  ...proposal.before,
                  source: proposal.candidateSource,
                }
                setAiProposal({ summary: proposal.proposal, before: proposal.before, after })
                setProposalBranchSet(proposal.branchSet ?? null)
                setProposalReviewOpen(true)
                setNotice(proposal.proposal.patchSummary
                  ? `Codex 提交增量候选：${proposal.proposal.patchSummary.updated} 修改 · ${proposal.proposal.patchSummary.added} 新增 · ${proposal.proposal.patchSummary.removed} 删除`
                  : 'Codex 提交了一版候选修改，文件尚未写入')
              }
            } catch {
              // Proposal sync is best-effort; normal thread following can continue.
            }
          } else if (!state.proposal && aiProposal) {
            setAiProposal(null)
            setProposalBranchSet(null)
            setProposalReviewOpen(false)
          }
          if (state.gitImpact && state.gitImpact.updatedAt !== gitImpactReport?.updatedAt) {
            try {
              const impact = await callTool<DiagramGitImpactResult>('diagram.gitImpact', {})
              if (!disposed) {
                setGitImpactReport(impact)
                setGitImpactOpen(false)
                setNotice(`Codex 已分析代码影响：${impact.git.files.length} 个改动文件 · ${impact.directElementIds.length} 个直接节点 · ${Math.max(0, impact.trace.nodeIds.length - impact.directElementIds.length)} 个间接节点`)
              }
            } catch {
              // Git impact sync is best-effort; graph following can continue.
            }
          }
          lastThreadStateAt.current = state.updatedAt
          if (!followConversation) return
          const nextPath = state.activeDiagramPath
          if (!nextPath) {
            const result = await callTool<DiagramListResult>('diagram.list', { workspacePath })
            if (disposed) return
            const remaining = result.diagrams
            onSnapshot({ ...snapshot, surface: 'thread', diagrams: remaining, activeDiagramPath: undefined })
            if (selected && !remaining.some((diagram) => diagram.path === selected.path)) {
              setSelected(null)
              setSource('')
              if (remaining[0]) await selectDiagram(remaining[0].path, true)
              if (!disposed) setNotice('当前图已从对话中删除，已切换到可用图表')
            }
            return
          }
          if (nextPath === selected?.path) {
            const pending = pendingPlaybackActivity.current
            if (pending?.path === selected.path && pending.modifiedAt && pending.modifiedAt === selected.modifiedAt) {
              pendingPlaybackActivity.current = undefined
            }
            setCanvasFocus(state.focusElementIds?.length ? { ids: state.focusElementIds, key: state.updatedAt, trace: state.trace } : null)
            if (state.focusElementIds?.length) {
              setNotice(state.proposal?.patchSummary
                ? `增量候选影响 ${state.focusElementIds.length} 个节点${state.proposal.automaticElementIds?.length ? ` · ${state.proposal.automaticElementIds.length} 个自动变化` : ''}`
                : state.trace
                  ? `已追踪${state.trace.direction === 'upstream' ? '上游' : state.trace.direction === 'downstream' ? '下游' : '双向邻域'} ${state.trace.depth} 跳 · ${state.focusElementIds.length} 个节点`
                  : `已定位 ${state.focusElementIds.length} 个源码关联节点`)
            }
            return
          }
          let diagrams = snapshot.diagrams
          if (!diagrams.some((diagram) => diagram.path === nextPath)) {
            const result = await callTool<DiagramListResult>('diagram.list', { workspacePath })
            if (disposed) return
            diagrams = result.diagrams
            onSnapshot({ ...snapshot, surface: 'thread', diagrams, activeDiagramPath: nextPath })
          }
          if (diagrams.some((diagram) => diagram.path === nextPath)) {
            await selectDiagram(nextPath, true)
            setCanvasFocus(state.focusElementIds?.length ? { ids: state.focusElementIds, key: state.updatedAt, trace: state.trace } : null)
            if (!disposed) setNotice(state.focusElementIds?.length
              ? state.proposal?.patchSummary
                ? `已切换到增量候选影响范围 · ${state.focusElementIds.length} 个节点`
                : state.trace
                  ? `已切换并追踪${state.trace.direction === 'upstream' ? '上游' : state.trace.direction === 'downstream' ? '下游' : '双向邻域'} ${state.trace.depth} 跳`
                  : `已切换并定位 ${state.focusElementIds.length} 个源码关联节点`
              : '已跟随当前对话中的图表')
          }
        })
        .catch(() => {
          if (!disposed) backgroundSyncFailed('thread')
        })
        .finally(() => { inFlight = false })
    }, 1_300)
    return () => {
      disposed = true
      window.clearInterval(handle)
    }
  }, [aiProposal, dirty, followConversation, gitImpactReport, isThread, onSnapshot, selected, snapshot, workspacePath])

  useEffect(() => {
    if (!isThread || selected || dirty) return
    let disposed = false
    let inFlight = false
    const discover = () => {
      if (disposed || inFlight) return
      inFlight = true
      void callTool<DiagramListResult>('diagram.list', { workspacePath })
        .then(async (result) => {
          if (disposed || result.diagrams.length === 0) return
          const activePath = snapshot.activeDiagramPath
          const next = (activePath && result.diagrams.find((diagram) => diagram.path === activePath)) || result.diagrams[0]
          onSnapshot({ ...snapshot, surface: 'thread', diagrams: result.diagrams, activeDiagramPath: next.path })
          await selectDiagram(next.path, true)
          if (!disposed) setNotice('已发现当前项目中的图表')
        })
        .catch(() => {
          // Discovery is opportunistic. Thread/revision sync surfaces persistent failures separately.
        })
        .finally(() => { inFlight = false })
    }
    discover()
    const handle = window.setInterval(discover, 2_500)
    return () => {
      disposed = true
      window.clearInterval(handle)
    }
  }, [dirty, isThread, onSnapshot, selected, snapshot, workspacePath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && selected) {
        event.preventDefault()
        void saveDiagram()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!notice) return
    const handle = window.setTimeout(() => setNotice(null), 4_500)
    return () => window.clearTimeout(handle)
  }, [notice])

  useEffect(() => {
    if (!selected) return
    let disposed = false
    let inFlight = false
    let reportedError = false
    const handle = window.setInterval(() => {
      if (disposed || inFlight || saving) return
      inFlight = true
      void callTool<DiagramRevisionResult>('diagram.revision', { workspacePath, path: selected.path })
        .then(async (result) => {
          backgroundSyncSucceeded('revision')
          reportedError = false
          if (disposed || result.revision.modifiedAt === selected.modifiedAt) return
          if (dirty) {
            setExternalChange(true)
            return
          }
          const latest = await callTool<DiagramResult>('diagram.get', { workspacePath, path: selected.path })
          if (disposed || dirty) return
          if (latest.diagram.source !== selected.source) {
            setChangeReview({ before: selected, after: latest.diagram })
            if (isThread && selected.type === 'canvas' && latest.diagram.type === 'canvas') {
              const activity = pendingPlaybackActivity.current
              const matchingActivity = activity?.path === selected.path
                && (!activity.modifiedAt || activity.modifiedAt === latest.diagram.modifiedAt)
                ? activity
                : undefined
              setCanvasPlayback({
                key: matchingActivity?.key ?? `sync:${selected.path}:${latest.diagram.modifiedAt}`,
                path: selected.path,
                mode: 'update',
                fromSource: selected.source,
                label: matchingActivity ? playbackActivityLabel(matchingActivity.kind) : '正在同步画板修改',
              })
              if (activity?.path === selected.path) pendingPlaybackActivity.current = undefined
            }
          }
          setSelected(latest.diagram)
          setSource(latest.diagram.source)
          setExternalChange(false)
          onSnapshot({
            ...snapshot,
            diagrams: snapshot.diagrams.map((item) => item.path === latest.diagram.path ? latest.diagram : item),
          })
          setNotice('已同步磁盘上的最新修改')
        })
        .catch(async () => {
          if (disposed || reportedError) return
          reportedError = true
          try {
            const listed = await callTool<DiagramListResult>('diagram.list', { workspacePath })
            if (disposed) return
            if (!listed.diagrams.some((diagram) => diagram.path === selected.path)) {
              const fallback = listed.diagrams[0]
              onSnapshot({ ...snapshot, diagrams: listed.diagrams, activeDiagramPath: fallback?.path })
              setSelected(null)
              setSource('')
              setExternalChange(false)
              backgroundSyncSucceeded('revision')
              if (fallback) {
                await selectDiagram(fallback.path, true)
                if (!disposed) setNotice('当前图已被外部删除，已切换到其他图表')
              } else {
                if (!disposed) setNotice('当前图已被外部删除')
              }
              return
            }
          } catch {
            // Keep the currently rendered diagram available and retry in the background.
          }
          backgroundSyncFailed('revision')
        })
        .finally(() => { inFlight = false })
    }, 1_800)
    return () => {
      disposed = true
      window.clearInterval(handle)
    }
  }, [dirty, onSnapshot, saving, selected, snapshot, workspacePath])

  useEffect(() => {
    let inFlight = false
    const handle = window.setInterval(() => {
      const watch = aiWatch.current
      if (!watch || inFlight) return
      if (Date.now() > watch.until) {
        aiWatch.current = null
        setError('未检测到 Codex 创建的新图表。可以刷新列表，或在当前对话中查看任务执行结果。')
        return
      }
      inFlight = true
      void callTool<DiagramListResult>('diagram.list', { workspacePath })
        .then(async (result) => {
          onSnapshot({ ...snapshot, diagrams: result.diagrams })
          const created = result.diagrams.find((item) => !watch.existingPaths.has(item.path))
          if (created && !dirty) {
            aiWatch.current = null
            await selectDiagram(created.path)
            setNotice(`Codex 已创建 ${created.name}`)
          }
        })
        .catch((cause) => {
          aiWatch.current = null
          setError(`自动刷新图表失败：${errorMessage(cause)}`)
        })
        .finally(() => { inFlight = false })
    }, 1_600)
    return () => window.clearInterval(handle)
  }, [dirty, onSnapshot, snapshot, workspacePath])

  function rememberThreadTab(diagramPath: string) {
    if (!isThread) return
    setThreadTabs((current) => {
      if (current.includes(diagramPath)) return current
      return [...current, diagramPath].slice(-6)
    })
  }

  function closeThreadTab(diagramPath: string) {
    if (!isThread) return
    const index = threadTabs.indexOf(diagramPath)
    const next = threadTabs.filter((path) => path !== diagramPath)
    setThreadTabs(next)
    if (selected?.path !== diagramPath || next.length === 0) return
    const fallback = next[Math.min(Math.max(0, index - 1), next.length - 1)]
    if (fallback) void selectDiagram(fallback, true, false)
  }

  async function selectDiagram(diagramPath: string, force = false, remember = true) {
    if (!force && dirty) {
      setDiscardTarget({ kind: 'diagram', path: diagramPath })
      return
    }
    const requestSeq = ++selectRequestSeq.current
    setDocumentMenuOpen(false)
    setRenaming(false)
    setDeleteConfirmOpen(false)
    if (changeReview?.after.path !== diagramPath) {
      setChangeReview(null)
      setChangeReviewOpen(false)
    }
    if (gitImpactReport?.path !== diagramPath) {
      setGitImpactReport(null)
      setGitImpactOpen(false)
    }
    setLoadingPath(diagramPath)
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.get', { workspacePath, path: diagramPath })
      if (requestSeq !== selectRequestSeq.current) return
      const activity = pendingPlaybackActivity.current
      const matchingActivity = activity?.path === result.diagram.path
        && (!activity.modifiedAt || activity.modifiedAt === result.diagram.modifiedAt)
        ? activity
        : undefined
      if (isThread && result.diagram.type === 'canvas' && matchingActivity) {
        const updatingCurrent = selected?.path === result.diagram.path && selected.type === 'canvas'
        setCanvasPlayback({
          key: matchingActivity.key,
          path: result.diagram.path,
          mode: updatingCurrent ? 'update' : 'create',
          ...(updatingCurrent ? { fromSource: selected.source } : {}),
          label: playbackActivityLabel(matchingActivity.kind),
        })
        pendingPlaybackActivity.current = undefined
      } else if (result.diagram.type !== 'canvas' || selected?.path !== result.diagram.path) {
        setCanvasPlayback(null)
        if (activity?.path === result.diagram.path) pendingPlaybackActivity.current = undefined
      }
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      if (result.diagram.type !== 'canvas' && patchHistoryOpen) {
        patchHistoryRequestSeq.current += 1
        setPatchHistoryOpen(false)
        setPatchHistoryEntries([])
      } else if (patchHistoryOpen) {
        void loadPatchHistory(result.diagram.path)
      }
      if (remember) rememberThreadTab(result.diagram.path)
    } catch (cause) {
      if (requestSeq !== selectRequestSeq.current) return
      setError(errorMessage(cause))
    } finally {
      if (requestSeq === selectRequestSeq.current) setLoadingPath(null)
    }
  }

  function requestWorkspaceSwitch() {
    if (dirty) {
      setDiscardTarget({ kind: 'workspace' })
      return
    }
    onSwitch()
  }

  function discardUnsavedChanges() {
    const target = discardTarget
    setDiscardTarget(null)
    if (!target) return
    if (target.kind === 'workspace') {
      onSwitch()
      return
    }
    void selectDiagram(target.path, true)
  }

  async function saveDiagram() {
    if (!selected || !dirty || saving) return
    if (externalChange) {
      setError('文件已在外部修改，请先重新载入最新版本。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.update', {
        workspacePath,
        path: selected.path,
        source,
        expectedModifiedAt: selected.modifiedAt,
        animate: false,
      })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      setChangeReview(null)
      setChangeReviewOpen(false)
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function reloadSelected() {
    if (!selected) return
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.get', { workspacePath, path: selected.path })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      setNotice('已重新载入磁盘版本')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function restorePreviousChange() {
    const review = changeReview
    if (!review || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.update', {
        workspacePath,
        path: review.after.path,
        source: review.before.source,
        expectedModifiedAt: review.after.modifiedAt,
        animate: false,
      })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      setChangeReview(null)
      setChangeReviewOpen(false)
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      setNotice('已恢复到本次外部修改前的版本')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function acceptAiProposal(elementIds?: string[]) {
    if (!aiProposal || saving) return
    if (dirty && !aiProposal.summary.rebaseable) {
      setError('当前还有未保存的手工修改。整图 Proposal 不能安全合并本地草稿，请先保存或放弃这些修改。')
      return
    }
    if (dirty && externalChange) {
      setError('当前画布同时存在未保存修改和外部更新，请先处理外部冲突。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (dirty) {
        if (!selected || selected.path !== aiProposal.before.path) throw new Error('当前本地草稿与待应用 Proposal 不属于同一张图。')
        const savedDraft = await callTool<DiagramResult>('diagram.update', {
          workspacePath,
          path: selected.path,
          source,
          expectedModifiedAt: selected.modifiedAt,
          animate: false,
        })
        setSelected(savedDraft.diagram)
        setSource(savedDraft.diagram.source)
        setExternalChange(false)
        onSnapshot({
          ...snapshot,
          diagrams: snapshot.diagrams.map((item) => item.path === savedDraft.diagram.path ? savedDraft.diagram : item),
        })
      }
      const result = await callTool<DiagramResult | DiagramProposalRefreshResult>('diagram.applyProposal', elementIds?.length ? { elementIds } : {})
      if (result.kind === 'diagram-proposal-refresh') {
        const after: DiagramDocument = { ...result.before, source: result.candidateSource }
        setAiProposal({ summary: result.proposal, before: result.before, after })
        setProposalBranchSet(null)
        setProposalReviewOpen(true)
        setSelected(result.before)
        setSource(result.before.source)
        setExternalChange(false)
        onSnapshot({
          ...snapshot,
          diagrams: snapshot.diagrams.map((item) => item.path === result.before.path ? result.before : item),
        })
        setNotice(`画布期间发生并发修改，候选已安全重算；${result.reviewElementIds.length} 个自动结果发生变化，请重新审查`)
        return
      }
      if (isThread && aiProposal.before.type === 'canvas' && result.diagram.type === 'canvas' && aiProposal.before.path === result.diagram.path) {
        setCanvasPlayback({
          key: `proposal:${result.diagram.path}:${result.diagram.modifiedAt}`,
          path: result.diagram.path,
          mode: 'update',
          fromSource: result.proposalApply?.beforeSource ?? aiProposal.before.source,
          label: 'Codex 正在应用候选修改',
        })
      }
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      setAiProposal(null)
      setProposalBranchSet(null)
      setProposalReviewOpen(false)
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      if (patchHistoryOpen && result.proposalApply?.historyRecorded) void loadPatchHistory(result.diagram.path)
      const historyWarning = result.proposalApply?.historyEntryId && result.proposalApply.historyRecorded === false ? '；但本地历史记录写入失败' : ''
      setNotice(`${result.proposalApply?.rebased ? '已接受 Codex 候选修改，并安全合并期间的其它画布改动' : '已接受 Codex 候选修改'}${historyWarning}`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function dismissAiProposal() {
    if (!aiProposal) return
    setError(null)
    try {
      await callTool<{ kind: 'diagram-proposal-dismissed' }>('diagram.dismissProposal', {})
      setAiProposal(null)
      setProposalBranchSet(null)
      setProposalReviewOpen(false)
      setNotice('已拒绝 Codex 候选修改，当前文件未改变')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function selectProposalBranch(branchId: string) {
    if (!aiProposal || saving || proposalBranchSet?.activeBranchId === branchId) return
    setSaving(true)
    setError(null)
    try {
      const result = await callTool<DiagramProposalSourceResult>('diagram.selectProposalBranch', { branchId })
      const after: DiagramDocument = { ...result.before, source: result.candidateSource }
      setAiProposal({ summary: result.proposal, before: result.before, after })
      setProposalBranchSet(result.branchSet ?? null)
      setProposalReviewOpen(true)
      if (result.proposal.impactElementIds?.length && result.before.type === 'canvas') {
        const candidate = parseCanvasScene(result.candidateSource)
        const nodeIds = new Set(candidate.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        const focusIds = result.proposal.impactElementIds.filter((id) => nodeIds.has(id))
        if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `proposal-branch:${branchId}:${Date.now()}` })
      }
      setNotice(`已切换到候选 ${result.proposal.branchLabel ?? '方案'}`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function composeProposalBranches(branchIds: string[]) {
    if (!aiProposal || saving || branchIds.length < 2) return
    setSaving(true)
    setError(null)
    try {
      const result = await callTool<DiagramProposalSourceResult>('diagram.composeProposalBranches', {
        branchIds,
        branchLabel: '组合方案',
      })
      const after: DiagramDocument = { ...result.before, source: result.candidateSource }
      setAiProposal({ summary: result.proposal, before: result.before, after })
      setProposalBranchSet(result.branchSet ?? null)
      setProposalReviewOpen(true)
      if (result.proposal.impactElementIds?.length && result.before.type === 'canvas') {
        const candidate = parseCanvasScene(result.candidateSource)
        const nodeIds = new Set(candidate.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        const focusIds = result.proposal.impactElementIds.filter((id) => nodeIds.has(id))
        if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `proposal-compose:${Date.now()}` })
      }
      setNotice(`已生成组合候选 · ${branchIds.length} 个 Patch 合并`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function loadPatchHistory(diagramPath = selected?.path) {
    if (!diagramPath) return
    const requestSeq = ++patchHistoryRequestSeq.current
    setPatchHistoryLoading(true)
    try {
      const result = await callTool<DiagramPatchHistoryResult>('diagram.patchHistory', { workspacePath, path: diagramPath, limit: 100 })
      if (requestSeq !== patchHistoryRequestSeq.current) return
      setPatchHistoryEntries(result.entries)
    } catch (cause) {
      if (requestSeq !== patchHistoryRequestSeq.current) return
      setError(errorMessage(cause))
    } finally {
      if (requestSeq === patchHistoryRequestSeq.current) setPatchHistoryLoading(false)
    }
  }

  function openPatchHistory() {
    if (!selected) return
    setProposalReviewOpen(false)
    setChangeReviewOpen(false)
    setGitImpactOpen(false)
    setPatchHistoryOpen(true)
    void loadPatchHistory(selected.path)
  }

  async function undoPatchHistory(entry: DiagramPatchHistoryEntry) {
    if (!selected || selected.path !== entry.path || saving || patchHistoryUndoingId || patchHistoryRedoingId) return
    if (dirty && externalChange) {
      setError('当前画布同时存在未保存修改和外部更新，请先处理外部冲突。')
      return
    }
    setSaving(true)
    setPatchHistoryUndoingId(entry.id)
    setError(null)
    try {
      let beforeSource = source
      if (dirty) {
        const savedDraft = await callTool<DiagramResult>('diagram.update', {
          workspacePath,
          path: selected.path,
          source,
          expectedModifiedAt: selected.modifiedAt,
          animate: false,
        })
        setSelected(savedDraft.diagram)
        setSource(savedDraft.diagram.source)
        beforeSource = savedDraft.diagram.source
        setExternalChange(false)
        onSnapshot({
          ...snapshot,
          diagrams: snapshot.diagrams.map((item) => item.path === savedDraft.diagram.path ? savedDraft.diagram : item),
        })
      }
      const result = await callTool<DiagramPatchHistoryUndoResult>('diagram.undoPatchHistory', {
        workspacePath,
        historyId: entry.id,
      })
      if (isThread && result.diagram.type === 'canvas') {
        setCanvasPlayback({
          key: `history-undo:${entry.id}:${result.diagram.modifiedAt}`,
          path: result.diagram.path,
          mode: 'update',
          fromSource: beforeSource,
          label: '正在撤销 AI 修改',
        })
      }
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      if (result.diagram.type === 'canvas' && result.revertedElementIds.length) {
        const restored = parseCanvasScene(result.diagram.source)
        const nodeIds = new Set(restored.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        const focusIds = result.revertedElementIds.filter((id) => nodeIds.has(id))
        if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `history-focus:${entry.id}:${result.diagram.modifiedAt}` })
      }
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      await loadPatchHistory(result.diagram.path)
      setNotice(`已撤销这次 AI 修改 · ${result.revertedElementIds.length} 个元素恢复`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
      setPatchHistoryUndoingId(null)
    }
  }

  async function undoPatchHistoryChain(entry: DiagramPatchHistoryEntry) {
    if (!selected || selected.path !== entry.path || saving || patchHistoryUndoingId || patchHistoryRedoingId) return
    if (dirty && externalChange) {
      setError('当前画布同时存在未保存修改和外部更新，请先处理外部冲突。')
      return
    }
    setSaving(true)
    setPatchHistoryUndoingId(entry.id)
    setError(null)
    try {
      let beforeSource = source
      if (dirty) {
        const savedDraft = await callTool<DiagramResult>('diagram.update', {
          workspacePath,
          path: selected.path,
          source,
          expectedModifiedAt: selected.modifiedAt,
          animate: false,
        })
        setSelected(savedDraft.diagram)
        setSource(savedDraft.diagram.source)
        beforeSource = savedDraft.diagram.source
        setExternalChange(false)
        onSnapshot({
          ...snapshot,
          diagrams: snapshot.diagrams.map((item) => item.path === savedDraft.diagram.path ? savedDraft.diagram : item),
        })
      }
      const result = await callTool<DiagramPatchHistoryChainUndoResult>('diagram.undoPatchHistoryChain', {
        workspacePath,
        historyId: entry.id,
      })
      if (isThread && result.diagram.type === 'canvas') {
        setCanvasPlayback({
          key: `history-chain-undo:${entry.id}:${result.diagram.modifiedAt}`,
          path: result.diagram.path,
          mode: 'update',
          fromSource: beforeSource,
          label: `正在撤销 ${result.historyIds.length} 个依赖 Patch`,
        })
      }
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      if (result.diagram.type === 'canvas' && result.revertedElementIds.length) {
        const restored = parseCanvasScene(result.diagram.source)
        const nodeIds = new Set(restored.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        const focusIds = result.revertedElementIds.filter((id) => nodeIds.has(id))
        if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `history-chain-focus:${entry.id}:${result.diagram.modifiedAt}` })
      }
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      await loadPatchHistory(result.diagram.path)
      setNotice(`已撤销依赖链 · ${result.historyIds.length} 个 Patch · ${result.revertedElementIds.length} 个元素恢复`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
      setPatchHistoryUndoingId(null)
    }
  }

  async function redoPatchHistory(entry: DiagramPatchHistoryEntry) {
    if (!selected || selected.path !== entry.path || saving || patchHistoryUndoingId || patchHistoryRedoingId) return
    if (dirty && externalChange) {
      setError('当前画布同时存在未保存修改和外部更新，请先处理外部冲突。')
      return
    }
    setSaving(true)
    setPatchHistoryRedoingId(entry.id)
    setError(null)
    try {
      let beforeSource = source
      if (dirty) {
        const savedDraft = await callTool<DiagramResult>('diagram.update', {
          workspacePath,
          path: selected.path,
          source,
          expectedModifiedAt: selected.modifiedAt,
          animate: false,
        })
        setSelected(savedDraft.diagram)
        setSource(savedDraft.diagram.source)
        beforeSource = savedDraft.diagram.source
        setExternalChange(false)
        onSnapshot({
          ...snapshot,
          diagrams: snapshot.diagrams.map((item) => item.path === savedDraft.diagram.path ? savedDraft.diagram : item),
        })
      }
      const result = await callTool<DiagramPatchHistoryRedoResult>('diagram.redoPatchHistory', {
        workspacePath,
        historyId: entry.id,
      })
      if (isThread && result.diagram.type === 'canvas') {
        setCanvasPlayback({
          key: `history-redo:${entry.id}:${result.diagram.modifiedAt}`,
          path: result.diagram.path,
          mode: 'update',
          fromSource: beforeSource,
          label: '正在重做 AI 修改',
        })
      }
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      if (result.diagram.type === 'canvas' && result.reappliedElementIds.length) {
        const reapplied = parseCanvasScene(result.diagram.source)
        const nodeIds = new Set(reapplied.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        const focusIds = result.reappliedElementIds.filter((id) => nodeIds.has(id))
        if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `history-redo-focus:${entry.id}:${result.diagram.modifiedAt}` })
      }
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      await loadPatchHistory(result.diagram.path)
      setNotice(`已重做这次 AI 修改 · ${result.reappliedElementIds.length} 个元素重新应用`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
      setPatchHistoryRedoingId(null)
    }
  }

  async function redoPatchHistoryChain(entry: DiagramPatchHistoryEntry) {
    if (!selected || selected.path !== entry.path || saving || patchHistoryUndoingId || patchHistoryRedoingId) return
    if (dirty && externalChange) {
      setError('当前画布同时存在未保存修改和外部更新，请先处理外部冲突。')
      return
    }
    setSaving(true)
    setPatchHistoryRedoingId(entry.id)
    setError(null)
    try {
      let beforeSource = source
      if (dirty) {
        const savedDraft = await callTool<DiagramResult>('diagram.update', {
          workspacePath,
          path: selected.path,
          source,
          expectedModifiedAt: selected.modifiedAt,
          animate: false,
        })
        setSelected(savedDraft.diagram)
        setSource(savedDraft.diagram.source)
        beforeSource = savedDraft.diagram.source
        setExternalChange(false)
        onSnapshot({
          ...snapshot,
          diagrams: snapshot.diagrams.map((item) => item.path === savedDraft.diagram.path ? savedDraft.diagram : item),
        })
      }
      const result = await callTool<DiagramPatchHistoryChainRedoResult>('diagram.redoPatchHistoryChain', {
        workspacePath,
        historyId: entry.id,
      })
      if (isThread && result.diagram.type === 'canvas') {
        setCanvasPlayback({
          key: `history-chain-redo:${entry.id}:${result.diagram.modifiedAt}`,
          path: result.diagram.path,
          mode: 'update',
          fromSource: beforeSource,
          label: `正在重做 ${result.historyIds.length} 个依赖 Patch`,
        })
      }
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setExternalChange(false)
      if (result.diagram.type === 'canvas' && result.reappliedElementIds.length) {
        const reapplied = parseCanvasScene(result.diagram.source)
        const nodeIds = new Set(reapplied.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        const focusIds = result.reappliedElementIds.filter((id) => nodeIds.has(id))
        if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `history-chain-redo-focus:${entry.id}:${result.diagram.modifiedAt}` })
      }
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      await loadPatchHistory(result.diagram.path)
      setNotice(`已重做依赖链 · ${result.historyIds.length} 个 Patch · ${result.reappliedElementIds.length} 个元素重新应用`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
      setPatchHistoryRedoingId(null)
    }
  }

  async function refreshList() {
    setError(null)
    try {
      const result = await callTool<DiagramListResult>('diagram.list', { workspacePath })
      onSnapshot({ ...snapshot, diagrams: result.diagrams })
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function searchSourceFiles(query: string): Promise<string[]> {
    const result = await callTool<SourceFilesResult>('diagram.sources', { workspacePath, query, limit: 40 })
    return result.files
  }

  async function analyzeGitImpact(baseRef?: string) {
    if (!selected || selected.type !== 'canvas') return
    setError(null)
    try {
      const result = await callTool<DiagramGitImpactResult>('diagram.impactFromGit', {
        workspacePath,
        path: selected.path,
        ...(baseRef?.trim() ? { baseRef: baseRef.trim() } : {}),
        direction: 'both',
        depth: 2,
        includeUntracked: true,
      })
      setGitImpactReport(result)
      setGitImpactOpen(true)
      setCanvasFocus(result.trace.nodeIds.length ? {
        ids: result.trace.nodeIds,
        key: `git-impact-${Date.now()}`,
        trace: result.directElementIds.length ? {
          seedElementIds: result.directElementIds,
          direction: result.direction,
          depth: result.depth,
        } : undefined,
      } : null)
      setNotice(result.directElementIds.length
        ? `代码影响：${result.git.files.length} 个改动文件 · ${result.directElementIds.length} 个直接节点 · ${Math.max(0, result.trace.nodeIds.length - result.directElementIds.length)} 个间接影响`
        : `发现 ${result.git.files.length} 个 Git 改动文件，但当前图没有 sourcePaths 命中`)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function explainGitImpact() {
    if (!gitImpactReport) return
    setAiSending(true)
    setError(null)
    try {
      const direct = gitImpactReport.buckets.find((bucket) => bucket.distance === 0)?.elementIds ?? []
      const oneHop = gitImpactReport.buckets.find((bucket) => bucket.distance === 1)?.elementIds ?? []
      const twoHop = gitImpactReport.buckets.find((bucket) => bucket.distance === 2)?.elementIds ?? []
      await sendCodexMessage([
        '基于当前 Diagram 的 Git 影响报告分析这次代码改动。请先核对真实代码事实，再说明影响链路、风险点、需要回归的模块和可能遗漏的图节点。',
        `图表：${gitImpactReport.path}`,
        `Git 改动文件：${gitImpactReport.git.files.map((file) => file.path).join(', ') || '无'}`,
        `直接命中节点：${direct.join(', ') || '无'}`,
        `1 跳影响：${oneHop.join(', ') || '无'}`,
        `2 跳影响：${twoHop.join(', ') || '无'}`,
        `未映射文件：${gitImpactReport.unmatchedFiles.map((file) => file.path).join(', ') || '无'}`,
        '不要仅复述列表；结合源码调用、数据流和外部依赖判断真实影响。对于架构上重要但未映射的真实源码，先阅读后可使用 diagram.upsertSourceNodes 批量补充节点；测试、文档、生成文件不要为了覆盖率机械加入架构图。',
      ].join('\n'))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setAiSending(false)
    }
  }

  async function clearGitImpact() {
    setGitImpactReport(null)
    setGitImpactOpen(false)
    setCanvasFocus(null)
    if (!isThread) return
    try {
      await callTool<{ kind: 'diagram-git-impact-dismissed' }>('diagram.dismissGitImpact', {})
    } catch {
      // Clearing the local visualization is still useful if the host bridge is temporarily unavailable.
    }
  }

  async function createDiagram(type: DiagramType, title: string) {
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.create', { workspacePath, type, title, animate: false })
      const next = [result.diagram, ...snapshot.diagrams.filter((item) => item.path !== result.diagram.path)]
      onSnapshot({ ...snapshot, diagrams: next })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setCreating(false)
      rememberThreadTab(result.diagram.path)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function renameDiagram() {
    if (!selected || dirty || !renameTitle.trim()) return
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.rename', {
        workspacePath,
        path: selected.path,
        title: renameTitle.trim(),
        expectedModifiedAt: selected.modifiedAt,
      })
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === selected.path ? result.diagram : item),
      })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setRenaming(false)
      setDocumentMenuOpen(false)
      if (isThread) setThreadTabs((current) => current.map((path) => path === selected.path ? result.diagram.path : path))
      setNotice(`已重命名为 ${result.diagram.name}`)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function duplicateDiagram() {
    if (!selected || dirty) return
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.duplicate', {
        workspacePath,
        path: selected.path,
      })
      const next = [result.diagram, ...snapshot.diagrams]
      onSnapshot({ ...snapshot, diagrams: next })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setDocumentMenuOpen(false)
      setRenaming(false)
      rememberThreadTab(result.diagram.path)
      setNotice(`已复制为 ${result.diagram.name}`)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function deleteDiagram() {
    if (!selected || dirty) return
    const deleting = selected
    setError(null)
    try {
      await callTool<DiagramDeletedResult>('diagram.delete', {
        workspacePath,
        path: deleting.path,
        expectedModifiedAt: deleting.modifiedAt,
      })
      const remaining = snapshot.diagrams.filter((item) => item.path !== deleting.path)
      onSnapshot({ ...snapshot, diagrams: remaining })
      setSelected(null)
      setSource('')
      setDocumentMenuOpen(false)
      setRenaming(false)
      setDeleteConfirmOpen(false)
      setNotice(`已删除 ${deleting.name}`)
      if (remaining[0]) await selectDiagram(remaining[0].path)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function sendGeneration(request: DiagramGenerationRequest) {
    if (!openai.message) {
      setError('当前 Codex Host 没有提供对话消息能力。')
      return
    }
    setAiSending(true)
    setError(null)
    try {
      aiWatch.current = {
        until: Date.now() + 90_000,
        existingPaths: new Set(snapshot.diagrams.map((item) => item.path)),
      }
      await sendCodexMessage(buildGenerationPrompt(workspacePath, request))
      setAiOpen(false)
      setNotice('已发送到当前 Codex 对话，生成后会自动刷新')
    } catch (cause) {
      aiWatch.current = null
      setError(errorMessage(cause))
    } finally {
      setAiSending(false)
    }
  }

  async function sendModification(instruction: string) {
    if (!selected) return
    if (!openai.message) {
      setError('当前 Codex Host 没有提供对话消息能力。')
      return
    }
    if (dirty) {
      setError('先保存当前修改，再让 Codex 继续编辑这张图。')
      return
    }
    setAiSending(true)
    setError(null)
    try {
      await sendCodexMessage(buildModificationPrompt(workspacePath, selected, instruction))
      setAiOpen(false)
      setNotice('已发送到当前 Codex 对话；Codex 返回候选修改后会先进入 Proposal 审查')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setAiSending(false)
    }
  }

  async function updateSelectedCanvasFromConversation() {
    if (!selected || selected.type !== 'canvas' || !canvasSelection?.elements.length) return
    const compact = canvasSelection.elements.map((element) => {
      if (element.type === 'arrow') return { id: element.id, type: element.type, from: element.from, to: element.to, label: element.label, lineStyle: element.lineStyle, routing: element.routing, fromAnchor: element.fromAnchor, toAnchor: element.toAnchor, points: element.points, labelPosition: element.labelPosition, emphasis: element.emphasis, bundleKey: element.bundleKey }
      return { id: element.id, type: element.type, text: element.text, x: element.x, y: element.y, width: element.width, height: element.height, tone: element.tone, shape: element.shape, icon: element.icon, stencil: element.stencil, c4Type: element.c4Type, subtitle: element.subtitle, description: element.description, tags: element.tags, locked: element.locked, groupId: element.groupId, laneId: element.laneId, sourcePaths: element.sourcePaths }
    })
    if (!openai.message) {
      setError('当前 Codex Host 没有提供对话消息能力。')
      return
    }
    if (dirty) {
      setError('先保存当前修改，再让 Codex 继续编辑这张图。')
      return
    }
    setAiSending(true)
    setError(null)
    try {
      await sendCodexMessage(buildSubgraphModificationPrompt(
        workspacePath,
        selected,
        canvasSelection.ids,
        [
          '结合当前对话中用户最新的要求调整当前选区。',
          '当前选区结构：',
          JSON.stringify(compact),
        ].join('\n'),
      ))
      setAiOpen(false)
      setNotice('已发送子图修改请求，候选完成后会在右侧进入 Proposal 审查')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setAiSending(false)
    }
  }

  async function exportSvg() {
    if (!selected || exporting) return
    setExporting(true)
    setError(null)
    try {
      const svg = selected.type === 'canvas'
        ? renderCanvasSvg(source)
        : await renderMermaidSvg(source, `export-${Date.now()}`)
      const filename = `${safeFilename(selected.name)}.svg`
      const destination = await deliverExport(filename, 'svg', svg)
      setNotice(`已导出 ${destination}`)
    } catch (cause) {
      setError(cleanMermaidError(errorMessage(cause)))
    } finally {
      setExporting(false)
    }
  }

  async function exportPng() {
    if (!selected || exporting) return
    setExporting(true)
    setError(null)
    try {
      const svg = selected.type === 'canvas'
        ? renderCanvasSvg(source)
        : await renderMermaidSvg(source, `export-png-${Date.now()}`)
      const blob = await svgToPngBase64(svg, resolveCssColor('--app-bg', '#ffffff'))
      const filename = `${safeFilename(selected.name)}.png`
      const destination = await deliverExport(filename, 'png', blob)
      setNotice(`已导出 ${destination}`)
    } catch (cause) {
      setError(cleanMermaidError(errorMessage(cause)))
    } finally {
      setExporting(false)
    }
  }

  async function deliverExport(filename: string, format: 'svg' | 'png', content: string): Promise<string> {
    if (mcpApp.getHostCapabilities()?.downloadFile) {
      const result = format === 'svg'
        ? await mcpApp.downloadFile({
            contents: [{
              type: 'resource',
              resource: {
                uri: `file:///${encodeURIComponent(filename)}`,
                mimeType: 'image/svg+xml',
                text: content,
              },
            }],
          })
        : await mcpApp.downloadFile({
            contents: [{
              type: 'resource',
              resource: {
                uri: `file:///${encodeURIComponent(filename)}`,
                mimeType: 'image/png',
                blob: content,
              },
            }],
          })
      if (result.isError) throw new Error('Codex Host 取消或拒绝了文件导出。')
      return filename
    }

    const result = await callTool<DiagramExportResult>('diagram.exportAsset', {
      workspacePath,
      filename,
      format,
      content,
    })
    return result.path
  }

  async function openDiagramFile() {
    if (!selected) return
    const fileApi = openai.files
    if (!fileApi) {
      setError('当前 Codex Host 没有提供原生文件打开能力。')
      return
    }
    try {
      await fileApi.open(resolveWorkspaceFilePath(workspacePath, selected.path))
    } catch (cause) {
      setError(`打开图表文件失败：${errorMessage(cause)}`)
    }
  }

  async function openWorkspaceSource(path: string) {
    const fileApi = openai.files
    if (!fileApi) {
      setError('当前 Codex Host 没有提供原生文件打开能力。')
      return
    }
    try {
      await fileApi.open(resolveWorkspaceFilePath(workspacePath, path))
    } catch (cause) {
      setError(`打开源码失败：${errorMessage(cause)}`)
    }
  }

  function openWorkspaceGeneration() {
    setGenerationPreset({
      key: Date.now(),
      scope: '.',
      title: '',
      instructions: '先识别核心模块和边界，再画主要依赖或调用关系；不要把所有文件都展开。',
    })
    setAiOpen(true)
  }

  async function explainInConversation() {
    if (!selected || aiSending) return
    if (!openai.message) {
      setError('当前 Codex Host 没有提供对话消息能力。')
      return
    }
    setAiSending(true)
    setError(null)
    try {
      await sendCodexMessage([
        '解释 Diagram 侧边栏当前选中的图表，并在当前对话中回答，不要修改文件。',
        `工作空间：${workspacePath}`,
        `图表路径：${selected.path}`,
        `图表类型：${selected.type}`,
        '',
        '先调用 diagram.get 读取最新版本；结合当前对话上下文说明主流程、关键边界、异常路径和最值得关注的设计点。',
      ].join('\n'))
      setNotice('已让 Codex 在当前对话中解释这张图')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setAiSending(false)
    }
  }

  function updateFromConversation() {
    void sendModification('结合当前对话中用户最新提出的需求和已确认的代码事实更新这张图。只调整受当前对话影响的部分，保留仍然正确的结构。')
  }

  return (
    <main className={`diagram-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}${isThread ? ' thread-companion' : ''}`}>
      <aside className="diagram-sidebar">
        <div className="sidebar-head">
          <div className="sidebar-title-row">
            <div>
              <div className="eyebrow">DIAGRAMS</div>
              <div className="sidebar-title">图表</div>
            </div>
            <div className="sidebar-head-actions">
              <button className="icon-button" type="button" title="收起图表栏" aria-label="收起图表栏" onClick={() => setSidebarCollapsed(true)}>‹</button>
              <button className="icon-text-button" type="button" onClick={() => setCreating((value) => !value)}>新建</button>
            </div>
          </div>
          <button className="workspace-path" type="button" onClick={requestWorkspaceSwitch} title={workspacePath}>{workspacePath}</button>
        </div>

        {creating ? <NewDiagramForm onCancel={() => setCreating(false)} onCreate={createDiagram} /> : null}

        <div className="diagram-search-wrap">
          <input
            className="diagram-search"
            value={diagramQuery}
            onChange={(event) => setDiagramQuery(event.target.value)}
            placeholder="搜索图表"
            aria-label="搜索图表"
          />
        </div>
        <div className="sidebar-list-head">
          <span>{diagramQuery.trim() ? `${visibleDiagrams.length} / ${snapshot.diagrams.length}` : `${snapshot.diagrams.length} 个图表`}</span>
          <div className="sidebar-list-actions">
            <button type="button" onClick={openWorkspaceGeneration}>工作区→图</button>
            <button type="button" onClick={() => void refreshList()}>刷新</button>
          </div>
        </div>
        <nav className="diagram-list" aria-label="图表列表">
          {visibleDiagrams.map((diagram) => (
            <button
              key={diagram.path}
              className={`diagram-list-item${selected?.path === diagram.path ? ' is-active' : ''}`}
              type="button"
              onClick={() => void selectDiagram(diagram.path)}
            >
              <span className="diagram-list-name">{diagram.name}</span>
              <span className="diagram-list-meta">{diagramLabel(diagram.type)} · {shortPath(diagram.path)}</span>
              {loadingPath === diagram.path ? <span className="loading-line" /> : null}
            </button>
          ))}
          {snapshot.diagrams.length === 0 ? <div className="sidebar-empty">当前项目还没有图表。</div> : null}
          {snapshot.diagrams.length > 0 && visibleDiagrams.length === 0 ? <div className="sidebar-empty">没有匹配的图表。</div> : null}
        </nav>
      </aside>

      {sidebarCollapsed ? (
        <button className="sidebar-expand-button" type="button" title="展开图表栏" aria-label="展开图表栏" onClick={() => setSidebarCollapsed(false)}>›</button>
      ) : null}

      <section className="diagram-main">
        {isThread ? (
          <div className="thread-companion-head">
            <div className="thread-diagram-picker">
              <button
                className={`thread-follow-toggle${followConversation ? ' is-active' : ''}`}
                type="button"
                aria-pressed={followConversation}
                title={followConversation ? '正在跟随当前对话中的图表' : '已暂停跟随当前对话'}
                onClick={() => setFollowConversation((value) => !value)}
              >
                <span className="thread-link-status" />
                跟随
              </button>
              <select
                aria-label="当前图表"
                value={selected?.path ?? ''}
                onChange={(event) => {
                  if (event.target.value) void selectDiagram(event.target.value)
                }}
              >
                {snapshot.diagrams.length === 0 ? <option value="">当前还没有图表</option> : null}
                {snapshot.diagrams.map((diagram) => (
                  <option key={diagram.path} value={diagram.path}>{diagram.name} · {diagramLabel(diagram.type)}</option>
                ))}
              </select>
            </div>
            <button className="thread-new-button" type="button" onClick={() => setAiOpen(true)}>新图</button>
            {threadTabs.length > 0 ? (
              <div className="thread-diagram-tabs" aria-label="当前对话图表">
                {threadTabs.map((path) => {
                  const diagram = snapshot.diagrams.find((item) => item.path === path)
                  if (!diagram) return null
                  return (
                    <div key={path} className={`thread-diagram-tab${selected?.path === path ? ' is-active' : ''}`}>
                      <button type="button" className="thread-diagram-tab-main" onClick={() => void selectDiagram(path)} title={path}>
                        <span>{diagram.name}</span>
                        <small>{diagramLabel(diagram.type)}</small>
                      </button>
                      <button type="button" className="thread-diagram-tab-close" aria-label={`关闭 ${diagram.name}`} onClick={() => closeThreadTab(path)}>×</button>
                    </div>
                  )
                })}
              </div>
            ) : null}
            {selected ? (
              <div className="thread-chat-actions" aria-label="对话联动操作">
                <button type="button" disabled={aiSending || dirty} onClick={updateFromConversation}>按对话更新</button>
                {selected.type === 'canvas' && canvasSelection?.elements.length ? (
                  <button type="button" disabled={aiSending || dirty} onClick={() => void updateSelectedCanvasFromConversation()}>调整选中</button>
                ) : null}
                <button type="button" disabled={aiSending || dirty} onClick={() => void sendModification('结合当前代码事实，为这张图补充真正重要的失败路径、异常分支或回退路径；不要机械增加无关节点。')}>补异常</button>
                <button type="button" disabled={aiSending} onClick={() => void explainInConversation()}>解释</button>
              </div>
            ) : null}
          </div>
        ) : null}
        {isThread && syncIssue ? (
          <div className="sync-warning" role="status">
            <span>{syncIssue}</span>
            <span>不会影响当前图查看与编辑</span>
          </div>
        ) : null}
        {aiProposal ? (
          <div className="proposal-banner" role="status">
            <div>
              <strong>{proposalBranchSet?.branches.length && proposalBranchSet.branches.length > 1 ? `Codex 候选分支 · ${proposalBranchSet.branches.length}` : aiProposal.summary.patchSummary ? 'Codex 增量候选修改' : aiProposal.summary.scopeElementIds?.length ? 'Codex 子图候选修改' : 'Codex 候选修改'}</strong>
              <span>{aiProposal.summary.patchSummary
                ? `${aiProposal.summary.branchLabel ? `${aiProposal.summary.branchLabel} · ` : ''}${aiProposal.summary.patchSummary.updated} 修改 · ${aiProposal.summary.patchSummary.added} 新增 · ${aiProposal.summary.patchSummary.removed} 删除${aiProposal.summary.automaticElementIds?.length ? ` · ${aiProposal.summary.automaticElementIds.length} 自动影响` : ''}`
                : aiProposal.summary.reason || '尚未写入文件，先查看 Diff 再决定。'}</span>
            </div>
            <div className="proposal-banner-actions">
              <button type="button" onClick={() => setProposalReviewOpen(true)}>查看</button>
              <button type="button" onClick={() => void dismissAiProposal()}>{proposalBranchSet?.branches.length && proposalBranchSet.branches.length > 1 ? '拒绝全部' : '拒绝'}</button>
              <button className="primary-button compact" type="button" disabled={saving} onClick={() => void acceptAiProposal()}>{proposalBranchSet?.branches.length && proposalBranchSet.branches.length > 1 ? '接受当前' : '接受'}</button>
            </div>
          </div>
        ) : null}
        {gitImpactReport ? (
          <div className="impact-banner" role="status">
            <div>
              <strong>代码改动影响</strong>
              <span>{gitImpactReport.git.files.length} 个文件 · {gitImpactReport.directElementIds.length} 个直接节点 · {Math.max(0, gitImpactReport.trace.nodeIds.length - gitImpactReport.directElementIds.length)} 个间接节点</span>
            </div>
            <div className="proposal-banner-actions">
              <button type="button" onClick={() => setGitImpactOpen(true)}>查看</button>
              <button type="button" onClick={() => void clearGitImpact()}>清除</button>
            </div>
          </div>
        ) : null}
        {notice ? <div className="notice-banner"><span>{notice}</span>{changeReview ? <button type="button" onClick={() => setChangeReviewOpen(true)}>查看变更</button> : null}</div> : null}
        {externalChange ? (
          <div className="conflict-banner">
            <span>文件已在外部修改</span>
            <button type="button" onClick={() => void reloadSelected()}>重新载入</button>
          </div>
        ) : null}
        {error ? <div className="error-banner">{error}<button type="button" onClick={() => setError(null)}>关闭</button></div> : null}
        {selected ? (
          <>
            <header className={`editor-toolbar${isThread ? ' thread-editor-toolbar' : ''}`}>
              {!isThread ? <div className="document-identity">
                <strong>{selected.name}</strong>
                <span>{selected.path}</span>
              </div> : null}
              <div className="toolbar-actions">
                {!isThread ? <button type="button" onClick={() => setAiOpen(true)}>Codex</button> : null}
                {!isThread ? (
                  <div className="export-actions" aria-label="导出图表">
                    <button type="button" disabled={exporting} onClick={() => void exportSvg()}>{exporting ? '导出中…' : 'SVG'}</button>
                    <button type="button" disabled={exporting} onClick={() => void exportPng()}>PNG</button>
                  </div>
                ) : null}
                <div className="mode-switch" aria-label="视图模式">
                  <ModeButton value="preview" mode={mode} onChange={setMode}>预览</ModeButton>
                  <ModeButton value="source" mode={mode} onChange={setMode}>源码</ModeButton>
                  {!isThread ? <ModeButton value="split" mode={mode} onChange={setMode}>分屏</ModeButton> : null}
                </div>
                {changeReview ? (
                  <button className="change-review-trigger" type="button" onClick={() => setChangeReviewOpen(true)}>变更</button>
                ) : null}
                {aiProposal ? <button className="proposal-review-trigger" type="button" onClick={() => setProposalReviewOpen(true)}>Proposal</button> : null}
                {selected.type === 'canvas' ? <button className={`patch-history-trigger${patchHistoryOpen ? ' is-active' : ''}`} type="button" onClick={openPatchHistory}>历史</button> : null}
                <span className={`save-state${dirty ? ' is-dirty' : ''}`}>{saving ? '保存中…' : dirty ? '未保存' : '已保存'}</span>
                {dirty || saving ? <button className="primary-button compact" type="button" disabled={saving} onClick={() => void saveDiagram()}>保存</button> : null}
                {!isThread ? <div className="document-actions">
                  <button
                    className="document-actions-trigger"
                    type="button"
                    aria-expanded={documentMenuOpen}
                    aria-label="更多图表操作"
                    onClick={() => {
                      setDocumentMenuOpen((value) => !value)
                      setRenaming(false)
                      setRenameTitle(selected.name)
                    }}
                  >•••</button>
                  {documentMenuOpen ? (
                    <div className="document-actions-menu">
                      {renaming ? (
                        <form
                          className="rename-form"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void renameDiagram()
                          }}
                        >
                          <input autoFocus value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} aria-label="新图表名称" />
                          <div>
                            <button type="button" onClick={() => setRenaming(false)}>取消</button>
                            <button className="is-primary" disabled={!renameTitle.trim() || dirty}>保存</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <button type="button" disabled={dirty} onClick={() => { setRenameTitle(selected.name); setRenaming(true) }}>重命名</button>
                          <button type="button" disabled={dirty} onClick={() => void duplicateDiagram()}>复制图表</button>
                          <span className="document-actions-separator" />
                          <button
                            className="is-danger"
                            type="button"
                            disabled={dirty}
                            onClick={() => {
                              setDocumentMenuOpen(false)
                              setDeleteConfirmOpen(true)
                            }}
                          >删除图表</button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div> : null}
              </div>
            </header>
            <div
              ref={editorWorkspace}
              className={`editor-workspace mode-${mode}`}
              style={{ '--diagram-split': `${splitPercent}%` } as CSSProperties}
            >
              {(mode === 'source' || mode === 'split') ? (
                <section className="source-pane">
                  <div className="pane-head">
                    <span>{selected.type === 'canvas' ? 'Canvas JSON' : 'Mermaid'}</span>
                    <div className="pane-head-actions">
                      <span>{diagramLabel(selected.type)}</span>
                      <button type="button" onClick={() => setSourceSearchRequest((value) => value + 1)}>查找</button>
                      <button type="button" onClick={() => void openDiagramFile()}>打开文件</button>
                    </div>
                  </div>
                  <MermaidEditor
                    value={source}
                    onChange={setSource}
                    onSave={() => void saveDiagram()}
                    searchRequest={sourceSearchRequest}
                    syntax={selected.type === 'canvas' ? 'plain' : 'mermaid'}
                    ariaLabel={selected.type === 'canvas' ? '自由画布 JSON 编辑器' : 'Mermaid 源码编辑器'}
                  />
                </section>
              ) : null}
              {mode === 'split' ? (
                <button
                  className="split-resizer"
                  type="button"
                  aria-label="调整源码和预览宽度"
                  title="拖动调整源码和预览宽度"
                  onDoubleClick={() => setSplitPercent(44)}
                  onPointerDown={(event) => {
                    const bounds = editorWorkspace.current?.getBoundingClientRect()
                    if (!bounds) return
                    splitDrag.current = { pointerId: event.pointerId, left: bounds.left, width: bounds.width }
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    const drag = splitDrag.current
                    if (!drag || drag.pointerId !== event.pointerId) return
                    const next = ((event.clientX - drag.left) / drag.width) * 100
                    setSplitPercent(Math.min(68, Math.max(28, next)))
                  }}
                  onPointerUp={(event) => {
                    if (splitDrag.current?.pointerId === event.pointerId) splitDrag.current = null
                  }}
                  onPointerCancel={() => { splitDrag.current = null }}
                />
              ) : null}
              {(mode === 'preview' || mode === 'split') ? (
                <section className="preview-pane">
                  {!isThread || selected.type !== 'canvas' ? <div className="pane-head"><span>{selected.type === 'canvas' ? '画布' : '预览'}</span><span>{selected.type === 'canvas' ? '可视化编辑' : '实时渲染'}</span></div> : null}
                  {selected.type === 'canvas'
                    ? <CanvasEditor
                        key={selected.path}
                        source={source}
                        onChange={setSource}
                        onSelectionChange={setCanvasSelection}
                        onOpenSource={(path) => void openWorkspaceSource(path)}
                        onSearchSources={searchSourceFiles}
                        onAnalyzeGitImpact={() => analyzeGitImpact()}
                        focusElementIds={canvasFocus?.ids}
                        focusKey={canvasFocus?.key}
                        traceRequest={canvasFocus?.trace ? { ...canvasFocus.trace, key: canvasFocus.key } : undefined}
                        playbackRequest={canvasPlayback?.path === selected.path ? canvasPlayback : null}
                        onPlaybackComplete={(key) => setCanvasPlayback((current) => current?.key === key ? null : current)}
                      />
                    : <MermaidPreview source={source} />}
                </section>
              ) : null}
            </div>
          </>
        ) : (
          <div className="main-empty">
            <div className="empty-graphic"><span /><span /><span /></div>
            <h2>选择或创建一个图表</h2>
            <p>结构化图使用 Mermaid；自由布局的架构草图和说明使用 Canvas 文档。</p>
            <div className="empty-actions">
              <button className="primary-button" type="button" onClick={() => setCreating(true)}>新建图表</button>
              <button type="button" onClick={() => setAiOpen(true)}>从代码生成</button>
            </div>
          </div>
        )}
        {aiOpen ? (
          <AiPanel
            selected={selected}
            sending={aiSending}
            generationPreset={generationPreset}
            onSearchSources={searchSourceFiles}
            onClose={() => setAiOpen(false)}
            onGenerate={sendGeneration}
            onModify={sendModification}
          />
        ) : null}
        {changeReview && changeReviewOpen ? (
          <ChangeReviewPanel
            before={changeReview.before}
            after={changeReview.after}
            restoring={saving}
            onClose={() => setChangeReviewOpen(false)}
            onRestore={() => void restorePreviousChange()}
          />
        ) : null}
        {aiProposal && proposalReviewOpen ? (
          <ProposalReviewPanel
            before={aiProposal.before}
            after={aiProposal.after}
            reason={aiProposal.summary.reason}
            scopeElementIds={aiProposal.summary.scopeElementIds}
            newElementIds={aiProposal.summary.newElementIds}
            impactElementIds={aiProposal.summary.impactElementIds}
            automaticElementIds={aiProposal.summary.automaticElementIds}
            rebaseable={aiProposal.summary.rebaseable}
            patchSummary={aiProposal.summary.patchSummary}
            branches={proposalBranchSet?.branches}
            activeBranchId={proposalBranchSet?.activeBranchId}
            applying={saving}
            onClose={() => setProposalReviewOpen(false)}
            onAccept={(elementIds) => void acceptAiProposal(elementIds)}
            onReject={() => void dismissAiProposal()}
            onSelectBranch={(branchId) => void selectProposalBranch(branchId)}
            onComposeBranches={(branchIds) => void composeProposalBranches(branchIds)}
          />
        ) : null}
        {selected?.type === 'canvas' && patchHistoryOpen ? (
          <PatchHistoryPanel
            path={selected.path}
            entries={patchHistoryEntries}
            loading={patchHistoryLoading}
            undoingId={patchHistoryUndoingId}
            redoingId={patchHistoryRedoingId}
            onClose={() => setPatchHistoryOpen(false)}
            onRefresh={() => void loadPatchHistory(selected.path)}
            onUndo={(entry) => void undoPatchHistory(entry)}
            onUndoChain={(entry) => void undoPatchHistoryChain(entry)}
            onRedo={(entry) => void redoPatchHistory(entry)}
            onRedoChain={(entry) => void redoPatchHistoryChain(entry)}
            onFocus={(ids) => {
              const live = parseCanvasScene(source)
              const nodeIds = new Set(live.elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
              const focusIds = ids.filter((id) => nodeIds.has(id))
              if (focusIds.length) setCanvasFocus({ ids: focusIds, key: `history-focus:${Date.now()}` })
            }}
          />
        ) : null}
        {gitImpactReport && gitImpactOpen ? (
          <GitImpactPanel
            report={gitImpactReport}
            onClose={() => setGitImpactOpen(false)}
            onFocus={(ids) => setCanvasFocus(ids.length ? { ids, key: `impact-focus-${Date.now()}` } : null)}
            onExplain={() => void explainGitImpact()}
            onReanalyze={(baseRef) => void analyzeGitImpact(baseRef)}
            explaining={aiSending}
          />
        ) : null}
        {selected && deleteConfirmOpen ? (
          <div className="confirm-overlay" role="presentation" onMouseDown={() => setDeleteConfirmOpen(false)}>
            <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-diagram-title" onMouseDown={(event) => event.stopPropagation()}>
              <strong id="delete-diagram-title">删除“{selected.name}”</strong>
              <p>{selected.path}</p>
              <div className="confirm-dialog-actions">
                <button type="button" onClick={() => setDeleteConfirmOpen(false)}>取消</button>
                <button className="danger-button" type="button" onClick={() => void deleteDiagram()}>确认删除</button>
              </div>
            </div>
          </div>
        ) : null}
        {discardTarget ? (
          <div className="confirm-overlay" role="presentation" onMouseDown={() => setDiscardTarget(null)}>
            <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-diagram-title" onMouseDown={(event) => event.stopPropagation()}>
              <strong id="discard-diagram-title">放弃未保存修改？</strong>
              <p>当前图表还有未保存内容。继续后这些修改不会保留。</p>
              <div className="confirm-dialog-actions">
                <button type="button" onClick={() => setDiscardTarget(null)}>继续编辑</button>
                <button className="danger-button" type="button" onClick={discardUnsavedChanges}>放弃并继续</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function PatchHistoryPanel({ path, entries, loading, undoingId, redoingId, onClose, onRefresh, onUndo, onUndoChain, onRedo, onRedoChain, onFocus }: {
  path: string
  entries: DiagramPatchHistoryEntry[]
  loading: boolean
  undoingId: string | null
  redoingId: string | null
  onClose: () => void
  onRefresh: () => void
  onUndo: (entry: DiagramPatchHistoryEntry) => void
  onUndoChain: (entry: DiagramPatchHistoryEntry) => void
  onRedo: (entry: DiagramPatchHistoryEntry) => void
  onRedoChain: (entry: DiagramPatchHistoryEntry) => void
  onFocus: (ids: string[]) => void
}) {
  const activeDependentClosure = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const result = new Map<string, string[]>()
    const collect = (rootId: string) => {
      const seen = new Set<string>()
      const visit = (id: string) => {
        const item = byId.get(id)
        if (!item) return
        for (const childId of item.dependentIds ?? []) {
          const child = byId.get(childId)
          if (!child || child.undoneAt || seen.has(childId)) continue
          seen.add(childId)
          visit(childId)
        }
      }
      visit(rootId)
      return [...seen]
    }
    for (const entry of entries) result.set(entry.id, collect(entry.id))
    return result
  }, [entries])
  const undoneDependentClosure = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const result = new Map<string, string[]>()
    const collect = (rootId: string) => {
      const seen = new Set<string>()
      const visit = (id: string) => {
        const item = byId.get(id)
        if (!item) return
        for (const childId of item.dependentIds ?? []) {
          const child = byId.get(childId)
          if (!child || !child.undoneAt || seen.has(childId)) continue
          seen.add(childId)
          visit(childId)
        }
      }
      visit(rootId)
      return [...seen]
    }
    for (const entry of entries) result.set(entry.id, collect(entry.id))
    return result
  }, [entries])
  const graphStats = useMemo(() => ({
    roots: entries.filter((entry) => !entry.dependsOnIds?.length).length,
    edges: entries.reduce((sum, entry) => sum + (entry.dependsOnIds?.length ?? 0), 0),
    active: entries.filter((entry) => !entry.undoneAt).length,
  }), [entries])
  return (
    <aside className="change-review-panel patch-history-panel" aria-label="AI 修改历史">
      <div className="change-review-head">
        <div>
          <div className="eyebrow">AI CHANGE TIMELINE</div>
          <strong>AI 修改历史</strong>
          <span>{entries.length} transactions</span>
        </div>
        <div className="patch-history-head-actions">
          <button type="button" disabled={loading} onClick={onRefresh}>{loading ? '刷新中…' : '刷新'}</button>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="change-review-path">{path}</div>
      {entries.length ? (
        <div className="patch-history-graph-summary">
          <strong>PATCH DAG</strong>
          <span>{graphStats.roots} roots</span>
          <span>{graphStats.edges} edges</span>
          <span>{graphStats.active} active</span>
        </div>
      ) : null}
      <div className="patch-history-body">
        {loading && entries.length === 0 ? <div className="patch-history-empty">正在读取本地 AI 修改历史…</div> : null}
        {!loading && entries.length === 0 ? <div className="patch-history-empty">这张图还没有已应用的增量 AI 修改。</div> : null}
        {entries.map((entry) => {
          const activeDependents = activeDependentClosure.get(entry.id) ?? []
          const undoneDependents = undoneDependentClosure.get(entry.id) ?? []
          return (
          <article
            key={entry.id}
            className={`patch-history-entry${entry.undoneAt ? ' is-undone' : ''}`}
            style={{ '--patch-depth': Math.min(3, entry.dependencyDepth ?? 0) } as CSSProperties}
          >
            <div className="patch-history-entry-head">
              <div>
                <time dateTime={entry.appliedAt}>{formatPatchHistoryTime(entry.appliedAt)}</time>
                <strong>{entry.reason?.trim() || '增量修改 Canvas'}</strong>
              </div>
              <div className="patch-history-badges">
                {entry.rebased ? <span>已 Rebase</span> : null}
                {entry.partial ? <span>部分接受</span> : null}
                {entry.proposalBranchLabel ? <span>{entry.proposalBranchLabel}</span> : null}
                <span>{entry.layout === 'local' ? '局部布局' : '保持布局'}</span>
                {entry.undoneAt ? <span className="is-undone">已撤销</span> : null}
                {entry.redoneAt ? <span>已重做</span> : null}
                {entry.undoBatchId ? <span>链撤销</span> : null}
                {entry.redoBatchId ? <span>链重做</span> : null}
              </div>
            </div>
            {(entry.dependsOnIds?.length || entry.dependentIds?.length) ? (
              <div className="patch-history-graph-meta">
                <span>Patch DAG</span>
                {entry.dependsOnIds?.length ? <span>↑ {entry.dependsOnIds.length} 上游</span> : <span>根节点</span>}
                {activeDependents.length ? <strong>↓ {activeDependents.length} 活跃下游</strong> : null}
              </div>
            ) : null}
            <div className="patch-history-counts">
              <span><strong>{entry.counts.updated}</strong> 修改</span>
              <span><strong>{entry.counts.added}</strong> 新增</span>
              <span><strong>{entry.counts.removed}</strong> 删除</span>
              {entry.counts.automatic ? <span><strong>{entry.counts.automatic}</strong> 自动影响</span> : null}
            </div>
            <div className="patch-history-changes">
              {entry.changes.slice(0, 8).map((change) => (
                <button key={change.id} type="button" className="patch-history-change" onClick={() => onFocus([change.id])} title={change.id}>
                  <span className={`proposal-change-kind is-${change.kind}`}>{change.kind === 'add' ? '新增' : change.kind === 'remove' ? '删除' : '修改'}</span>
                  <span className={`patch-history-origin${change.automatic ? ' is-automatic' : ''}`}>{change.automatic ? '自动' : 'AI'}</span>
                  <strong>{change.label}</strong>
                  <small>{change.fields.join(' · ')}</small>
                </button>
              ))}
              {entry.changes.length > 8 ? <div className="patch-history-more">还有 {entry.changes.length - 8} 个受影响元素</div> : null}
            </div>
            <div className="patch-history-entry-actions">
              <button type="button" disabled={entry.changes.length === 0} onClick={() => onFocus(entry.changes.map((item) => item.id))}>定位影响</button>
              {entry.undoneAt ? (
                <>
                  <span>撤销于 {formatPatchHistoryTime(entry.undoneAt)}</span>
                  {undoneDependents.length ? (
                    <button type="button" disabled={Boolean(undoingId || redoingId)} onClick={() => onRedoChain(entry)}>
                      {redoingId === entry.id ? '重做链中…' : `重做依赖链 (${undoneDependents.length + 1})`}
                    </button>
                  ) : (
                    <button type="button" disabled={Boolean(undoingId || redoingId)} onClick={() => onRedo(entry)}>
                      {redoingId === entry.id ? '重做中…' : '重做这次修改'}
                    </button>
                  )}
                </>
              ) : (
                activeDependents.length ? (
                  <button className="is-danger" type="button" disabled={Boolean(undoingId || redoingId)} onClick={() => onUndoChain(entry)}>
                    {undoingId === entry.id ? '撤销链中…' : `撤销依赖链 (${activeDependents.length + 1})`}
                  </button>
                ) : (
                  <button className="is-danger" type="button" disabled={Boolean(undoingId || redoingId)} onClick={() => onUndo(entry)}>
                    {undoingId === entry.id ? '撤销中…' : '撤销这次修改'}
                  </button>
                )
              )}
            </div>
          </article>
          )
        })}
      </div>
    </aside>
  )
}

function GitImpactPanel({ report, onClose, onFocus, onExplain, onReanalyze, explaining }: {
  report: DiagramGitImpactResult
  onClose: () => void
  onFocus: (ids: string[]) => void
  onExplain: () => void
  onReanalyze: (baseRef?: string) => void
  explaining: boolean
}) {
  const [baseRef, setBaseRef] = useState(report.git.baseRef ?? '')
  return (
    <aside className="change-review-panel impact-review-panel" aria-label="代码改动影响报告">
      <div className="change-review-head">
        <div>
          <div className="eyebrow">GIT IMPACT</div>
          <strong>代码改动影响</strong>
          <span>{report.git.files.length} files</span>
        </div>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      <div className="change-review-path">{report.path}</div>
      <div className="impact-review-body">
        <section className="impact-base-ref">
          <div className="impact-section-head"><strong>比较基线</strong><span>{report.git.baseRef ? `${report.git.baseRef}...HEAD` : 'Working tree'}</span></div>
          <div>
            <input value={baseRef} onChange={(event) => setBaseRef(event.target.value)} placeholder="例如 origin/main" aria-label="Git 比较基线" />
            <button type="button" onClick={() => onReanalyze(baseRef.trim() || undefined)}>重新分析</button>
          </div>
        </section>
        <section>
          <div className="impact-section-head"><strong>影响层级</strong><span>{report.trace.nodeIds.length} nodes</span></div>
          {report.buckets.map((bucket) => (
            <button key={bucket.distance} type="button" className="impact-bucket" onClick={() => onFocus(bucket.elementIds)}>
              <span>{bucket.distance === 0 ? '直接修改' : `${bucket.distance} 跳影响`}</span>
              <strong>{bucket.elementIds.length}</strong>
            </button>
          ))}
          {!report.buckets.length ? <p className="impact-empty">当前图没有节点绑定这些改动文件。</p> : null}
        </section>
        <section>
          <div className="impact-section-head"><strong>改动文件</strong><span>{report.matchedFiles.length}/{report.git.files.length} mapped</span></div>
          {report.matchedFiles.map((file) => (
            <button key={file.path} type="button" className="impact-file-row" title={file.path} onClick={() => onFocus(file.elementIds)}>
              <code>{file.path}</code>
              <span>{file.elementIds.length} nodes</span>
            </button>
          ))}
        </section>
        {report.unmatchedFiles.length ? (
          <section>
            <div className="impact-section-head"><strong>未映射文件</strong><span>{report.unmatchedFiles.length}</span></div>
            <div className="impact-unmapped-list">
              {report.unmatchedFiles.map((file) => <code key={file.path}>{file.path}</code>)}
            </div>
          </section>
        ) : null}
      </div>
      <div className="change-review-actions">
        <button type="button" disabled={explaining} onClick={onExplain}>{explaining ? '发送中…' : '交给 Codex 分析'}</button>
        <button type="button" onClick={() => onFocus(report.directElementIds)}>定位直接修改</button>
        <button className="primary-button" type="button" onClick={() => onFocus(report.trace.nodeIds)}>查看完整影响</button>
      </div>
    </aside>
  )
}

function ChangeReviewPanel({ before, after, restoring, onClose, onRestore }: {
  before: DiagramDocument
  after: DiagramDocument
  restoring: boolean
  onClose: () => void
  onRestore: () => void
}) {
  const diff = useMemo(() => buildLineDiff(before.source, after.source), [after.source, before.source])
  const added = diff.filter((line) => line.kind === 'add').length
  const removed = diff.filter((line) => line.kind === 'remove').length
  return (
    <aside className="change-review-panel" aria-label="图表变更对比">
      <div className="change-review-head">
        <div>
          <div className="eyebrow">CHANGE REVIEW</div>
          <strong>外部修改</strong>
          <span>+{added} / −{removed}</span>
        </div>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      <div className="change-review-path">{after.path}</div>
      <div className="change-review-diff" role="log" aria-label="源码差异">
        {diff.map((line, index) => (
          <div key={`${index}-${line.kind}`} className={`diff-line is-${line.kind}`}>
            <span>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>
            <code>{line.text || ' '}</code>
          </div>
        ))}
      </div>
      <div className="change-review-actions">
        <button type="button" disabled={restoring} onClick={onRestore}>{restoring ? '恢复中…' : '恢复旧版'}</button>
        <button className="primary-button" type="button" onClick={onClose}>保留新版</button>
      </div>
    </aside>
  )
}

function ProposalReviewPanel({ before, after, reason, scopeElementIds, newElementIds, impactElementIds, automaticElementIds, rebaseable, patchSummary, branches, activeBranchId, applying, onClose, onAccept, onReject, onSelectBranch, onComposeBranches }: {
  before: DiagramDocument
  after: DiagramDocument
  reason?: string
  scopeElementIds?: string[]
  newElementIds?: string[]
  impactElementIds?: string[]
  automaticElementIds?: string[]
  rebaseable?: boolean
  patchSummary?: DiagramProposalSummary['patchSummary']
  branches?: DiagramProposalSummary[]
  activeBranchId?: string
  applying: boolean
  onClose: () => void
  onAccept: (elementIds?: string[]) => void
  onReject: () => void
  onSelectBranch: (branchId: string) => void
  onComposeBranches: (branchIds: string[]) => void
}) {
  const diff = useMemo(() => buildLineDiff(before.source, after.source), [after.source, before.source])
  const added = diff.filter((line) => line.kind === 'add').length
  const removed = diff.filter((line) => line.kind === 'remove').length
  const canvasChanges = useMemo(() => buildCanvasProposalChanges(before, after), [after, before])
  const canvasDependencies = useMemo(() => buildCanvasProposalDependencies(before, after), [after, before])
  const automaticIds = useMemo(() => new Set(automaticElementIds ?? []), [automaticElementIds])
  const branchComparison = useMemo(() => {
    const counts = new Map<string, number>()
    for (const branch of branches ?? []) {
      for (const id of new Set(branch.impactElementIds ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return new Map((branches ?? []).flatMap((branch) => {
      if (!branch.branchId) return []
      const ids = [...new Set(branch.impactElementIds ?? [])]
      return [[branch.branchId, {
        unique: ids.filter((id) => counts.get(id) === 1).length,
        shared: ids.filter((id) => (counts.get(id) ?? 0) > 1).length,
      }] as const]
    }))
  }, [branches])
  const partialSelectionAllowed = patchSummary?.layout !== 'local'
  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  useEffect(() => {
    setSelectedChangeIds(canvasChanges?.map((item) => item.id) ?? [])
  }, [canvasChanges])
  useEffect(() => {
    const available = new Set((branches ?? []).flatMap((branch) => branch.branchId ? [branch.branchId] : []))
    setSelectedBranchIds((current) => current.filter((id) => available.has(id)))
  }, [branches])
  return (
    <aside className="change-review-panel proposal-review-panel" aria-label="Codex 候选修改">
      <div className="change-review-head">
        <div>
          <div className="eyebrow">AI PROPOSAL</div>
          <strong>候选修改</strong>
          <span>+{added} / −{removed}</span>
        </div>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      <div className="change-review-path">{after.path}</div>
      {branches && branches.length > 1 ? (
        <div className="proposal-branch-compare" aria-label="AI 候选分支">
          <div className="proposal-branch-head">
            <strong>候选分支</strong>
            <div>
              <span>{branches.length} 个方案 · 共享同一基线</span>
              <button type="button" disabled={applying || selectedBranchIds.length < 2} onClick={() => onComposeBranches(selectedBranchIds)}>
                组合选中{selectedBranchIds.length >= 2 ? ` (${selectedBranchIds.length})` : ''}
              </button>
            </div>
          </div>
          <div className="proposal-branch-grid">
            {branches.map((branch, index) => (
              <div key={branch.branchId ?? `${index}`} className={`proposal-branch-card${branch.branchId === activeBranchId ? ' is-active' : ''}`}>
                <label className="proposal-branch-check" title="选择后可与其它兼容候选组合">
                  <input
                    type="checkbox"
                    disabled={applying || !branch.branchId}
                    checked={Boolean(branch.branchId && selectedBranchIds.includes(branch.branchId))}
                    onChange={(event) => branch.branchId && setSelectedBranchIds((current) => event.target.checked
                      ? [...new Set([...current, branch.branchId!])]
                      : current.filter((id) => id !== branch.branchId))}
                  />
                </label>
                <button type="button" disabled={applying || !branch.branchId} onClick={() => branch.branchId && onSelectBranch(branch.branchId)}>
                  <strong>{branch.branchLabel || `方案 ${index + 1}`}</strong>
                  {branch.patchSummary ? (
                    <span>{branch.patchSummary.updated} 改 · {branch.patchSummary.added} 增 · {branch.patchSummary.removed} 删</span>
                  ) : <span>整图候选</span>}
                  <small>
                    {branch.branchId && branchComparison.get(branch.branchId)?.unique ? `${branchComparison.get(branch.branchId)!.unique} 独有` : '无独有'}
                    {branch.branchId && branchComparison.get(branch.branchId)?.shared ? ` · ${branchComparison.get(branch.branchId)!.shared} 共同` : ''}
                    {branch.automaticElementIds?.length ? ` · ${branch.automaticElementIds.length} 自动` : ''}
                    {branch.patchSummary?.layout === 'local' ? ' · 局部布局' : ''}
                  </small>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {scopeElementIds?.length ? (
        <div className="proposal-scope-summary">
          <strong>SUBGRAPH</strong>
          <span>
            {scopeElementIds.length} 个 scope
            {newElementIds?.length ? ` · ${newElementIds.length} 新增` : ''}
            {impactElementIds?.length ? ` · ${impactElementIds.length} 影响` : ''}
            {automaticElementIds?.length ? ` · ${automaticElementIds.length} 自动` : ''}
          </span>
        </div>
      ) : null}
      {patchSummary ? (
        <div className="proposal-patch-summary">
          <span><strong>{patchSummary.updated}</strong> 修改</span>
          <span><strong>{patchSummary.added}</strong> 新增</span>
          <span><strong>{patchSummary.removed}</strong> 删除</span>
          <span>{patchSummary.layout === 'local' ? '局部布局' : '保持布局'}</span>
          {rebaseable ? <span>并发安全合并</span> : null}
        </div>
      ) : null}
      {reason ? <div className="proposal-review-reason">{reason}</div> : null}
      {canvasChanges?.length ? (
        <div className="proposal-element-changes" aria-label="候选元素修改">
          <div className="proposal-element-head">
            <strong>Canvas 元素</strong>
            <span>{partialSelectionAllowed ? `${selectedChangeIds.length}/${canvasChanges.length} 已选择` : '局部布局 · 整体事务'}</span>
          </div>
          {canvasChanges.map((change) => (
            <label key={change.id} className={`proposal-element-row${automaticIds.has(change.id) ? ' is-automatic' : ''}`}>
              <input
                type="checkbox"
                disabled={!partialSelectionAllowed}
                checked={selectedChangeIds.includes(change.id)}
                onChange={(event) => setSelectedChangeIds((current) => updateProposalSelection(current, change.id, event.target.checked, canvasDependencies))}
              />
              <span className={`proposal-change-kind is-${change.kind}`}>{change.kind === 'add' ? '新增' : change.kind === 'remove' ? '删除' : '修改'}</span>
              <span className="proposal-auto-badge">{automaticIds.has(change.id) ? '自动' : 'AI'}</span>
              <span className="proposal-change-detail">
                <code>{change.label}</code>
                {change.fields.length ? <small>{change.fields.join(' · ')}</small> : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      {patchSummary && canvasChanges?.length ? <div className="proposal-selection-note">{partialSelectionAllowed ? '部分接受会保留未选元素；必要关系会按最终节点状态安全清理或重新路由。' : '局部布局会同时调整一个受限邻域，为避免只应用一半布局造成重叠，本候选只支持整体接受或拒绝。'}</div> : null}
      {patchSummary ? (
        <details className="proposal-source-diff">
          <summary>源码差异 · +{added} / −{removed}</summary>
          <div className="change-review-diff" role="log" aria-label="候选源码差异">
            {diff.map((line, index) => (
              <div key={`${index}-${line.kind}`} className={`diff-line is-${line.kind}`}>
                <span>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>
                <code>{line.text || ' '}</code>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div className="change-review-diff" role="log" aria-label="候选源码差异">
          {diff.map((line, index) => (
            <div key={`${index}-${line.kind}`} className={`diff-line is-${line.kind}`}>
              <span>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>
              <code>{line.text || ' '}</code>
            </div>
          ))}
        </div>
      )}
      <div className="change-review-actions">
        <button type="button" disabled={applying} onClick={onReject}>{branches && branches.length > 1 ? '拒绝全部' : '拒绝'}</button>
        {canvasChanges?.length && partialSelectionAllowed ? <button type="button" disabled={applying || selectedChangeIds.length === 0 || selectedChangeIds.length === canvasChanges.length} onClick={() => onAccept(selectedChangeIds)}>{applying ? '应用中…' : `仅应用已选 (${selectedChangeIds.length})`}</button> : null}
        <button className="primary-button" type="button" disabled={applying} onClick={() => onAccept()}>{applying ? '应用中…' : branches && branches.length > 1 ? '接受当前方案' : '全部接受'}</button>
      </div>
    </aside>
  )
}

type CanvasProposalChange = { id: string; kind: 'add' | 'remove' | 'update'; label: string; fields: string[] }

function buildCanvasProposalChanges(before: DiagramDocument, after: DiagramDocument): CanvasProposalChange[] | null {
  if (before.type !== 'canvas' || after.type !== 'canvas') return null
  try {
    const left = parseCanvasScene(before.source)
    const right = parseCanvasScene(after.source)
    const leftById = new Map(left.elements.map((item) => [item.id, item]))
    const rightById = new Map(right.elements.map((item) => [item.id, item]))
    const ids = [...new Set([...leftById.keys(), ...rightById.keys()])]
    const changes: CanvasProposalChange[] = []
    for (const id of ids) {
      const previous = leftById.get(id)
      const next = rightById.get(id)
      if (!previous && next) changes.push({ id, kind: 'add', label: canvasElementReviewLabel(next), fields: ['新增'] })
      else if (previous && !next) changes.push({ id, kind: 'remove', label: canvasElementReviewLabel(previous), fields: ['删除'] })
      else if (previous && next && JSON.stringify(previous) !== JSON.stringify(next)) changes.push({ id, kind: 'update', label: canvasElementReviewLabel(next), fields: canvasElementChangedFields(previous, next) })
    }
    return changes
  } catch {
    return null
  }
}

function canvasElementChangedFields(previous: ReturnType<typeof parseCanvasScene>['elements'][number], next: ReturnType<typeof parseCanvasScene>['elements'][number]): string[] {
  const labels = new Set<string>()
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  keys.delete('id')
  keys.delete('type')
  for (const key of keys) {
    const before = (previous as unknown as Record<string, unknown>)[key]
    const after = (next as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    labels.add(canvasChangeFieldLabel(key))
  }
  return [...labels]
}

function canvasChangeFieldLabel(field: string): string {
  if (field === 'x' || field === 'y') return '位置'
  if (field === 'width' || field === 'height') return '尺寸'
  if (field === 'from' || field === 'to') return '端点'
  if (field === 'points' || field === 'routing' || field === 'fromAnchor' || field === 'toAnchor' || field === 'bundleKey') return '路由'
  if (field === 'labelPosition') return '标签位置'
  if (field === 'text') return '文字'
  if (field === 'label') return '关系文字'
  if (field === 'subtitle') return '副标题'
  if (field === 'description') return '说明'
  if (field === 'icon') return '角色'
  if (field === 'stencil') return '技术栈'
  if (field === 'groupId') return '边界'
  if (field === 'laneId') return '泳道'
  if (field === 'c4Type') return 'C4'
  if (field === 'tone' || field === 'shape' || field === 'emphasis' || field === 'lineStyle') return '外观'
  if (field === 'sourcePaths') return '源码'
  if (field === 'tags') return '标签'
  if (field === 'locked') return '锁定'
  return field
}

function canvasElementReviewLabel(element: ReturnType<typeof parseCanvasScene>['elements'][number]): string {
  if (element.type === 'arrow') return `${element.id}: ${element.from} → ${element.to}${element.label ? ` · ${element.label}` : ''}`
  return `${element.id}: ${element.text}`
}

function buildCanvasProposalDependencies(before: DiagramDocument, after: DiagramDocument): Map<string, string[]> {
  const dependencies = new Map<string, string[]>()
  if (before.type !== 'canvas' || after.type !== 'canvas') return dependencies
  try {
    const left = parseCanvasScene(before.source)
    const right = parseCanvasScene(after.source)
    const baseIds = new Set(left.elements.map((item) => item.id))
    const changedIds = new Set(buildCanvasProposalChanges(before, after)?.map((item) => item.id) ?? [])
    for (const item of right.elements) {
      if (item.type !== 'arrow' || !changedIds.has(item.id)) continue
      const required = [item.from, item.to].filter((id) => !baseIds.has(id) && changedIds.has(id))
      if (required.length) dependencies.set(item.id, required)
    }
  } catch {
    return dependencies
  }
  return dependencies
}

function updateProposalSelection(current: string[], id: string, checked: boolean, dependencies: Map<string, string[]>): string[] {
  const selected = new Set(current)
  if (checked) {
    selected.add(id)
    for (const dependency of dependencies.get(id) ?? []) selected.add(dependency)
  } else {
    selected.delete(id)
    for (const [owner, required] of dependencies) {
      if (required.includes(id)) selected.delete(owner)
    }
  }
  return [...selected]
}

type DiffLine = { kind: 'context' | 'add' | 'remove'; text: string }

function buildLineDiff(before: string, after: string): DiffLine[] {
  const left = before.replace(/\r\n/g, '\n').split('\n')
  const right = after.replace(/\r\n/g, '\n').split('\n')
  if (left.length > 350 || right.length > 350) return buildCompactDiff(left, right)
  const rows = left.length + 1
  const cols = right.length + 1
  const lcs = new Uint16Array(rows * cols)
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] = left[i] === right[j]
        ? 1 + lcs[(i + 1) * cols + j + 1]
        : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1])
    }
  }
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push({ kind: 'context', text: left[i] })
      i += 1
      j += 1
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      result.push({ kind: 'remove', text: left[i++] })
    } else {
      result.push({ kind: 'add', text: right[j++] })
    }
  }
  while (i < left.length) result.push({ kind: 'remove', text: left[i++] })
  while (j < right.length) result.push({ kind: 'add', text: right[j++] })
  return collapseDiffContext(result)
}

function buildCompactDiff(left: string[], right: string[]): DiffLine[] {
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1
  let suffix = 0
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1
  const result: DiffLine[] = []
  left.slice(Math.max(0, prefix - 3), prefix).forEach((text) => result.push({ kind: 'context', text }))
  left.slice(prefix, Math.min(left.length - suffix, prefix + 120)).forEach((text) => result.push({ kind: 'remove', text }))
  right.slice(prefix, Math.min(right.length - suffix, prefix + 120)).forEach((text) => result.push({ kind: 'add', text }))
  if (suffix > 0) right.slice(right.length - Math.min(3, suffix)).forEach((text) => result.push({ kind: 'context', text }))
  return result
}

function collapseDiffContext(lines: DiffLine[]): DiffLine[] {
  const changed = lines.map((line, index) => line.kind === 'context' ? -1 : index).filter((index) => index >= 0)
  if (changed.length === 0) return lines.slice(0, 8)
  const keep = new Set<number>()
  changed.forEach((index) => {
    for (let cursor = Math.max(0, index - 3); cursor <= Math.min(lines.length - 1, index + 3); cursor += 1) keep.add(cursor)
  })
  const result: DiffLine[] = []
  let omitted = false
  lines.forEach((line, index) => {
    if (keep.has(index)) {
      omitted = false
      result.push(line)
    } else if (!omitted) {
      omitted = true
      result.push({ kind: 'context', text: '⋯' })
    }
  })
  return result
}

function NewDiagramForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (type: DiagramType, title: string) => Promise<void> }) {
  const [type, setType] = useState<DiagramType>('flowchart')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      className="new-diagram-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!title.trim()) return
        setSubmitting(true)
        void onCreate(type, title).finally(() => setSubmitting(false))
      }}
    >
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="图表名称" />
      <select value={type} onChange={(event) => setType(event.target.value as DiagramType)}>
        {diagramTypeGroups.map((group) => (
          <optgroup key={group.category} label={group.label}>
            {group.items.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="form-actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button className="primary-button compact" disabled={submitting || !title.trim()}>{submitting ? '创建中…' : '创建'}</button>
      </div>
    </form>
  )
}

function ModeButton({ value, mode, onChange, children }: { value: ViewMode; mode: ViewMode; onChange: (value: ViewMode) => void; children: ReactNode }) {
  return <button type="button" className={mode === value ? 'is-active' : ''} onClick={() => onChange(value)}>{children}</button>
}

function MermaidPreview({ source }: { source: string }) {
  const container = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [themeRevision, setThemeRevision] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [svgSize, setSvgSize] = useState({ width: 1, height: 1 })
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
  const renderId = useMemo(() => `diagram-${Math.random().toString(36).slice(2)}`, [])

  function centerAt(nextZoom: number) {
    const surface = viewport.current
    if (!surface) return
    const clamped = clampZoom(nextZoom)
    setZoom(clamped)
    setOffset({
      x: (surface.clientWidth - svgSize.width * clamped) / 2,
      y: (surface.clientHeight - svgSize.height * clamped) / 2,
    })
  }

  function fit() {
    const surface = viewport.current
    if (!surface || svgSize.width <= 1 || svgSize.height <= 1) return
    const horizontal = Math.max(80, surface.clientWidth - 96) / svgSize.width
    const vertical = Math.max(80, surface.clientHeight - 96) / svgSize.height
    centerAt(Math.min(horizontal, vertical, 1.35))
  }

  function zoomBy(factor: number) {
    const surface = viewport.current
    if (!surface) return
    const next = clampZoom(zoom * factor)
    const cx = surface.clientWidth / 2
    const cy = surface.clientHeight / 2
    const ratio = next / zoom
    setOffset({ x: cx - (cx - offset.x) * ratio, y: cy - (cy - offset.y) * ratio })
    setZoom(next)
  }

  useEffect(() => {
    const onTheme = () => setThemeRevision((value) => value + 1)
    window.addEventListener('diagram-theme-change', onTheme)
    return () => window.removeEventListener('diagram-theme-change', onTheme)
  }, [])

  useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(() => {
      void render()
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }

    async function render() {
      if (!container.current) return
      try {
        const svg = await renderMermaidSvg(source, `${renderId}-${Date.now()}`)
        if (cancelled || !container.current) return
        const svgElement = createSafeSvgElement(svg)
        const viewBox = svgElement.getAttribute('viewBox')?.trim().split(/\s+/).map(Number)
        const width = viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : Number.parseFloat(svgElement.getAttribute('width') || '800')
        const height = viewBox?.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : Number.parseFloat(svgElement.getAttribute('height') || '500')
        svgElement.removeAttribute('width')
        svgElement.removeAttribute('height')
        svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        container.current.replaceChildren(svgElement)
        setSvgSize({ width: Math.max(1, width), height: Math.max(1, height) })
        setError(null)
        window.requestAnimationFrame(() => {
          const surface = viewport.current
          if (!surface) return
          const nextZoom = Math.min(
            Math.max(80, surface.clientWidth - 96) / Math.max(1, width),
            Math.max(80, surface.clientHeight - 96) / Math.max(1, height),
            1.35,
          )
          const clamped = clampZoom(nextZoom)
          setZoom(clamped)
          setOffset({
            x: (surface.clientWidth - Math.max(1, width) * clamped) / 2,
            y: (surface.clientHeight - Math.max(1, height) * clamped) / 2,
          })
        })
      } catch (cause) {
        if (cancelled || !container.current) return
        container.current.replaceChildren()
        setError(cleanMermaidError(errorMessage(cause)))
      }
    }
  }, [source, renderId, themeRevision])

  return (
    <div
      ref={viewport}
      className={`preview-surface${dragging ? ' is-dragging' : ''}`}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('.canvas-controls')) return
        dragState.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const drag = dragState.current
        if (!drag || drag.pointerId !== event.pointerId) return
        setOffset({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y })
      }}
      onPointerUp={(event) => {
        if (dragState.current?.pointerId === event.pointerId) dragState.current = null
        setDragging(false)
      }}
      onPointerCancel={() => { dragState.current = null; setDragging(false) }}
      onWheel={(event) => {
        event.preventDefault()
        if (event.metaKey || event.ctrlKey) {
          zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1)
          return
        }
        setOffset((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))
      }}
    >
      <div className="canvas-controls" aria-label="画布控制">
        <button type="button" title="缩小" aria-label="缩小" onClick={() => zoomBy(1 / 1.16)}>−</button>
        <button type="button" className="zoom-value" title="恢复 100%" onClick={() => centerAt(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" title="放大" aria-label="放大" onClick={() => zoomBy(1.16)}>＋</button>
        <span className="canvas-control-separator" />
        <button type="button" title="适配画布" onClick={fit}>适配</button>
      </div>
      {error ? <div className="syntax-error"><strong>预览渲染失败</strong><span>{error}</span></div> : null}
      <div
        className="mermaid-stage"
        style={{
          width: `${svgSize.width}px`,
          height: `${svgSize.height}px`,
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
        }}
      >
        <div ref={container} className="mermaid-canvas" />
      </div>
    </div>
  )
}

async function renderMermaidSvg(source: string, renderId: string): Promise<string> {
  const styles = getComputedStyle(document.documentElement)
  const type = detectDiagramType(source)
  const visualConfig = mermaidVisualConfig(type, {
    background: resolveCssColor('--app-bg', '#ffffff'),
    surface: resolveCssColor('--surface-panel', '#fafafa'),
    raised: resolveCssColor('--surface-raised', '#f5f5f5'),
    muted: resolveCssColor('--surface-muted', '#eeeeee'),
    text: resolveCssColor('--text-primary', '#171717'),
    secondaryText: resolveCssColor('--text-secondary', '#666666'),
    border: resolveCssColor('--border', '#d4d4d4'),
    strongBorder: resolveCssColor('--border-strong', '#b8b8b8'),
    accent: resolveCssColor('--accent', '#2563eb'),
    success: resolveCssColor('--editor-string', '#16803a'),
    warning: resolveCssColor('--editor-type', '#b45309'),
    danger: resolveCssColor('--danger', '#c9362b'),
  }, source)
  mermaid.initialize({
    ...visualConfig,
    fontFamily: styles.getPropertyValue('--font-sans').trim() || 'ui-sans-serif, system-ui',
  })
  const result = await mermaid.render(renderId, source || 'flowchart LR\n  A[空图表]')
  return serializeSafeSvg(result.svg)
}

function createSafeSvgElement(markup: string): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  const svg = template.content.querySelector('svg')
  if (!(svg instanceof SVGSVGElement)) throw new Error('Mermaid 没有返回可渲染的 SVG。')
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (Array.from(clone.querySelectorAll('*')).some((element) => element.hasAttribute('xlink:href'))) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }
  clone.querySelectorAll('script, iframe, object, embed').forEach((node) => node.remove())
  const elements = [clone, ...Array.from(clone.querySelectorAll('*'))]
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && value.startsWith('javascript:'))) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return clone
}

function serializeSafeSvg(markup: string): string {
  return new XMLSerializer().serializeToString(createSafeSvgElement(markup))
}

function renderCanvasSvg(source: string): string {
  const scene = parseCanvasScene(source)
  return canvasSceneToSvg(scene, {
    background: resolveCssColor('--app-bg', '#ffffff'),
    panel: resolveCssColor('--surface-raised', '#f5f5f5'),
    text: resolveCssColor('--text-primary', '#171717'),
    border: resolveCssColor('--border-strong', '#8a8a8a'),
    note: '#fff4b8',
  })
}

async function svgToPngBase64(svg: string, background: string): Promise<string> {
  const root = createSafeSvgElement(svg)
  const normalizedSvg = new XMLSerializer().serializeToString(root)
  const viewBox = root.getAttribute('viewBox')?.trim().split(/\s+/).map(Number)
  const sourceWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2])
    ? Math.max(1, viewBox[2])
    : Math.max(1, Number.parseFloat(root.getAttribute('width') || '1200'))
  const sourceHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3])
    ? Math.max(1, viewBox[3])
    : Math.max(1, Number.parseFloat(root.getAttribute('height') || '800'))
  const scale = Math.min(2, 8192 / sourceWidth, 8192 / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  // MCP Apps run under a restrictive CSP. A blob: URL can be rejected by the
  // host even though the SVG was produced locally, while an inline data URL
  // remains self-contained and needs no resource-domain permission.
  const imageUrl = `data:image/svg+xml;base64,${utf8ToBase64(normalizedSvg)}`
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('浏览器无法载入 Mermaid SVG。'))
    image.src = imageUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持 PNG 画布导出。')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 编码失败。')), 'image/png')
  })
  return blobToBase64(png)
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function resolveCssColor(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback
  const probe = document.createElement('span')
  probe.style.position = 'fixed'
  probe.style.pointerEvents = 'none'
  probe.style.visibility = 'hidden'
  probe.style.color = value
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return normalizeMermaidColor(resolved, fallback)
}

function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.2, value))
}

class RuntimeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-shell"><strong>Diagram 渲染失败</strong><pre>{this.state.error.stack ?? this.state.error.message}</pre></main>
  }
}

async function callTool<T>(name: string, arguments_: Record<string, unknown>): Promise<T> {
  const result = await mcpApp.callServerTool({ name, arguments: arguments_ }) as ServerToolResult
  const serverError = extractToolResultError(result)
  if (serverError) throw new Error(serverError)
  const payload = extractToolResultPayload<T>(result)
  if (payload === undefined) throw new Error(`${name} 没有返回可解析结果。`)
  return payload
}

async function sendCodexMessage(text: string): Promise<void> {
  if (!openai.message) throw new Error('当前 Codex Host 没有提供对话消息能力。')
  await openai.message.send({
    role: 'user',
    content: [{ type: 'text', text }],
    _meta: { 'openai/message': { target: 'active', send: true } },
  })
}

function diagramLabel(type: DiagramSummary['type']): string {
  return diagramTypes.find((item) => item.type === type)?.label ?? '图表'
}

function playbackActivityLabel(kind: NonNullable<DiagramThreadStateResult['activity']>['kind']): string {
  if (kind === 'create') return 'Codex 正在创建画板'
  if (kind === 'source-sync') return 'Codex 正在同步源码节点'
  if (kind === 'proposal') return 'Codex 正在应用候选修改'
  if (kind === 'history-undo') return '正在撤销 AI 修改'
  if (kind === 'history-redo') return '正在重做 AI 修改'
  return 'Codex 正在更新画板'
}

function formatPatchHistoryTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}

function shortPath(value: string): string {
  const parts = value.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : value
}

function safeFilename(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'diagram'
}

function resolveWorkspaceFilePath(root: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.')
  if (normalized.some((part) => part === '..')) throw new Error('图表路径超出当前工作空间。')
  const windowsRoot = /^[A-Za-z]:[\\/]/.test(root) || root.includes('\\')
  const separator = windowsRoot ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${normalized.join(separator)}`
}

function cleanMermaidError(value: string): string {
  return value.replace(/^Error:\s*/i, '').split('\n').slice(0, 3).join(' ').trim()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function renderBootStatus(message: string) {
  const root = document.getElementById('root')
  if (root) root.innerHTML = `<main class="boot-shell">${escapeHtml(message)}</main>`
}

function renderFatalError(error: unknown) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `<main class="fatal-shell"><strong>Diagram 启动失败</strong><pre>${escapeHtml(errorMessage(error))}</pre></main>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}
