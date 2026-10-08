import { useEffect, useMemo, useRef, useState } from 'react'
import { anchorPoint, canvasArrowPath, canvasIconLabel, parseCanvasScene, serializeCanvasScene, type CanvasAnchor, type CanvasArrow, type CanvasElement, type CanvasIcon, type CanvasLineStyle, type CanvasNode, type CanvasNote, type CanvasPoint, type CanvasRouting, type CanvasScene, type CanvasShape, type CanvasTone } from './canvas.js'
import { alignCanvasSelection, copyCanvasSelection, deleteCanvasSelection, distributeCanvasSelection, expandCanvasGroupSelection, groupCanvasSelection, layoutCanvasScene, nextCanvasElementId, pasteCanvasSelection, reorderCanvasSelection, ungroupCanvasSelection, updateCanvasGroup, type CanvasLayoutMode } from './canvasOperations.js'

type CanvasTool = 'select' | 'hand' | 'node' | 'note' | 'connect'

export interface CanvasSelection {
  ids: string[]
  elements: CanvasElement[]
}

interface CanvasEditorProps {
  source: string
  onChange: (source: string) => void
  onSelectionChange?: (selection: CanvasSelection | null) => void
  onOpenSource?: (path: string) => void
  onSearchSources?: (query: string) => Promise<string[]>
  focusElementIds?: string[]
  focusKey?: string
}

type Viewport = { x: number; y: number; zoom: number }
type SelectionRect = { x1: number; y1: number; x2: number; y2: number }
type ContextMenuState = { x: number; y: number }
type DragState =
  | { kind: 'move'; pointerId: number; startX: number; startY: number; before: string; positions: Map<string, { x: number; y: number }> }
  | { kind: 'pan'; pointerId: number; clientX: number; clientY: number; start: Viewport }
  | { kind: 'marquee'; pointerId: number; startX: number; startY: number }
  | { kind: 'resize'; pointerId: number; id: string; startX: number; startY: number; width: number; height: number; before: string }
  | { kind: 'arrow-point'; pointerId: number; id: string; index: number; before: string }

const GRID = 16
const MIN_ZOOM = 0.45
const MAX_ZOOM = 4

export function CanvasEditor({ source, onChange, onSelectionChange, onOpenSource, onSearchSources, focusElementIds, focusKey }: CanvasEditorProps) {
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
  const [connectFromAnchor, setConnectFromAnchor] = useState<CanvasAnchor>('auto')
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [spacePanning, setSpacePanning] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [sourceLinkQuery, setSourceLinkQuery] = useState('')
  const [sourceLinkOptions, setSourceLinkOptions] = useState<string[]>([])
  const [sourceLinkLoading, setSourceLinkLoading] = useState(false)
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
        setContextMenu(null)
        setSelectedIds([])
        setConnectFrom(null)
        setConnectFromAnchor('auto')
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

  const selectedBoxForLinks = useMemo(() => {
    if (!parsed.scene) return null
    const selected = parsed.scene.elements.filter((item) => selectedIds.includes(item.id))
    if (selected.length !== 1 || selected[0].type === 'arrow') return null
    return selected[0]
  }, [parsed.scene, selectedIds])

  useEffect(() => {
    setSourceLinkQuery('')
    setSourceLinkOptions([])
  }, [selectedBoxForLinks?.id])

  useEffect(() => {
    if (!selectedBoxForLinks || !onSearchSources || !sourceLinkQuery.trim()) {
      setSourceLinkLoading(false)
      setSourceLinkOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      setSourceLinkLoading(true)
      void onSearchSources(sourceLinkQuery.trim())
        .then((files) => {
          if (!cancelled) setSourceLinkOptions(files.filter((path) => !selectedBoxForLinks.sourcePaths?.includes(path)).slice(0, 8))
        })
        .finally(() => {
          if (!cancelled) setSourceLinkLoading(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [onSearchSources, selectedBoxForLinks, sourceLinkQuery])

  useEffect(() => {
    if (!parsed.scene || !focusElementIds?.length || !focusKey) return
    const targets = parsed.scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && focusElementIds.includes(item.id))
    if (!targets.length) return
    setSelectedIds(targets.map((item) => item.id))
    const left = Math.min(...targets.map((item) => item.x))
    const top = Math.min(...targets.map((item) => item.y))
    const right = Math.max(...targets.map((item) => item.x + item.width))
    const bottom = Math.max(...targets.map((item) => item.y + item.height))
    const paddedWidth = Math.max(260, right - left + 220)
    const paddedHeight = Math.max(180, bottom - top + 180)
    const zoom = clamp(Math.min(parsed.scene.width / paddedWidth, parsed.scene.height / paddedHeight), 1, 2.8)
    const viewWidth = parsed.scene.width / zoom
    const viewHeight = parsed.scene.height / zoom
    const centerX = (left + right) / 2
    const centerY = (top + bottom) / 2
    setViewport({
      zoom,
      x: clamp(centerX - viewWidth / 2, 0, Math.max(0, parsed.scene.width - viewWidth)),
      y: clamp(centerY - viewHeight / 2, 0, Math.max(0, parsed.scene.height - viewHeight)),
    })
  }, [focusElementIds, focusKey, parsed.scene])

  if (!parsed.scene) {
    return <div className="canvas-invalid"><strong>自由画布无法渲染</strong><span>{parsed.error}</span><p>可以切到“源码”修复 JSON。</p></div>
  }

  const scene = parsed.scene
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const selected = scene.elements.filter((item) => selectedIds.includes(item.id))
  const selectedSingle = selected.length === 1 ? selected[0] : null
  const selectedBox = selectedSingle && selectedSingle.type !== 'arrow' ? selectedSingle : null
  const selectedBoxes = selected.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const selectedLocked = selectedBoxes.filter((item) => item.locked)
  const selectedGroupIds = [...new Set(selectedBoxes.map((item) => item.groupId).filter((value): value is string => Boolean(value)))]
  const groupBounds = (scene.groups ?? []).map((group) => {
    const members = boxes.filter((item) => item.groupId === group.id)
    if (members.length < 2) return null
    const x = Math.min(...members.map((item) => item.x))
    const y = Math.min(...members.map((item) => item.y))
    const right = Math.max(...members.map((item) => item.x + item.width))
    const bottom = Math.max(...members.map((item) => item.y + item.height))
    return { ...group, x: x - 18, y: y - 36, width: right - x + 36, height: bottom - y + 54 }
  }).filter((value): value is NonNullable<typeof value> => Boolean(value))
  const selectedGroup = selectedGroupIds.length === 1
    ? scene.groups?.find((group) => group.id === selectedGroupIds[0]) ?? { id: selectedGroupIds[0], label: selectedGroupIds[0], tone: 'muted' as CanvasTone }
    : undefined

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
    const mutableIds = selected.filter((item) => item.type === 'arrow' || !item.locked).map((item) => item.id)
    if (mutableIds.length === 0) return
    commit(deleteCanvasSelection(live, mutableIds))
    setSelectedIds([])
    setConnectFrom(null)
    setConnectFromAnchor('auto')
    setContextMenu(null)
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

  function distributeSelection(axis: 'x' | 'y') {
    commit(distributeCanvasSelection(currentScene(), selectedIds, axis, GRID))
  }

  function groupSelection() {
    const grouped = groupCanvasSelection(currentScene(), selectedIds)
    if (!grouped.groupId) return
    commit(grouped.scene)
    setSelectedIds(expandCanvasGroupSelection(grouped.scene, selectedIds))
  }

  function ungroupSelection() {
    commit(ungroupCanvasSelection(currentScene(), selectedIds))
  }

  function updateSelectedGroup(patch: { label?: string; tone?: CanvasTone }) {
    if (selectedGroupIds.length !== 1) return
    commit(updateCanvasGroup(currentScene(), selectedGroupIds[0], patch))
  }

  function applyLayout(mode: CanvasLayoutMode) {
    commit(layoutCanvasScene(currentScene(), mode, GRID))
    fit()
  }

  function reorderSelection(direction: 'front' | 'back') {
    commit(reorderCanvasSelection(currentScene(), selectedIds, direction))
    setContextMenu(null)
  }

  function toggleSelectionLock() {
    if (selectedBoxes.length === 0) return
    const shouldLock = selectedLocked.length !== selectedBoxes.length
    const ids = new Set(selectedBoxes.map((item) => item.id))
    const live = currentScene()
    commit({
      ...live,
      elements: live.elements.map((item) => item.type !== 'arrow' && ids.has(item.id) ? { ...item, locked: shouldLock || undefined } : item),
    })
    setContextMenu(null)
  }

  function updateSelectedBoxes(updater: (item: CanvasNode | CanvasNote) => CanvasNode | CanvasNote) {
    if (selectedBoxes.length === 0) return
    const ids = new Set(selectedBoxes.filter((item) => !item.locked).map((item) => item.id))
    if (ids.size === 0) return
    const live = currentScene()
    commit({ ...live, elements: live.elements.map((item) => item.type !== 'arrow' && ids.has(item.id) ? updater(item) : item) })
  }

  function openContextMenu(event: React.MouseEvent, id: string) {
    event.preventDefault()
    event.stopPropagation()
    editorRef.current?.focus({ preventScroll: true })
    if (!selectedIds.includes(id)) setSelectedIds([id])
    const surface = editorRef.current?.getBoundingClientRect()
    setContextMenu({ x: event.clientX - (surface?.left ?? 0), y: event.clientY - (surface?.top ?? 0) })
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
      if (!exists) commit({ ...live, elements: [...live.elements, { id: nextCanvasElementId('arrow', live.elements), type: 'arrow', from: connectFrom, to: id, ...(connectFromAnchor !== 'auto' ? { fromAnchor: connectFromAnchor } : {}) }] })
      setConnectFrom(null)
      setConnectFromAnchor('auto')
      setSelectedIds([id])
      setTool('select')
      return
    }
    if (tool !== 'select') return
  }

  function handleAnchorClick(event: React.MouseEvent<SVGCircleElement>, id: string, anchor: Exclude<CanvasAnchor, 'auto'>) {
    event.preventDefault()
    event.stopPropagation()
    const live = currentScene()
    if (!connectFrom) {
      setConnectFrom(id)
      setConnectFromAnchor(anchor)
      setSelectedIds([id])
      setTool('connect')
      return
    }
    if (connectFrom === id) {
      setConnectFromAnchor(anchor)
      return
    }
    const exists = live.elements.some((item) => item.type === 'arrow' && item.from === connectFrom && item.to === id)
    if (!exists) {
      commit({
        ...live,
        elements: [...live.elements, {
          id: nextCanvasElementId('arrow', live.elements),
          type: 'arrow',
          from: connectFrom,
          to: id,
          ...(connectFromAnchor !== 'auto' ? { fromAnchor: connectFromAnchor } : {}),
          toAnchor: anchor,
        }],
      })
    }
    setConnectFrom(null)
    setConnectFromAnchor('auto')
    setSelectedIds([id])
    setTool('select')
  }

  function startMove(event: React.PointerEvent<SVGGElement>, item: CanvasNode | CanvasNote) {
    if (tool !== 'select' || spacePanning) return
    event.stopPropagation()
    setContextMenu(null)
    editorRef.current?.focus({ preventScroll: true })
    const live = currentScene()
    let ids = selectedIds
    const groupIds = !event.altKey && item.groupId
      ? currentScene().elements.filter((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.groupId === item.groupId).map((candidate) => candidate.id)
      : [item.id]
    if (event.shiftKey && ids.includes(item.id)) {
      const removing = new Set(groupIds)
      setSelectedIds(ids.filter((id) => !removing.has(id)))
      return
    }
    if (!ids.includes(item.id)) {
      ids = event.shiftKey ? [...new Set([...ids, ...groupIds])] : groupIds
      setSelectedIds(ids)
    } else if (!event.altKey && item.groupId) {
      ids = [...new Set([...ids, ...groupIds])]
      setSelectedIds(ids)
    }
    if (item.locked) return
    const point = scenePoint(event.clientX, event.clientY, svgRef.current!, live, viewport)
    const positions = new Map<string, { x: number; y: number }>()
    live.elements.forEach((candidate) => {
      if (candidate.type !== 'arrow' && ids.includes(candidate.id) && !candidate.locked) positions.set(candidate.id, { x: candidate.x, y: candidate.y })
    })
    if (positions.size === 0) return
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
    if (active.kind === 'move' || active.kind === 'resize' || active.kind === 'arrow-point') recordGesture(active.before)
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
    setContextMenu(null)
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
    if (item.locked) return
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

  function beginArrowPointDrag(event: React.PointerEvent<SVGCircleElement>, arrow: CanvasArrow, index: number) {
    event.stopPropagation()
    drag.current = { kind: 'arrow-point', pointerId: event.pointerId, id: arrow.id, index, before: sourceRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveArrowPoint(event: React.PointerEvent<SVGCircleElement>) {
    const active = drag.current
    if (!active || active.kind !== 'arrow-point' || active.pointerId !== event.pointerId) return
    const live = currentScene()
    const point = scenePoint(event.clientX, event.clientY, svgRef.current!, live, viewport)
    updateElement(active.id, (item) => {
      if (item.type !== 'arrow') return item
      const points = [...(item.points ?? [])]
      points[active.index] = { x: snap(point.x), y: snap(point.y) }
      return { ...item, points }
    }, false)
  }

  function addArrowPoint(arrow: CanvasArrow) {
    const live = currentScene()
    const from = live.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === arrow.from)
    const to = live.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === arrow.to)
    if (!from || !to) return
    const fromCenter = center(from)
    const toCenter = center(to)
    const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
    const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
    const points = [...(arrow.points ?? []), { x: snap((start.x + end.x) / 2), y: snap((start.y + end.y) / 2) }]
    updateElement(arrow.id, (item) => item.type === 'arrow' ? { ...item, points } : item)
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

  function recenterFromMinimap(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const targetX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * scene.width
    const targetY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * scene.height
    setViewport((current) => {
      const width = scene.width / current.zoom
      const height = scene.height / current.zoom
      return {
        ...current,
        x: clamp(targetX - width / 2, 0, Math.max(0, scene.width - width)),
        y: clamp(targetY - height / 2, 0, Math.max(0, scene.height - height)),
      }
    })
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
          <select
            className="freeform-layout-select"
            aria-label="自动布局"
            defaultValue=""
            onChange={(event) => {
              const mode = event.target.value as CanvasLayoutMode | ''
              if (mode) applyLayout(mode)
              event.currentTarget.value = ''
            }}
          >
            <option value="">自动布局</option>
            <option value="horizontal">从左到右</option>
            <option value="vertical">从上到下</option>
            <option value="grid">网格布局</option>
          </select>
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
              <>
                <label>
                  <span>连线文字</span>
                  <input aria-label="连线文字" value={selectedSingle.label ?? ''} onChange={(event) => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, label: event.target.value || undefined } : item)} />
                </label>
                <div className="freeform-property-row">
                  <label><span>线型</span><select aria-label="连线线型" value={selectedSingle.lineStyle ?? 'solid'} onChange={(event) => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, lineStyle: event.target.value as CanvasLineStyle } : item)}><option value="solid">实线</option><option value="dashed">虚线</option></select></label>
                  <label><span>路由</span><select aria-label="连线路由" value={selectedSingle.routing ?? 'straight'} onChange={(event) => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, routing: event.target.value as CanvasRouting } : item)}><option value="straight">直线</option><option value="orthogonal">正交</option></select></label>
                </div>
                <div className="freeform-property-row">
                  <label><span>起点</span><select aria-label="连线起点锚点" value={selectedSingle.fromAnchor ?? 'auto'} onChange={(event) => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, fromAnchor: event.target.value as CanvasAnchor } : item)}>{anchorOptions()}</select></label>
                  <label><span>终点</span><select aria-label="连线终点锚点" value={selectedSingle.toAnchor ?? 'auto'} onChange={(event) => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, toAnchor: event.target.value as CanvasAnchor } : item)}>{anchorOptions()}</select></label>
                </div>
                <div className="freeform-align-row">
                  <button type="button" onClick={() => addArrowPoint(selectedSingle)}>添加折点</button>
                  <button type="button" disabled={!selectedSingle.points?.length} onClick={() => updateElement(selectedSingle.id, (item) => item.type === 'arrow' ? { ...item, points: undefined } : item)}>清除折点</button>
                </div>
              </>
            ) : null}
            {selectedBox ? (
              <>
                <label>
                  <span>文字</span>
                  <input
                    ref={textInputRef}
                    aria-label="选中元素文字"
                    value={selectedBox.text}
                    disabled={selectedBox.locked}
                    onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, text: event.target.value })}
                  />
                </label>
                <div className="freeform-size-row">
                  <label><span>W</span><input aria-label="元素宽度" type="number" min="100" disabled={selectedBox.locked} value={Math.round(selectedBox.width)} onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, width: Math.max(100, Number(event.target.value) || 100) })} /></label>
                  <label><span>H</span><input aria-label="元素高度" type="number" min="60" disabled={selectedBox.locked} value={Math.round(selectedBox.height)} onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, height: Math.max(60, Number(event.target.value) || 60) })} /></label>
                </div>
                <div className="freeform-property-row">
                  <label><span>色调</span><select aria-label="元素色调" disabled={selectedBox.locked} value={selectedBox.tone ?? 'default'} onChange={(event) => updateSelectedBoxes((item) => ({ ...item, tone: event.target.value as CanvasTone }))}><option value="default">默认</option><option value="accent">强调</option><option value="success">成功</option><option value="warning">警告</option><option value="danger">危险</option><option value="muted">弱化</option></select></label>
                  <label><span>形状</span><select aria-label="元素形状" disabled={selectedBox.locked} value={selectedBox.shape ?? 'rounded'} onChange={(event) => updateSelectedBoxes((item) => ({ ...item, shape: event.target.value as CanvasShape }))}><option value="rounded">圆角</option><option value="square">方形</option><option value="pill">胶囊</option></select></label>
                </div>
                <label>
                  <span>节点角色</span>
                  <select aria-label="节点角色图标" disabled={selectedBox.locked} value={selectedBox.icon ?? ''} onChange={(event) => updateSelectedBoxes((item) => ({ ...item, icon: (event.target.value || undefined) as CanvasIcon | undefined }))}>
                    <option value="">无</option>
                    <option value="user">用户</option>
                    <option value="web">Web / 前端</option>
                    <option value="api">API / 网关</option>
                    <option value="service">服务</option>
                    <option value="database">数据库</option>
                    <option value="cache">缓存</option>
                    <option value="queue">消息队列</option>
                    <option value="cloud">云 / 平台</option>
                    <option value="file">文件 / 对象</option>
                    <option value="external">外部系统</option>
                  </select>
                </label>
                <label>
                  <span>关联源码</span>
                  <div className="freeform-source-picker">
                    <input
                      aria-label="搜索关联源码"
                      disabled={selectedBox.locked}
                      value={sourceLinkQuery}
                      placeholder="搜索当前工作区源码"
                      onChange={(event) => setSourceLinkQuery(event.target.value)}
                    />
                    {sourceLinkLoading || sourceLinkOptions.length ? (
                      <div className="freeform-source-options">
                        {sourceLinkLoading ? <span>搜索中…</span> : null}
                        {!sourceLinkLoading ? sourceLinkOptions.map((path) => (
                          <button
                            type="button"
                            key={path}
                            title={path}
                            onClick={() => {
                              updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, sourcePaths: [...new Set([...(item.sourcePaths ?? []), path])] })
                              setSourceLinkQuery('')
                              setSourceLinkOptions([])
                            }}
                          >{shortSourcePath(path)}</button>
                        )) : null}
                      </div>
                    ) : null}
                  </div>
                </label>
                {selectedBox.sourcePaths?.length ? (
                  <div className="freeform-source-links">
                    {selectedBox.sourcePaths.map((path) => (
                      <span key={path} className="freeform-source-link">
                        <button type="button" title={path} onClick={() => onOpenSource?.(path)}>{shortSourcePath(path)}</button>
                        {!selectedBox.locked ? <button type="button" aria-label={`移除 ${path}`} onClick={() => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, sourcePaths: item.sourcePaths?.filter((candidate) => candidate !== path) })}>×</button> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="freeform-lock-button" onClick={toggleSelectionLock}>{selectedBox.locked ? '解锁元素' : '锁定元素'}</button>
              </>
            ) : null}
            {selectedGroup ? (
              <div className="freeform-group-inspector">
                <div className="freeform-section-caption">容器</div>
                <label>
                  <span>名称</span>
                  <input aria-label="组合名称" value={selectedGroup.label ?? ''} placeholder="例如：订单域" onChange={(event) => updateSelectedGroup({ label: event.target.value || undefined })} />
                </label>
                <label>
                  <span>色调</span>
                  <select aria-label="组合色调" value={selectedGroup.tone ?? 'muted'} onChange={(event) => updateSelectedGroup({ tone: event.target.value as CanvasTone })}>
                    <option value="default">默认</option>
                    <option value="accent">强调</option>
                    <option value="success">成功</option>
                    <option value="warning">警告</option>
                    <option value="danger">危险</option>
                    <option value="muted">弱化</option>
                  </select>
                </label>
              </div>
            ) : null}
            {selected.length > 1 ? (
              <>
                <div className="freeform-align-row">
                  <button type="button" aria-label="垂直对齐选中元素" onClick={() => alignSelection('x')}>垂直对齐</button>
                  <button type="button" aria-label="水平对齐选中元素" onClick={() => alignSelection('y')}>水平对齐</button>
                </div>
                <div className="freeform-align-row">
                  <button type="button" aria-label="水平等距分布" onClick={() => distributeSelection('x')}>水平分布</button>
                  <button type="button" aria-label="垂直等距分布" onClick={() => distributeSelection('y')}>垂直分布</button>
                </div>
                <div className="freeform-align-row">
                  <button type="button" disabled={selectedBoxes.length < 2} onClick={groupSelection}>组合</button>
                  <button type="button" disabled={selectedGroupIds.length === 0} onClick={ungroupSelection}>取消组合</button>
                </div>
                <button type="button" className="freeform-lock-button" onClick={toggleSelectionLock}>{selectedLocked.length === selectedBoxes.length && selectedBoxes.length > 0 ? '解锁选中' : '锁定选中'}</button>
              </>
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
          {groupBounds.map((group) => (
            <g key={group.id} className={`freeform-group-frame tone-${group.tone ?? 'muted'}${selectedGroupIds.includes(group.id) ? ' is-selected' : ''}`} pointerEvents="none">
              <rect x={group.x} y={group.y} width={group.width} height={group.height} rx="20" />
              {group.label ? <text x={group.x + 14} y={group.y + 22}>{truncate(group.label, 34)}</text> : null}
            </g>
          ))}
          {arrows.map((arrow) => {
            const from = boxes.find((item) => item.id === arrow.from)
            const to = boxes.find((item) => item.id === arrow.to)
            if (!from || !to) return null
            const fromCenter = center(from)
            const toCenter = center(to)
            const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
            const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
            const path = canvasArrowPath(start, end, arrow)
            const labelPoint = pathLabelPoint(start, end, arrow.points)
            return (
              <g key={arrow.id} className={`freeform-arrow${selectedIds.includes(arrow.id) ? ' is-selected' : ''}${arrow.lineStyle === 'dashed' ? ' is-dashed' : ''}`} onContextMenu={(event) => openContextMenu(event, arrow.id)} onPointerDown={(event) => { event.stopPropagation(); setContextMenu(null); editorRef.current?.focus({ preventScroll: true }); setSelectedIds(event.shiftKey ? toggleId(selectedIds, arrow.id) : [arrow.id]) }}>
                <path d={path} markerEnd="url(#canvas-arrow)" />
                {arrow.label ? <text x={labelPoint.x} y={labelPoint.y - 10} textAnchor="middle">{truncate(arrow.label, 28)}</text> : null}
                {selectedIds.includes(arrow.id) ? arrow.points?.map((point, index) => (
                  <circle
                    key={`${arrow.id}-point-${index}`}
                    className="freeform-arrow-point"
                    cx={point.x}
                    cy={point.y}
                    r="8"
                    onPointerDown={(event) => beginArrowPointDrag(event, arrow, index)}
                    onPointerMove={moveArrowPoint}
                    onPointerUp={finishGesture}
                    onPointerCancel={finishGesture}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      updateElement(arrow.id, (item) => item.type === 'arrow' ? { ...item, points: item.points?.filter((_, pointIndex) => pointIndex !== index) } : item)
                    }}
                  />
                )) : null}
              </g>
            )
          })}
          {boxes.map((item) => (
            <g
              key={item.id}
              className={`freeform-box freeform-${item.type} tone-${item.tone ?? 'default'} shape-${item.shape ?? 'rounded'}${item.locked ? ' is-locked' : ''}${selectedIds.includes(item.id) ? ' is-selected' : ''}${connectFrom === item.id ? ' is-connect-source' : ''}`}
              transform={`translate(${item.x} ${item.y})`}
              onContextMenu={(event) => openContextMenu(event, item.id)}
              onPointerDown={(event) => startMove(event, item)}
              onClick={(event) => { event.stopPropagation(); handleBoxClick(item.id, event) }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                setSelectedIds([item.id])
                if (!item.locked) window.setTimeout(() => { textInputRef.current?.focus(); textInputRef.current?.select() }, 0)
              }}
              onPointerMove={(event) => moveSelection(event, item)}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
            >
              <rect width={item.width} height={item.height} rx={item.shape === 'square' ? 3 : item.shape === 'pill' ? item.height / 2 : 14} />
              {item.icon ? <text className="freeform-node-icon" x="13" y="19">{canvasIconLabel(item.icon)}</text> : null}
              <text x={item.width / 2} y={item.height / 2} textAnchor="middle" dominantBaseline="middle">
                {truncate(item.text, 28)}
              </text>
              {item.sourcePaths?.length ? <text className="freeform-source-badge" x={item.width - 10} y={18} textAnchor="end">⌘ {item.sourcePaths.length}</text> : null}
              {(tool === 'connect' || selectedIds.includes(item.id)) ? (
                <g className="freeform-anchor-points">
                  <circle cx={item.width / 2} cy={0} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'top')} />
                  <circle cx={item.width} cy={item.height / 2} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'right')} />
                  <circle cx={item.width / 2} cy={item.height} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'bottom')} />
                  <circle cx={0} cy={item.height / 2} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'left')} />
                </g>
              ) : null}
              {selectedIds.length === 1 && selectedIds[0] === item.id && !item.locked ? (
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

        {contextMenu ? (
          <div className="freeform-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button type="button" role="menuitem" onClick={() => { copySelection(); pasteSelection(); setContextMenu(null) }}>复制一份</button>
            {selectedBox?.sourcePaths?.[0] && onOpenSource ? <button type="button" role="menuitem" onClick={() => { onOpenSource(selectedBox.sourcePaths![0]); setContextMenu(null) }}>打开关联源码</button> : null}
            {selectedBoxes.length > 1 ? <button type="button" role="menuitem" onClick={() => { groupSelection(); setContextMenu(null) }}>组合</button> : null}
            {selectedGroupIds.length > 0 ? <button type="button" role="menuitem" onClick={() => { ungroupSelection(); setContextMenu(null) }}>取消组合</button> : null}
            {selectedBoxes.length > 0 ? <button type="button" role="menuitem" onClick={toggleSelectionLock}>{selectedLocked.length === selectedBoxes.length ? '解锁' : '锁定'}</button> : null}
            {selectedBoxes.length > 0 ? <button type="button" role="menuitem" onClick={() => reorderSelection('front')}>移到最前</button> : null}
            {selectedBoxes.length > 0 ? <button type="button" role="menuitem" onClick={() => reorderSelection('back')}>移到最后</button> : null}
            <span />
            <button type="button" role="menuitem" className="is-danger" disabled={selectedBoxes.length > 0 && selectedLocked.length === selectedBoxes.length} onClick={deleteSelected}>删除</button>
          </div>
        ) : null}

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
        <svg className="freeform-minimap" aria-label="画布缩略图" viewBox={`0 0 ${scene.width} ${scene.height}`} onPointerDown={recenterFromMinimap}>
          <rect width={scene.width} height={scene.height} className="freeform-minimap-bg" />
          {boxes.map((item) => <rect key={item.id} x={item.x} y={item.y} width={item.width} height={item.height} rx="10" className={`freeform-minimap-node${selectedIds.includes(item.id) ? ' is-selected' : ''}`} />)}
          <rect x={viewport.x} y={viewport.y} width={viewWidth} height={viewHeight} className="freeform-minimap-viewport" />
        </svg>
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

function pathLabelPoint(start: CanvasPoint, end: CanvasPoint, points?: CanvasPoint[]) {
  if (!points?.length) return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const path = [start, ...points, end]
  const middle = Math.floor((path.length - 1) / 2)
  return { x: (path[middle].x + path[middle + 1].x) / 2, y: (path[middle].y + path[middle + 1].y) / 2 }
}

function anchorOptions() {
  return <>
    <option value="auto">自动</option>
    <option value="top">上</option>
    <option value="right">右</option>
    <option value="bottom">下</option>
    <option value="left">左</option>
  </>
}

function shortSourcePath(value: string) {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : value
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
