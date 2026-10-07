import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCanvasScene, serializeCanvasScene, type CanvasArrow, type CanvasElement, type CanvasNode, type CanvasNote, type CanvasScene } from './canvas.js'

type CanvasTool = 'select' | 'node' | 'note' | 'connect'

interface CanvasEditorProps {
  source: string
  onChange: (source: string) => void
}

export function CanvasEditor({ source, onChange }: CanvasEditorProps) {
  const parsed = useMemo(() => {
    try {
      return { scene: parseCanvasScene(source), error: null as string | null }
    } catch (error) {
      return { scene: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [source])
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ pointerId: number; id: string; startX: number; startY: number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (selectedId && parsed.scene && !parsed.scene.elements.some((item) => item.id === selectedId)) setSelectedId(null)
  }, [parsed.scene, selectedId])

  if (!parsed.scene) {
    return <div className="canvas-invalid"><strong>自由画布无法渲染</strong><span>{parsed.error}</span><p>可以切到“源码”修复 JSON。</p></div>
  }

  const scene = parsed.scene
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const selected = scene.elements.find((item) => item.id === selectedId)

  function commit(next: CanvasScene) {
    onChange(serializeCanvasScene(next))
  }

  function updateElement(id: string, updater: (item: CanvasElement) => CanvasElement) {
    commit({ ...scene, elements: scene.elements.map((item) => item.id === id ? updater(item) : item) })
  }

  function addBox(kind: 'node' | 'note', x: number, y: number) {
    const id = nextId(kind, scene.elements)
    const element: CanvasNode | CanvasNote = {
      id,
      type: kind,
      x: clamp(x - 100, 0, scene.width - 200),
      y: clamp(y - 45, 0, scene.height - 90),
      width: 200,
      height: 90,
      text: kind === 'node' ? '新节点' : '备注',
    }
    commit({ ...scene, elements: [...scene.elements, element] })
    setSelectedId(id)
    setTool('select')
  }

  function deleteSelected() {
    if (!selectedId) return
    commit({
      ...scene,
      elements: scene.elements.filter((item) => (
        item.id !== selectedId
        && !(item.type === 'arrow' && (item.from === selectedId || item.to === selectedId))
      )),
    })
    setSelectedId(null)
    setConnectFrom(null)
  }

  function handleBoxClick(id: string) {
    if (tool !== 'connect') {
      setSelectedId(id)
      return
    }
    if (!connectFrom) {
      setConnectFrom(id)
      setSelectedId(id)
      return
    }
    if (connectFrom === id) {
      setConnectFrom(null)
      return
    }
    const exists = arrows.some((item) => item.from === connectFrom && item.to === id)
    if (!exists) {
      commit({ ...scene, elements: [...scene.elements, { id: nextId('arrow', scene.elements), type: 'arrow', from: connectFrom, to: id }] })
    }
    setConnectFrom(null)
    setSelectedId(id)
    setTool('select')
  }

  return (
    <div className="freeform-editor">
      <div className="freeform-toolbar" aria-label="自由画布工具">
        <ToolButton active={tool === 'select'} onClick={() => { setTool('select'); setConnectFrom(null) }}>选择</ToolButton>
        <ToolButton active={tool === 'node'} onClick={() => { setTool('node'); setConnectFrom(null) }}>节点</ToolButton>
        <ToolButton active={tool === 'note'} onClick={() => { setTool('note'); setConnectFrom(null) }}>备注</ToolButton>
        <ToolButton active={tool === 'connect'} onClick={() => { setTool('connect'); setConnectFrom(null) }}>连接</ToolButton>
        <span className="freeform-toolbar-separator" />
        {selected && selected.type !== 'arrow' ? (
          <input
            className="freeform-text-input"
            aria-label="选中元素文字"
            value={selected.text}
            onChange={(event) => updateElement(selected.id, (item) => item.type === 'arrow' ? item : { ...item, text: event.target.value })}
          />
        ) : <span className="freeform-hint">{tool === 'connect' ? (connectFrom ? '再选一个节点' : '先选起点') : '点击空白处添加元素'}</span>}
        <button type="button" className="freeform-delete" disabled={!selectedId} onClick={deleteSelected}>删除</button>
      </div>
      <div className="freeform-surface">
        <svg
          ref={svgRef}
          className={`freeform-svg tool-${tool}`}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          role="img"
          aria-label="自由画布"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (tool === 'select') setSelectedId(null)
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return
            const point = scenePoint(event.clientX, event.clientY, event.currentTarget, scene)
            setSelectedId(null)
            if (tool === 'node' || tool === 'note') addBox(tool, point.x, point.y)
          }}
        >
          <defs>
            <pattern id="canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0V32" className="freeform-grid-line" fill="none" />
            </pattern>
            <marker id="canvas-arrow" markerWidth="12" markerHeight="12" refX="9" refY="4" orient="auto">
              <path d="M0,0 L0,8 L10,4 z" className="freeform-arrow-head" />
            </marker>
          </defs>
          <rect width={scene.width} height={scene.height} className="freeform-background" pointerEvents="none" />
          <rect width={scene.width} height={scene.height} fill="url(#canvas-grid)" pointerEvents="none" />
          {arrows.map((arrow) => {
            const from = boxes.find((item) => item.id === arrow.from)
            const to = boxes.find((item) => item.id === arrow.to)
            if (!from || !to) return null
            const start = center(from)
            const end = center(to)
            return (
              <g key={arrow.id} className={`freeform-arrow${selectedId === arrow.id ? ' is-selected' : ''}`} onPointerDown={(event) => { event.stopPropagation(); setSelectedId(arrow.id) }}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd="url(#canvas-arrow)" />
              </g>
            )
          })}
          {boxes.map((item) => (
            <g
              key={item.id}
              className={`freeform-box freeform-${item.type}${selectedId === item.id ? ' is-selected' : ''}${connectFrom === item.id ? ' is-connect-source' : ''}`}
              transform={`translate(${item.x} ${item.y})`}
              onPointerDown={(event) => {
                event.stopPropagation()
                if (tool !== 'select') return
                setSelectedId(item.id)
                const point = scenePoint(event.clientX, event.clientY, svgRef.current!, scene)
                drag.current = { pointerId: event.pointerId, id: item.id, startX: point.x, startY: point.y, x: item.x, y: item.y }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onClick={(event) => {
                event.stopPropagation()
                handleBoxClick(item.id)
              }}
              onPointerMove={(event) => {
                const active = drag.current
                if (!active || active.pointerId !== event.pointerId || active.id !== item.id) return
                const point = scenePoint(event.clientX, event.clientY, svgRef.current!, scene)
                updateElement(item.id, (current) => current.type === 'arrow' ? current : {
                  ...current,
                  x: clamp(active.x + point.x - active.startX, 0, scene.width - current.width),
                  y: clamp(active.y + point.y - active.startY, 0, scene.height - current.height),
                })
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointerId === event.pointerId) drag.current = null
              }}
              onPointerCancel={() => { drag.current = null }}
            >
              <rect width={item.width} height={item.height} rx="14" />
              <text x={item.width / 2} y={item.height / 2} textAnchor="middle" dominantBaseline="middle">
                {truncate(item.text, 28)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function ToolButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>{children}</button>
}

function nextId(prefix: string, elements: CanvasElement[]): string {
  const used = new Set(elements.map((item) => item.id))
  for (let index = 1; index < 100_000; index += 1) {
    const id = `${prefix}-${index}`
    if (!used.has(id)) return id
  }
  return `${prefix}-${Date.now()}`
}

function center(item: CanvasNode | CanvasNote) {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function scenePoint(clientX: number, clientY: number, svg: SVGSVGElement, scene: CanvasScene) {
  const bounds = svg.getBoundingClientRect()
  return {
    x: ((clientX - bounds.left) / Math.max(1, bounds.width)) * scene.width,
    y: ((clientY - bounds.top) / Math.max(1, bounds.height)) * scene.height,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function truncate(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}
