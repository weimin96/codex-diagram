import React, { useEffect, useState } from 'react'
import { diagramTypes, type DiagramDocument, type DiagramType } from './types.js'
import type { DiagramGenerationRequest } from './aiPrompts.js'

interface AiPanelProps {
  selected: DiagramDocument | null
  sending: boolean
  generationPreset?: { key: number; scope?: string; title?: string; instructions?: string }
  onSearchSources: (query: string) => Promise<string[]>
  onClose: () => void
  onGenerate: (request: DiagramGenerationRequest) => Promise<void>
  onModify: (instruction: string) => Promise<void>
}

const quickModifications = [
  '补全失败、超时、重试和回滚路径，但不要重复正常流程。',
  '简化这张图，合并没有信息增益的中间节点，保留关键边界和决策。',
  '优化图的阅读顺序和分组，让主路径更清晰，但不要改变业务语义。',
]

const generationTemplates: Array<{ label: string; type: DiagramType; title: string; instructions: string }> = [
  { label: '架构依赖', type: 'flowchart', title: '项目架构', instructions: '识别模块边界、核心依赖与外部系统，只展示主要方向和关键接口。' },
  { label: '调用链', type: 'sequence', title: '核心调用链', instructions: '沿真实调用顺序展示入口、服务、存储和外部依赖，并保留关键失败分支。' },
  { label: '数据模型', type: 'er', title: '数据模型', instructions: '从实体、表结构或模型定义提取核心实体、主外键和主要关系，不展开无关字段。' },
  { label: '状态流转', type: 'state', title: '状态流转', instructions: '从枚举、状态字段和业务分支还原合法状态、触发条件以及失败或终止状态。' },
]

export function AiPanel({ selected, sending, generationPreset, onSearchSources, onClose, onGenerate, onModify }: AiPanelProps) {
  const [type, setType] = useState<DiagramType>('flowchart')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [generationInstructions, setGenerationInstructions] = useState('')
  const [modification, setModification] = useState('')
  const [scopeFocused, setScopeFocused] = useState(false)
  const [sourceOptions, setSourceOptions] = useState<string[]>([])
  const [sourceLoading, setSourceLoading] = useState(false)

  useEffect(() => {
    if (!generationPreset) return
    if (generationPreset.scope !== undefined) setScope(generationPreset.scope)
    if (generationPreset.title !== undefined) setTitle(generationPreset.title)
    if (generationPreset.instructions !== undefined) setGenerationInstructions(generationPreset.instructions)
  }, [generationPreset?.key])

  useEffect(() => {
    if (!scopeFocused || scope.trim() === '.') {
      setSourceOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      setSourceLoading(true)
      void onSearchSources(scope)
        .then((files) => {
          if (!cancelled) setSourceOptions(files)
        })
        .finally(() => {
          if (!cancelled) setSourceLoading(false)
        })
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [onSearchSources, scope, scopeFocused])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <aside className="ai-panel" aria-label="Codex 图表操作">
      <div className="ai-panel-head">
        <div>
          <div className="eyebrow">CODEX</div>
          <strong>图表操作</strong>
        </div>
        <button type="button" onClick={onClose}>关闭</button>
      </div>

      <section className="ai-panel-section">
        <div className="ai-section-title-row">
          <div className="ai-section-title">从代码生成</div>
          <button
            className="ai-scope-shortcut"
            type="button"
            onClick={() => {
              setScope('.')
              if (!generationInstructions.trim()) setGenerationInstructions('先识别核心模块和边界，再画主要依赖或调用关系；不要把所有文件都展开。')
            }}
          >分析整个工作区</button>
        </div>
        <div className="generation-templates" aria-label="生成预设">
          {generationTemplates.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => {
                setType(template.type)
                setTitle(template.title)
                setGenerationInstructions(template.instructions)
              }}
            >{template.label}</button>
          ))}
        </div>
        <div className="ai-form-grid">
          <label>
            <span>类型</span>
            <select value={type} onChange={(event) => setType(event.target.value as DiagramType)}>
              {diagramTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span>标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：登录调用链" />
          </label>
          <label>
            <span>文件或目录</span>
            <div className="source-picker">
              <input
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                onFocus={() => setScopeFocused(true)}
                onBlur={() => window.setTimeout(() => setScopeFocused(false), 120)}
                placeholder="搜索或输入源码路径（可选）"
                aria-label="文件或目录"
                autoComplete="off"
              />
              {scopeFocused && (sourceLoading || sourceOptions.length > 0) ? (
                <div className="source-picker-popover" role="listbox" aria-label="源码文件">
                  {sourceLoading ? <div className="source-picker-status">正在扫描工作区…</div> : null}
                  {!sourceLoading ? sourceOptions.map((file) => (
                    <button key={file} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { setScope(file); setScopeFocused(false) }}>
                      {file}
                    </button>
                  )) : null}
                </div>
              ) : null}
            </div>
          </label>
          <label>
            <span>要求</span>
            <textarea value={generationInstructions} onChange={(event) => setGenerationInstructions(event.target.value)} placeholder="例如：重点展示鉴权失败与 token 刷新" />
          </label>
        </div>
        <button
          className="primary-button ai-submit"
          type="button"
          disabled={sending || !title.trim()}
          onClick={() => void onGenerate({ type, title, scope, instructions: generationInstructions })}
        >
          {sending ? '发送中…' : '交给 Codex'}
        </button>
      </section>

      {selected ? (
        <section className="ai-panel-section">
          <div className="ai-section-title">修改当前图</div>
          <div className="ai-current-diagram">{selected.path}</div>
          <div className="ai-quick-actions">
            {quickModifications.map((instruction, index) => (
              <button key={instruction} type="button" disabled={sending} onClick={() => void onModify(instruction)}>
                {index === 0 ? '补异常路径' : index === 1 ? '简化结构' : '整理布局'}
              </button>
            ))}
          </div>
          <textarea className="ai-modify-input" value={modification} onChange={(event) => setModification(event.target.value)} placeholder="描述需要怎么改" />
          <button
            className="primary-button ai-submit"
            type="button"
            disabled={sending || !modification.trim()}
            onClick={() => void onModify(modification)}
          >
            {sending ? '发送中…' : '修改当前图'}
          </button>
        </section>
      ) : null}
    </aside>
  )
}
