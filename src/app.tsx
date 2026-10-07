import React, { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import mermaid from 'mermaid'
import {
  App as McpApp,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps'
import { OpenAIExtensions } from '@openai/mcp-extensions/app'
import { diagramTypes, type DiagramDocument, type DiagramSummary, type DiagramType, type WorkspaceSnapshot } from './types.js'

declare const __CODEX_DIAGRAM_VERSION__: string

interface ServerToolResult {
  structuredContent?: unknown
}

interface DiagramResult {
  kind: 'diagram'
  workspacePath: string
  diagram: DiagramDocument
}

interface DiagramListResult {
  kind: 'diagram-list'
  workspacePath: string
  diagrams: DiagramSummary[]
}

type ViewMode = 'preview' | 'source' | 'split'

const mcpApp = new McpApp({ name: 'codex-diagram-sidebar', version: __CODEX_DIAGRAM_VERSION__ })
const openai = new OpenAIExtensions(mcpApp)
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
    const result = await mcpApp.callServerTool({ name: 'diagram.workspace', arguments: {} }) as ServerToolResult
    const content = result.structuredContent as WorkspaceSnapshot | undefined
    if (content?.kind === 'workspace') initialWorkspace = content
  }

  createRoot(document.getElementById('root')!).render(
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
          setWorkspace(next)
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
  const [selected, setSelected] = useState<DiagramDocument | null>(null)
  const [source, setSource] = useState('')
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>('split')
  const [creating, setCreating] = useState(false)
  const dirty = Boolean(selected && source !== selected.source)

  useEffect(() => {
    if (!selected && snapshot.diagrams[0]) void selectDiagram(snapshot.diagrams[0].path)
    // Workspace changes intentionally reset selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath])

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

  async function selectDiagram(diagramPath: string) {
    if (dirty && !window.confirm('当前图表有未保存修改，确定切换并放弃吗？')) return
    setLoadingPath(diagramPath)
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.get', { workspacePath, path: diagramPath })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      updateModelContext(workspacePath, result.diagram)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoadingPath(null)
    }
  }

  async function saveDiagram() {
    if (!selected || !dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.update', { workspacePath, path: selected.path, source })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      onSnapshot({
        ...snapshot,
        diagrams: snapshot.diagrams.map((item) => item.path === result.diagram.path ? result.diagram : item),
      })
      updateModelContext(workspacePath, result.diagram)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
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

  async function createDiagram(type: DiagramType, title: string) {
    setError(null)
    try {
      const result = await callTool<DiagramResult>('diagram.create', { workspacePath, type, title })
      const next = [result.diagram, ...snapshot.diagrams.filter((item) => item.path !== result.diagram.path)]
      onSnapshot({ ...snapshot, diagrams: next })
      setSelected(result.diagram)
      setSource(result.diagram.source)
      setCreating(false)
      updateModelContext(workspacePath, result.diagram)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <main className="diagram-shell">
      <aside className="diagram-sidebar">
        <div className="sidebar-head">
          <div className="sidebar-title-row">
            <div>
              <div className="eyebrow">DIAGRAMS</div>
              <div className="sidebar-title">图表</div>
            </div>
            <button className="icon-text-button" type="button" onClick={() => setCreating((value) => !value)}>新建</button>
          </div>
          <button className="workspace-path" type="button" onClick={onSwitch} title={workspacePath}>{workspacePath}</button>
        </div>

        {creating ? <NewDiagramForm onCancel={() => setCreating(false)} onCreate={createDiagram} /> : null}

        <div className="sidebar-list-head">
          <span>{snapshot.diagrams.length} 个图表</span>
          <button type="button" onClick={() => void refreshList()}>刷新</button>
        </div>
        <nav className="diagram-list" aria-label="图表列表">
          {snapshot.diagrams.map((diagram) => (
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
          {snapshot.diagrams.length === 0 ? <div className="sidebar-empty">当前项目还没有 Mermaid 图表。</div> : null}
        </nav>
      </aside>

      <section className="diagram-main">
        {error ? <div className="error-banner">{error}<button type="button" onClick={() => setError(null)}>关闭</button></div> : null}
        {selected ? (
          <>
            <header className="editor-toolbar">
              <div className="document-identity">
                <strong>{selected.name}</strong>
                <span>{selected.path}</span>
              </div>
              <div className="toolbar-actions">
                <div className="mode-switch" aria-label="视图模式">
                  <ModeButton value="preview" mode={mode} onChange={setMode}>预览</ModeButton>
                  <ModeButton value="source" mode={mode} onChange={setMode}>源码</ModeButton>
                  <ModeButton value="split" mode={mode} onChange={setMode}>分屏</ModeButton>
                </div>
                <span className={`save-state${dirty ? ' is-dirty' : ''}`}>{saving ? '保存中…' : dirty ? '未保存' : '已保存'}</span>
                <button className="primary-button compact" type="button" disabled={!dirty || saving} onClick={() => void saveDiagram()}>保存</button>
              </div>
            </header>
            <div className={`editor-workspace mode-${mode}`}>
              {(mode === 'source' || mode === 'split') ? (
                <section className="source-pane">
                  <div className="pane-head"><span>Mermaid</span><span>{diagramLabel(selected.type)}</span></div>
                  <textarea
                    spellCheck={false}
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    aria-label="Mermaid 源码"
                  />
                </section>
              ) : null}
              {(mode === 'preview' || mode === 'split') ? (
                <section className="preview-pane">
                  <div className="pane-head"><span>预览</span><span>实时渲染</span></div>
                  <MermaidPreview source={source} />
                </section>
              ) : null}
            </div>
          </>
        ) : (
          <div className="main-empty">
            <div className="empty-graphic"><span /><span /><span /></div>
            <h2>选择或创建一个图表</h2>
            <p>流程图、时序图、思维脑图、类图、ER 图和状态图统一使用 Mermaid 源码。</p>
            <button className="primary-button" type="button" onClick={() => setCreating(true)}>新建图表</button>
          </div>
        )}
      </section>
    </main>
  )
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
        {diagramTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
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
  const [error, setError] = useState<string | null>(null)
  const [themeRevision, setThemeRevision] = useState(0)
  const renderId = useMemo(() => `diagram-${Math.random().toString(36).slice(2)}`, [])

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
      const styles = getComputedStyle(document.documentElement)
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: styles.getPropertyValue('--font-sans').trim() || 'ui-sans-serif, system-ui',
        themeVariables: {
          background: styles.getPropertyValue('--app-bg').trim() || '#ffffff',
          primaryColor: styles.getPropertyValue('--surface-raised').trim() || '#f5f5f5',
          primaryTextColor: styles.getPropertyValue('--text-primary').trim() || '#171717',
          primaryBorderColor: styles.getPropertyValue('--border-strong').trim() || '#b8b8b8',
          lineColor: styles.getPropertyValue('--text-secondary').trim() || '#666666',
          secondaryColor: styles.getPropertyValue('--surface-muted').trim() || '#eeeeee',
          tertiaryColor: styles.getPropertyValue('--surface-panel').trim() || '#fafafa',
        },
      })
      try {
        const result = await mermaid.render(`${renderId}-${Date.now()}`, source || 'flowchart LR\n  A[空图表]')
        if (cancelled || !container.current) return
        const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
        if (parsed.querySelector('parsererror')) throw new Error('Mermaid 返回了无效 SVG。')
        container.current.replaceChildren(document.importNode(parsed.documentElement, true))
        setError(null)
      } catch (cause) {
        if (cancelled || !container.current) return
        container.current.replaceChildren()
        setError(cleanMermaidError(errorMessage(cause)))
      }
    }
  }, [source, renderId, themeRevision])

  return (
    <div className="preview-surface">
      {error ? <div className="syntax-error"><strong>Mermaid 语法错误</strong><span>{error}</span></div> : null}
      <div ref={container} className="mermaid-canvas" />
    </div>
  )
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
  if (!result.structuredContent) throw new Error(`${name} 没有返回结构化结果。`)
  return result.structuredContent as T
}

function updateModelContext(workspacePath: string, diagram: DiagramDocument) {
  void openai.modelContext?.update({
    content: [{ type: 'text', text: `Selected Mermaid diagram ${diagram.path} (${diagram.type}).` }],
    structuredContent: {
      workspacePath,
      selectedDiagram: { path: diagram.path, type: diagram.type, source: diagram.source.slice(0, 24_000) },
    },
  })
}

function diagramLabel(type: DiagramSummary['type']): string {
  return diagramTypes.find((item) => item.type === type)?.label ?? 'Mermaid'
}

function shortPath(value: string): string {
  const parts = value.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : value
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
