import React, { useEffect, useState } from 'react'
import { diagramTypeGroups, type DiagramDocument, type DiagramType } from './types.js'
import type { DiagramGenerationRequest } from './aiPrompts.js'
import type { CanvasWorkbenchMode } from './canvas.js'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

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

const generationTemplates: Array<{ label: string; type: DiagramType; canvasWorkbench?: CanvasWorkbenchMode; title: string; instructions: string }> = [
  { label: '系统架构', type: 'canvas', canvasWorkbench: 'architecture', title: '系统架构', instructions: '按专业工程架构图表达，不要退化成流程图。识别 Web/客户端、API/网关、核心服务、Worker、数据库、缓存、消息/检索/文件存储和外部系统；默认使用紧贴内容的命名 boundary、技术 stencil 与正交依赖连线，不主动添加 C4 Software System / Container 元数据。只有用户明确要求 C4，或源码/已有图明确存在 C4 层级时才使用 C4。' },
  { label: '业务流程', type: 'flowchart', title: '核心业务流程', instructions: '从真实入口、关键决策、成功路径和异常/补偿路径还原流程；决策节点只表达一个条件，主路径保持连续阅读方向。' },
  { label: '调用链', type: 'sequence', title: '核心调用链', instructions: '沿真实调用顺序展示入口、服务、存储和外部依赖，并保留关键失败分支。' },
  { label: '数据模型', type: 'er', title: '数据模型', instructions: '从实体、表结构或模型定义提取核心实体、主外键和主要关系，不展开无关字段。' },
  { label: '状态流转', type: 'state', title: '状态流转', instructions: '从枚举、状态字段和业务分支还原合法状态、触发条件以及失败或终止状态。' },
  { label: '功能脑图', type: 'mindmap', title: '功能与能力地图', instructions: '围绕一个中心主题按互斥维度拆成 3~7 个一级分支，同层保持相同抽象粒度，不按目录结构机械展开。' },
  { label: '类关系', type: 'class', title: '核心类关系', instructions: '只保留有设计意义的类、接口、继承/实现/组合关系和关键公开成员，不展开 getter/setter、DTO 与无关工具类。' },
  { label: '项目计划', type: 'gantt', title: '项目计划', instructions: '按真实阶段、依赖和里程碑组织计划；没有真实日期时不要编造日历日期，优先使用已知计划信息。' },
  { label: '需求追踪', type: 'requirement', title: '需求追踪', instructions: '从需求、测试和实现中提取稳定需求项、实现元素及 satisfies/verifies/traces 等真实追踪关系，不编造风险与验证方法。' },
  { label: '指标趋势', type: 'xychart', title: '指标趋势', instructions: '只使用代码、评测、日志或上下文中存在的真实数值；趋势优先 line，离散比较优先 bar，不混用不同量纲。' },
  { label: '流量去向', type: 'sankey', title: '流量去向', instructions: '只使用可加总且同量纲的真实流量、资金、容量或转化数据；保持主流向清晰，不为凑比例编造数值。' },
  { label: '根因分析', type: 'ishikawa', title: '根因分析', instructions: '围绕一个明确问题，从日志、缺陷、复盘或上下文事实提炼原因类别和可验证具体原因；区分候选原因与已证实根因。' },
  { label: '架构画布', type: 'canvas', canvasWorkbench: 'architecture', title: '架构画布', instructions: '用自由画布组织核心模块、外部系统、数据存储和关键说明，保持留白和清晰的空间分组。' },
  { label: 'C4 Context', type: 'canvas', canvasWorkbench: 'architecture', title: 'C4 系统上下文', instructions: '按 C4 Context 层级只展示 Person、当前 Software System 和关键外部 Software System。使用 c4Type 明确语义；当前系统用 software-system boundary，外部系统保持独立节点，连线写明关系，不展开内部容器。' },
  { label: 'C4 Container', type: 'canvas', canvasWorkbench: 'architecture', title: 'C4 容器架构', instructions: '按 C4 Container 层级识别 Web/客户端、API/网关、应用服务、数据库、缓存、消息队列和关键外部系统。使用 software-system 父边界 + container 子边界或 container 节点，保留 parentId 层级，节点绑定最相关源码路径，主要关系使用正交连线。' },
  { label: 'C4 Component', type: 'canvas', canvasWorkbench: 'architecture', title: 'C4 组件架构', instructions: '聚焦一个 Container，按 C4 Component 层级提炼内部主要组件、职责与依赖。节点使用 c4Type=component，外层边界使用 c4Type=container；只画有架构意义的组件，不展开每个类和方法。' },
  { label: '服务拓扑', type: 'canvas', canvasWorkbench: 'architecture', title: '服务拓扑', instructions: '从部署配置、服务注册、HTTP/RPC/MQ 调用关系提取真实服务拓扑。使用 service/api/database/cache/queue/cloud/external 节点角色，按边界分组，并区分同步调用和异步消息。' },
  { label: '事件/数据流', type: 'canvas', canvasWorkbench: 'architecture', title: '事件与数据流', instructions: '展示事件产生者、Topic/Queue、消费者、数据存储和下游系统，优先从 Kafka/MQ/任务代码和配置还原真实流向；用 queue/database/service 角色和正交连线。' },
]

export function AiPanel({ selected, sending, generationPreset, onSearchSources, onClose, onGenerate, onModify }: AiPanelProps) {
  const [type, setType] = useState<DiagramType>('canvas')
  const [canvasWorkbench, setCanvasWorkbench] = useState<CanvasWorkbenchMode>('architecture')
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
    <aside className="ai-panel" aria-label="AI 图表操作">
      <div className="ai-panel-head">
        <div>
          <div className="eyebrow">CODEX</div>
          <strong>图表操作</strong>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <section className="ai-panel-section">
        <div className="ai-section-title-row">
          <div className="ai-section-title">从代码生成</div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              setScope('.')
              if (!generationInstructions.trim()) setGenerationInstructions('先识别核心模块和边界，再画主要依赖或调用关系；不要把所有文件都展开。')
            }}
          >分析整个工作区</Button>
        </div>
        <div className="generation-templates" aria-label="生成预设">
          {generationTemplates.map((template) => (
            <Button
              key={template.label}
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setType(template.type)
                if (template.canvasWorkbench) setCanvasWorkbench(template.canvasWorkbench)
                setTitle(template.title)
                setGenerationInstructions(template.instructions)
              }}
            >{template.label}</Button>
          ))}
        </div>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel>类型</FieldLabel>
            <Select value={type} onValueChange={(value) => setType(value as DiagramType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择图表类型" />
              </SelectTrigger>
              <SelectContent>
                {diagramTypeGroups.map((group) => (
                  <SelectGroup key={group.category}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.items.map((item) => <SelectItem key={item.type} value={item.type}>{item.label}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {type === 'canvas' ? (
            <Field>
              <FieldLabel>工作台</FieldLabel>
              <Select value={canvasWorkbench} onValueChange={(value) => setCanvasWorkbench(value as CanvasWorkbenchMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择工作台" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="architecture">系统架构</SelectItem>
                    <SelectItem value="flowchart">流程画布</SelectItem>
                    <SelectItem value="freeform">自由画布</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="ai-diagram-title">标题</FieldLabel>
            <Input id="ai-diagram-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：登录调用链" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-diagram-scope">文件或目录</FieldLabel>
            <div className="source-picker">
              <Input
                id="ai-diagram-scope"
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
                    <Button key={file} variant="ghost" size="sm" type="button" role="option" className="w-full justify-start font-mono text-xs" onMouseDown={(event) => event.preventDefault()} onClick={() => { setScope(file); setScopeFocused(false) }}>
                      {file}
                    </Button>
                  )) : null}
                </div>
              ) : null}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-diagram-instructions">要求</FieldLabel>
            <Textarea id="ai-diagram-instructions" value={generationInstructions} onChange={(event) => setGenerationInstructions(event.target.value)} placeholder="例如：重点展示鉴权失败与 token 刷新" />
          </Field>
        </FieldGroup>
        <Button
          className="mt-3 w-full"
          type="button"
          disabled={sending || !title.trim()}
          onClick={() => void onGenerate({ type, ...(type === 'canvas' ? { canvasWorkbench } : {}), title, scope, instructions: generationInstructions })}
        >
          {sending ? '发送中…' : '交给 AI'}
        </Button>
      </section>

      {selected ? (
        <section className="ai-panel-section">
          <div className="ai-section-title">修改当前图</div>
          <div className="ai-current-diagram">{selected.path}</div>
          <div className="ai-quick-actions">
            {quickModifications.map((instruction, index) => (
              <Button key={instruction} variant="outline" size="sm" type="button" disabled={sending} onClick={() => void onModify(instruction)}>
                {index === 0 ? '补异常路径' : index === 1 ? '简化结构' : '整理布局'}
              </Button>
            ))}
          </div>
          <Textarea value={modification} onChange={(event) => setModification(event.target.value)} placeholder="描述需要怎么改" />
          <Button
            className="mt-3 w-full"
            type="button"
            disabled={sending || !modification.trim()}
            onClick={() => void onModify(modification)}
          >
            {sending ? '发送中…' : '修改当前图'}
          </Button>
        </section>
      ) : null}
    </aside>
  )
}
