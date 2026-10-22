import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { parseCanvasScene } from './canvas.js'
import type { DiagramDocument } from './types.js'
import type { DiagramProposalSummary, DiagramPatchHistoryEntry, DiagramGitImpactResult } from './reviewTypes.js'

export function PatchHistoryPanel({ path, entries, loading, undoingId, redoingId, onClose, onRefresh, onUndo, onUndoChain, onRedo, onRedoChain, onFocus }: {
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
    <aside className="change-review-panel patch-history-panel" aria-label="修改记录">
      <div className="change-review-head">
        <div>
          <strong>修改记录</strong>
          <span>{entries.length} 次修改</span>
        </div>
        <div className="patch-history-head-actions">
          <button type="button" disabled={loading} onClick={onRefresh}>{loading ? '刷新中…' : '刷新'}</button>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="change-review-path">{path}</div>
      {entries.length ? (
        <div className="patch-history-graph-summary">
          <strong>依赖关系</strong>
          <span>{graphStats.roots} 个起点</span>
          <span>{graphStats.edges} 条依赖</span>
          <span>{graphStats.active} 项生效</span>
        </div>
      ) : null}
      <div className="patch-history-body">
        {loading && entries.length === 0 ? <div className="patch-history-empty">正在读取修改记录…</div> : null}
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
                <strong>{entry.reason?.trim() || '增量修改'}</strong>
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
                <span>修改依赖</span>
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

export function GitImpactPanel({ report, onClose, onFocus, onExplain, onReanalyze, explaining }: {
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
          <strong>代码改动影响</strong>
          <span>{report.git.files.length} 个文件</span>
        </div>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      <div className="change-review-path">{report.path}</div>
      <div className="impact-review-body">
        <section className="impact-base-ref">
          <div className="impact-section-head"><strong>比较基线</strong><span>{report.git.baseRef ? `${report.git.baseRef}...HEAD` : '工作区修改'}</span></div>
          <div>
            <input value={baseRef} onChange={(event) => setBaseRef(event.target.value)} placeholder="例如 origin/main" aria-label="Git 比较基线" />
            <button type="button" onClick={() => onReanalyze(baseRef.trim() || undefined)}>重新分析</button>
          </div>
        </section>
        <section>
          <div className="impact-section-head"><strong>影响层级</strong><span>{report.trace.nodeIds.length} 个节点</span></div>
          {report.buckets.map((bucket) => (
            <button key={bucket.distance} type="button" className="impact-bucket" onClick={() => onFocus(bucket.elementIds)}>
              <span>{bucket.distance === 0 ? '直接修改' : `${bucket.distance} 跳影响`}</span>
              <strong>{bucket.elementIds.length}</strong>
            </button>
          ))}
          {!report.buckets.length ? <p className="impact-empty">当前图没有节点绑定这些改动文件。</p> : null}
        </section>
        <section>
          <div className="impact-section-head"><strong>改动文件</strong><span>{report.matchedFiles.length}/{report.git.files.length} 已关联</span></div>
          {report.matchedFiles.map((file) => (
            <button key={file.path} type="button" className="impact-file-row" title={file.path} onClick={() => onFocus(file.elementIds)}>
              <code>{file.path}</code>
              <span>{file.elementIds.length} 个节点</span>
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
        <button type="button" disabled={explaining} onClick={onExplain}>{explaining ? '发送中…' : '交给 AI 分析'}</button>
        <button type="button" onClick={() => onFocus(report.directElementIds)}>定位直接修改</button>
        <button className="primary-button" type="button" onClick={() => onFocus(report.trace.nodeIds)}>查看完整影响</button>
      </div>
    </aside>
  )
}

export function ChangeReviewPanel({ before, after, restoring, onClose, onRestore }: {
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

export function ProposalReviewPanel({ before, after, reason, scopeElementIds, newElementIds, impactElementIds, automaticElementIds, rebaseable, patchSummary, branches, activeBranchId, applying, onClose, onAccept, onReject, onSelectBranch, onComposeBranches }: {
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
    <aside className="change-review-panel proposal-review-panel" aria-label="AI 候选修改">
      <div className="change-review-head">
        <div>
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
          <strong>修改范围</strong>
          <span>
            {scopeElementIds.length} 个选中
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
          {rebaseable ? <span>可合并本地修改</span> : null}
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
  if (field === 'from' || field === 'to' || field === 'start' || field === 'end') return '端点'
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
  if (field === 'tone' || field === 'shape' || field === 'shapeRef' || field === 'emphasis' || field === 'lineStyle' || field === 'fillColor' || field === 'strokeColor' || field === 'strokeWidth' || field === 'opacity' || field === 'cornerRadius' || field === 'rotation' || field === 'markerEnd' || field === 'textOnly' || field === 'fontSize' || field === 'fontWeight' || field === 'textColor') return '外观'
  if (field === 'freehand') return '手绘路径'
  if (field === 'sourcePaths') return '源码'
  if (field === 'tags') return '标签'
  if (field === 'locked') return '锁定'
  return field
}

function canvasElementReviewLabel(element: ReturnType<typeof parseCanvasScene>['elements'][number]): string {
  if (element.type === 'arrow') return element.start && element.end
    ? `${element.id}: ${element.freehand ? '手绘' : `自由${element.markerEnd === 'none' ? '线' : '箭头'}`}${element.label ? ` · ${element.label}` : ''}`
    : `${element.id}: ${element.from} → ${element.to}${element.label ? ` · ${element.label}` : ''}`
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

function formatPatchHistoryTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}

