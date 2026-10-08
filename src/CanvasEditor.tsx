import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCanvasScene, serializeCanvasScene, type CanvasArrow, type CanvasElement, type CanvasNode, type CanvasNote, type CanvasScene } from './canvas.js'
import { alignCanvasSelection, copyCanvasSelection, deleteCanvasSelection, nextCanvasElementId, pasteCanvasSelection } from './canvasOperations.js'

type CanvasTool = 'select' | 'hand' | 'node' | 'note' | 'connect'

export interface CanvasSelection {
  ids: string[]
  elements: CanvasElement[]
}

interface CanvasEditorProps {
  source: string
  onChange: (source: string) => void
  onSelectionChange?: (selection: CanvasSelection | null) => void
}

type Viewport = { x: number; y: number; zoom: number }
type SelectionRect = { x1: number; y1: number; x2: number; y2: number }
type DragState =
  | { kind: 'move'; pointerId: number; startX: number; startY: number; before: string; positions: Map<string, { x: number; y: number }> }
  | { kind: 'pan'; pointerId: number; clientX: number; clientY: number; start: Viewport }
  | { kind: 'marquee'; pointerId: number; startX: number; startY: number }
  | { kind: 'resize'; pointerId: number; id: string; startX: number; startY: number; width: number; height: number; before: string }

const GRID = 16
const MIN_ZOOM = 0.45
const MAX_ZOOM = 4

export function CanvasEditor({ source, onChange, onSelectionChange }: CanvasEditorProps) {
  const parsed = useMemo(() => {
    try {
      return { scene: parseCanvasScene(source), error: null as string | null }
    } catch (error) {
      return { scene: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [source])
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [spacePanning, setSpacePanning] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const drag = useRef<DragState | null>(null)
  const sourceRef = useRef(source)
  const sceneRef = useRef<CanvasScene | null>(parsed.scene)
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const clipboard = useRef<CanvasElement[]>([])

  useEffect(() => {
    sourceRef.current = source
    sceneRef.current = parsed.scene
  }, [parsed.scene, source])

  useEffect(() => {
    if (!parsed.scene) return
    const valid = selectedIds.filter((id) => parsed.scene!.elements.some((item) => item.id === id))
    if (valid.length !== selectedIds.length) setSelectedIds(valid)
  }, [parsed.scene, selectedIds])

  useEffect(() => {
    if (!parsed.scene || selectedIds.length === 0) {
      onSelectionChange?.(null)
      return
    }
    onSelectionChange?.({
      ids: selectedIds,
      elements: parsed.scene.elements.filter((item) => selectedIds.includes(item.id)),
    })
  }, [onSelectionChange, parsed.scene, selectedIds])

  useEffect(() => {
    const element = editorRef.current
    if (!element) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const mod = event.metaKey || event.ctrlKey
      if (event.code === 'Space') {
        event.preventDefault()
        setSpacePanning(true)
        return
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedIds(currentScene().elements.filter((item) => item.type !== 'arrow').map((item) => item.id))
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        copySelection()
        pasteSelection()
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelected()
        return
      }
      if (event.key === 'Escape') {
        setSelectedIds([])
        setConnectFrom(null)
        setTool('select')
        return
      }
      const key = event.key.toLowerCase()
      if (!mod && key === 'v') setTool('select')
      if (!mod && key === 'h') setTool('hand')
      if (!mod && key === 'n') setTool('node')
      if (!mod && key === 't') setTool('note')
      if (!mod && key === 'c') setTool('connect')
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePanning(false)
    }
    element.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      element.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  if (!parsed.scene) {
    return <div className="canvas-invalid"><strong>自由画布无法渲染</strong><span>{parsed.error}</span><p>可以切到“源码”修复 JSON。</p></div>
  }

  const scene = parsed.scene
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const selected = scene.elements.filter((item) => selectedIds.includes(item.id))
  const selectedSingle = selected.length === 1 ? selected[0] : null
  const selectedBox = selectedSingle && selectedSingle.type !== 'arrow' ? selectedSingle : null

  function currentScene(): CanvasScene {
    if (!sceneRef.current) throw new Error('Canvas scene unavailable')
    return sceneRef.current
  }

  function emitSource(nextSource: string, record = true) {
    if (nextSource === sourceRef.current) return
    if (record) {
      undoStack.current.push(sourceRef.current)
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
    }
    sourceRef.current = nextSource
    try { sceneRef.current = parseCanvasScene(nextSource) } catch { /* source editor owns invalid JSON */ }
    onChange(nextSource)
  }

  function commit(next: CanvasScene, record = true) {
    sceneRef.current = next
    emitSource(serializeCanvasScene(next), record)
  }

  function recordGesture(before: string) {
    if (before === sourceRef.current) return
    undoStack.current.push(before)
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
  }

  function undo() {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(sourceRef.current)
    emitSource(previous, false)
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(sourceRef.current)
    emitSource(next, false)
  }

  function updateElement(id: string, updater: (item: CanvasElement) => CanvasElement, record = true) {
    const live = currentScene()
    commit({ ...live, elements: live.elements.map((item) => item.id === id ? updater(item) : item) }, record)
  }

  function addBox(kind: 'node' | 'note', x: number, y: number) {
    const live = currentScene()
    const id = nextCanvasElementId(kind, live.elements)
    const element: CanvasNode | CanvasNote = {
      id,
      type: kind,
      x: clamp(snap(x - 100), 0, live.width - 200),
      y: clamp(snap(y - 45), 0, live.height - 90),
      width: 200,
      height: 90,
      text: kind === 'node' ? '新节点' : '备注',
    }
    commit({ ...live, elements: [...live.elements, element] })
    setSelectedIds([id])
    setTool('select')
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return
    const live = currentScene()
    commit(deleteCanvasSelection(live, selectedIds))
    setSelectedIds([])
    setConnectFrom(null)
  }

  function copySelection() {
    if (selectedIds.length === 0) return
    clipboard.current = copyCanvasSelection(currentScene(), selectedIds)
  }

  function pasteSelection() {
    if (clipboard.current.length === 0) return
    const pasted = pasteCanvasSelection(currentScene(), clipboard.current)
    if (pasted.selectedIds.length === 0) return
    commit(pasted.scene)
    setSelectedIds(pasted.selectedIds)
  }

  function alignSelection(axis: 'x' | 'y') {
    commit(alignCanvasSelection(currentScene(), selectedIds, axis, GRID))
  }

  function handleBoxClick(id: string, event: React.MouseEvent<SVGGElement>) {
    if (tool === 'connect') {
      if (!connectFrom) {
        setConnectFrom(id)
        setSelectedIds([id])
        return
      }
      if (connectFrom === id) {
        setConnectFrom(null)
        return
      }
      const live = currentScene()
      const exists = live.elements.some((item) => item.type === 'arrow' && item.from === connectFrom && item.to === id)
      if (!exists) commit({ ...live, elements: [...live.elements, { id: nextCanvasElementId('arrow', live.elements), type: 'arrow', from: connectFrom, to: id }] })
      setConnectFrom(null)
      setSelectedIds([id])
      setTool('select')
      return
    }
    if (tool !== 'select') return
  }

  function startMove(event: React.PointerEvent<SVGGElement>, item: CanvasNode | CanvasNote) {
    if (tool !== 'select' || spacePanning) return
    event.stopPropagation()
    editorRef.current?.focus({ preventScroll: true })
    const live = currentScene()
    let ids = selectedIds
    if (event.shiftKey && ids.includes(item.id)) {
      setSelectedIds(ids.filter((id) => id !== item.id))
      return
    }
    if (!ids.includes(item.id)) {
      ids = event.shiftKey ? [...ids, item.id] : [item.id]
      setSelectedIds(ids)
    }
    const point = scenePoint(event.clientX, event.clientY, svgRef.current!, live, viewport)
    const positions = new Map<string, { x: number; y: number }>()
    live.elements.forEach((candidate) => {
      if (candidate.type !== 'arrow' && ids.includes(candidate.id)) positions.set(candidate.id, { x: candidate.x, y: candidate.y })
    })
    drag.current = { kind: 'move', pointerId: event.pointerId, startX: point.x, startY: point.y, before: sourceRef.current, positions }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveSelection(event: React.PointerEvent<SVGGElement>, item: CanvasNode | CanvasNote) {
    const active = drag.current
    if (!active || active.kind !== 'move' || active.pointerId !== event.pointerId || !active.positions.has(item.id)) return
    const live = currentScene()
    const point = scenePoint(event.clientX, event.clientY, svgRef.current!, live, viewport)
    const dx = point.x - active.startX
    const dy = point.y - active.startY
    commit({
      ...live,
      elements: live.elements.map((candidate) => {
        if (candidate.type === 'arrow') return candidate
        const origin = active.positions.get(candidate.id)
        if (!origin) return candidate
        return {
          ...candidate,
          x: clamp(event.altKey ? origin.x + dx : snap(origin.x + dx), 0, live.width - candidate.width),
          y: clamp(event.altKey ? origin.y + dy : snap(origin.y + dy), 0, live.height - candidate.height),
        }
      }),
    }, false)
  }

  function finishGesture(event: React.PointerEvent) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === 'move' || active.kind === 'resize') recordGesture(active.before)
    if (active.kind === 'marquee' && selectionRect) {
      const rect = normalizeRect(selectionRect)
      const live = currentScene()
      setSelectedIds(live.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && intersects(rect, item)).map((item) => item.id))
      setSelectionRect(null)
    }
    drag.current = null
  }

  function beginBackgroundPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return
    editorRef.current?.focus({ preventScroll: true })
    const live = currentScene()
    const point = scenePoint(event.clientX, event.clientY, event.currentTarget, live, viewport)
    const shouldPan = tool === 'hand' || spacePanning || event.button === 1
    if (shouldPan) {
      drag.current = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start: viewport }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (tool === 'select') {
      if (!event.shiftKey) setSelectedIds([])
      drag.current = { kind: 'marquee', pointerId: event.pointerId, startX: point.x, startY: point.y }
      setSelectionRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function moveBackgroundPointer(event: React.PointerEvent<SVGSVGElement>) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const live = currentScene()
    if (active.kind === 'pan') {
      const bounds = event.currentTarget.getBoundingClientRect()
      const worldPerPixelX = (live.width / active.start.zoom) / Math.max(1, bounds.width)
      const worldPerPixelY = (live.height / active.start.zoom) / Math.max(1, bounds.height)
      setViewport({
        ...active.start,
        x: active.start.x - (event.clientX - active.clientX) * worldPerPixelX,
        y: active.start.y - (event.clientY - active.clientY) * worldPerPixelY,
      })
      return
    }
    if (active.kind === 'marquee') {
      const point = scenePoint(event.clientX, event.clientY, event.currentTarget, live, viewport)
      setSelectionRect({ x1: active.startX, y1: active.startY, x2: point.x, y2: point.y })
    }
  }

  function beginResize(event: React.PointerEvent<SVGRectElement>, item: CanvasNode | CanvasNote) {
    event.stopPropagation()
    const live = currentScene()
    const point = scenePoint(event.clientX, event.clientY, svgRef.current!, live, viewport)
    drag.current = { kind: 'resize', pointerId: event.pointerId, id: item.id, startX: point.x, startY: point.y, width: item.width, height: item.height, before: sourceRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveResize(event: React.PointerEvent<SVGRectElement>) {
    const active = drag.current
    if (!active || active.kind !== 'resize' || active.pointerId !== event.pointerId) return
    const live = currentScene()
    const point = scenePoint(event.clientX, event.clientY, svgRef.current!, live, viewport)
    updateElement(active.id, (item) => item.type === 'arrow' ? item : {
      ...item,
      width: Math.max(100, snap(active.width + point.x - active.startX)),
      height: Math.max(60, snap(active.height + point.y - active.startY)),
    }, false)
  }

  function zoomAt(nextZoom: number, clientX?: number, clientY?: number) {
    const live = currentScene()
    const svg = svgRef.current
    const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
    if (!svg || clientX === undefined || clientY === undefined) {
      setViewport((current) => ({ ...current, zoom: clamped }))
      return
    }
    const bounds = svg.getBoundingClientRect()
    const px = clamp((clientX - bounds.left) / Math.max(1, bounds.width), 0, 1)
    const py = clamp((clientY - bounds.top) / Math.max(1, bounds.height), 0, 1)
    const worldX = viewport.x + px * (live.width / viewport.zoom)
    const worldY = viewport.y + py * (live.height / viewport.zoom)
    setViewport({ x: worldX - px * (live.width / clamped), y: worldY - py * (live.height / clamped), zoom: clamped })
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      zoomAt(viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX, event.clientY)
      return
    }
    const live = currentScene()
    const bounds = event.currentTarget.getBoundingClientRect()
    setViewport((current) => ({
      ...current,
      x: current.x + event.deltaX * ((live.width / current.zoom) / Math.max(1, bounds.width)),
      y: current.y + event.deltaY * ((live.height / current.zoom) / Math.max(1, bounds.height)),
    }))
  }

  function fit() {
    setViewport({ x: 0, y: 0, zoom: 1 })
  }

  const viewWidth = scene.width / viewport.zoom
  const viewHeight = scene.height / viewport.zoom

  return (
    <div ref={editorRef} className="freeform-editor" tabIndex={0} aria-label="自由画布编辑器">
      <div className="freeform-surface">
        <div className="freeform-floating-toolbar" aria-label="自由画布工具">
          <ToolButton active={tool === 'select'} title="选择 (V)" onClick={() => { setTool('select'); setConnectFrom(null) }}>选择</ToolButton>
          <ToolButton active={tool === 'hand'} title="平移 (H / Space)" onClick={() => { setTool('hand'); setConnectFrom(null) }}>抓手</ToolButton>
          <span className="freeform-toolbar-separator" />
          <ToolButton active={tool === 'node'} title="节点 (N)" onClick={() => { setTool('node'); setConnectFrom(null) }}>节点</ToolButton>
          <ToolButton active={tool === 'note'} title="备注 (T)" onClick={() => { setTool('note'); setConnectFrom(null) }}>备注</ToolButton>
          <ToolButton active={tool === 'connect'} title="连接 (C)" onClick={() => { setTool('connect'); setConnectFrom(null) }}>连接</ToolButton>
          <span className="freeform-toolbar-separator" />
          <button type="button" title="撤销 ⌘Z" aria-label="撤销" disabled={undoStack.current.length === 0} onClick={undo}>↶</button>
          <button type="button" title="重做 ⇧⌘Z" aria-label="重做" disabled={redoStack.current.length === 0} onClick={redo}>↷</button>
        </div>

        {selected.length > 0 ? (
          <div className="freeform-inspector" aria-label="选中元素属性">
            <div className="freeform-inspector-head">
              <strong>{selected.length === 1 ? elementLabel(selected[0]) : `${selected.length} 个元素`}</strong>
              <button type="button" title="删除" aria-label="删除选中元素" onClick={deleteSelected}>删除</button>
            </div>
            {selectedSingle?.type === 'arrow' ? (
              <label>
                <span>连线文字</span>
                <input aria-label="连线文字" value={selectedSingle.label ?? ''} onChange={(event) => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, label: event.target.value || undefined } : item)} />
              </label>
            ) : null}
            {selectedBox ? (
              <>
                <label>
                  <span>文字</span>
                  <input
                    ref={textInputRef}
                    aria-label="选中元素文字"
                    value={selectedBox.text}
                    onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' ? item : { ...item, text: event.target.value })}
                  />
                </label>
                <div className="freeform-size-row">
                  <label><span>W</span><input aria-label="元素宽度" type="number" min="100" value={Math.round(selectedBox.width)} onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' ? item : { ...item, width: Math.max(100, Number(event.target.value) || 100) })} /></label>
                  <label><span>H</span><input aria-label="元素高度" type="number" min="60" value={Math.round(selectedBox.height)} onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' ? item : { ...item, height: Math.max(60, Number(event.target.value) || 60) })} /></label>
                </div>
              </>
            ) : null}
            {selected.length > 1 ? (
              <div className="freeform-align-row">
                <button type="button" aria-label="垂直对齐选中元素" onClick={() => alignSelection('x')}>垂直对齐</button>
                <button type="button" aria-label="水平对齐选中元素" onClick={() => alignSelection('y')}>水平对齐</button>
              </div>
            ) : null}
          </div>
        ) : null}

        <svg
          ref={svgRef}
          className={`freeform-svg tool-${spacePanning ? 'hand' : tool}`}
          viewBox={`${viewport.x} ${viewport.y} ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label="自由画布"
          onWheel={handleWheel}
          onPointerDown={beginBackgroundPointer}
          onPointerMove={moveBackgroundPointer}
          onPointerUp={finishGesture}
          onPointerCancel={(event) => { finishGesture(event); setSelectionRect(null) }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return
            if (drag.current) return
            const point = scenePoint(event.clientX, event.clientY, event.currentTarget, currentScene(), viewport)
            if (tool === 'node' || tool === 'note') addBox(tool, point.x, point.y)
          }}
        >
          <defs>
            <pattern id="canvas-grid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
              <path d={`M${GRID * 2} 0H0V${GRID * 2}`} className="freeform-grid-line" fill="none" />
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
              <g key={arrow.id} className={`freeform-arrow${selectedIds.includes(arrow.id) ? ' is-selected' : ''}`} onPointerDown={(event) => { event.stopPropagation(); editorRef.current?.focus({ preventScroll: true }); setSelectedIds(event.shiftKey ? toggleId(selectedIds, arrow.id) : [arrow.id]) }}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd="url(#canvas-arrow)" />
                {arrow.label ? <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 10} textAnchor="middle">{truncate(arrow.label, 28)}</text> : null}
              </g>
            )
          })}
          {boxes.map((item) => (
            <g
              key={item.id}
              className={`freeform-box freeform-${item.type}${selectedIds.includes(item.id) ? ' is-selected' : ''}${connectFrom === item.id ? ' is-connect-source' : ''}`}
              transform={`translate(${item.x} ${item.y})`}
              onPointerDown={(event) => startMove(event, item)}
              onClick={(event) => { event.stopPropagation(); handleBoxClick(item.id, event) }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                setSelectedIds([item.id])
                window.setTimeout(() => { textInputRef.current?.focus(); textInputRef.current?.select() }, 0)
              }}
              onPointerMove={(event) => moveSelection(event, item)}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
            >
              <rect width={item.width} height={item.height} rx="14" />
              <text x={item.width / 2} y={item.height / 2} textAnchor="middle" dominantBaseline="middle">
                {truncate(item.text, 28)}
              </text>
              {selectedIds.length === 1 && selectedIds[0] === item.id ? (
                <rect
                  className="freeform-resize-handle"
                  x={item.width - 7}
                  y={item.height - 7}
                  width="14"
                  height="14"
                  rx="3"
                  onPointerDown={(event) => beginResize(event, item)}
                  onPointerMove={moveResize}
                  onPointerUp={finishGesture}
                  onPointerCancel={finishGesture}
                />
              ) : null}
            </g>
          ))}
          {selectionRect ? (() => {
            const rect = normalizeRect(selectionRect)
            return <rect className="freeform-marquee" x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
          })() : null}
        </svg>

        <div className="freeform-status">
          <span>{scene.elements.length} 个元素</span>
          {selectedIds.length > 0 ? <span>已选 {selectedIds.length}</span> : <span>Space 拖动画布 · ⇧ 多选</span>}
        </div>
        <div className="freeform-zoom-controls" aria-label="画布缩放">
          <button type="button" aria-label="缩小画布" onClick={() => zoomAt(viewport.zoom / 1.15)}>−</button>
          <button type="button" className="zoom-value" aria-label="恢复 100%" onClick={() => setViewport((current) => ({ ...current, zoom: 1 }))}>{Math.round(viewport.zoom * 100)}%</button>
          <button type="button" aria-label="放大画布" onClick={() => zoomAt(viewport.zoom * 1.15)}>+</button>
          <span />
          <button type="button" aria-label="适配画布" onClick={fit}>适配</button>
        </div>
      </div>
    </div>
  )
}

function ToolButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: string }) {
  return <button type="button" className={active ? 'is-active' : ''} title={title} aria-label={title} onClick={onClick}>{children}</button>
}

function center(item: CanvasNode | CanvasNote) {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function scenePoint(clientX: number, clientY: number, svg: SVGSVGElement, scene: CanvasScene, viewport: Viewport) {
  const bounds = svg.getBoundingClientRect()
  return {
    x: viewport.x + ((clientX - bounds.left) / Math.max(1, bounds.width)) * (scene.width / viewport.zoom),
    y: viewport.y + ((clientY - bounds.top) / Math.max(1, bounds.height)) * (scene.height / viewport.zoom),
  }
}

function normalizeRect(value: SelectionRect) {
  const x = Math.min(value.x1, value.x2)
  const y = Math.min(value.y1, value.y2)
  return { x, y, width: Math.abs(value.x2 - value.x1), height: Math.abs(value.y2 - value.y1) }
}

function intersects(rect: { x: number; y: number; width: number; height: number }, item: CanvasNode | CanvasNote) {
  return item.x < rect.x + rect.width && item.x + item.width > rect.x && item.y < rect.y + rect.height && item.y + item.height > rect.y
}

function snap(value: number) {
  return Math.round(value / GRID) * GRID
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
}

function truncate(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function elementLabel(item: CanvasElement) {
  if (item.type === 'arrow') return '连接'
  return item.type === 'note' ? '备注' : '节点'
}
