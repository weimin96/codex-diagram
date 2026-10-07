import React, { useEffect, useState } from 'react'
import { diagramTypes, type DiagramDocument, type DiagramType } from './types.js'
import type { DiagramGenerationRequest } from './aiPrompts.js'

interface AiPanelProps {
  selected: DiagramDocument | null
  sending: boolean
  onClose: () => void
  onGenerate: (request: DiagramGenerationRequest) => Promise<void>
  onModify: (instruction: string) => Promise<void>
}

const quickModifications = [
  '补全失败、超时、重试和回滚路径，但不要重复正常流程。',
  '简化这张图，合并没有信息增益的中间节点，保留关键边界和决策。',
  '优化图的阅读顺序和分组，让主路径更清晰，但不要改变业务语义。',
]

export function AiPanel({ selected, sending, onClose, onGenerate, onModify }: AiPanelProps) {
  const [type, setType] = useState<DiagramType>('flowchart')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [generationInstructions, setGenerationInstructions] = useState('')
  const [modification, setModification] = useState('')

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
        <div className="ai-section-title">从代码生成</div>
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
            <input value={scope} onChange={(event) => setScope(event.target.value)} placeholder="src/auth, LoginService.java（可选）" />
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
