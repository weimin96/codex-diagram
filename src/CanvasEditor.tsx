import { useEffect, useMemo, useRef, useState } from 'react'
import { beautifyArchitectureScene, routeArchitectureEdges, type ArchitectureTheme } from './architectureDesign.js'
import { anchorPoint, canvasArchitectureCardTemplate, canvasArchitectureHeader, canvasArchitectureProjection, canvasArchitectureScopeProjection, canvasArrowLabelLayouts, canvasArrowPath, canvasBundleTrunks, canvasCollapsedConnections, canvasCollapsedOwners, canvasGroupFrames, canvasIconLabel, canvasIconPaths, canvasStencilLabel, c4Label, parseCanvasScene, serializeCanvasScene, type CanvasAnchor, type CanvasArchitectureDensity, type CanvasArchitectureScope, type CanvasArchitectureView, type CanvasArrow, type CanvasC4Type, type CanvasElement, type CanvasGroup, type CanvasGroupFrame, type CanvasIcon, type CanvasLineStyle, type CanvasNode, type CanvasNote, type CanvasPoint, type CanvasRouting, type CanvasScene, type CanvasShape, type CanvasStencil, type CanvasTone } from './canvas.js'
import { alignCanvasSelection, assignCanvasSelectionToLane, clearCanvasLanes, copyCanvasSelection, createCanvasLanePreset, deleteCanvasSelection, distributeCanvasSelection, expandCanvasGroupSelection, groupCanvasSelection, insertCanvasArchitectureTemplate, layoutCanvasScene, layoutCanvasSelection, nextCanvasElementId, pasteCanvasSelection, reorderCanvasSelection, setCanvasGroupParent, traceCanvasGraph, ungroupCanvasSelection, updateCanvasGroup, updateCanvasLane, type CanvasArchitectureTemplate, type CanvasLayoutMode, type CanvasTraceDirection } from './canvasOperations.js'

type CanvasTool = 'select' | 'hand' | 'node' | 'note' | 'connect'

export interface CanvasSelection {
  ids: string[]
  elements: CanvasElement[]
  trace?: { direction: CanvasTraceDirection; depth: number; nodeIds: string[]; arrowIds: string[] }
}

export interface CanvasPlaybackRequest {
  key: string
  path: string
  mode: 'create' | 'update'
  fromSource?: string
  label?: string
}

interface CanvasEditorProps {
  source: string
  onChange: (source: string) => void
  onSelectionChange?: (selection: CanvasSelection | null) => void
  onOpenSource?: (path: string) => void
  onSearchSources?: (query: string) => Promise<string[]>
  onAnalyzeGitImpact?: () => void | Promise<void>
  focusElementIds?: string[]
  focusKey?: string
  traceRequest?: { seedElementIds: string[]; direction: CanvasTraceDirection; depth: number; key: string }
  playbackRequest?: CanvasPlaybackRequest | null
  onPlaybackComplete?: (key: string) => void
}

type Viewport = { x: number; y: number; zoom: number }
type SelectionRect = { x1: number; y1: number; x2: number; y2: number }
type ContextMenuState = { x: number; y: number }
type PlaybackState = {
  active: boolean
  visibleIds: string[]
  cursor: CanvasPoint
  cursorVisible: boolean
  clicking: boolean
  currentElementId?: string
  drawingArrowId?: string
  typing?: { id: string; text: string }
  positionOverrides?: Record<string, CanvasPoint>
  boxOverrides?: Record<string, CanvasNode | CanvasNote>
  arrowOverrides?: Record<string, CanvasArrow>
  groupFrameOverrides?: Record<string, CanvasGroupFrame>
  toolHint?: 'select' | 'node' | 'note' | 'connect'
  phase?: 'planning' | 'transitioning' | 'placing' | 'typing' | 'selecting' | 'grouping' | 'styling' | 'connecting' | 'arranging' | 'finishing'
  intent?: string
  regionLabel?: string
  regionIndex?: number
  totalRegions?: number
  activeRegionIds?: string[]
  selectionBox?: { x: number; y: number; width: number; height: number }
  boundaryDraft?: { x: number; y: number; width: number; height: number; label?: string }
  visibleGroupIds?: string[]
  inspectorPreview?: { title: string; rows: Array<{ label: string; value: string }>; activeIndex: number }
  inspectorDropdownOpen?: boolean
  ghostElements?: CanvasElement[]
  deletingIds?: string[]
  anchorPreview?: { from: CanvasPoint; to: CanvasPoint; path?: string; active: 'from' | 'to' }
  finalHighlightIds?: string[]
  step: number
  total: number
  label: string
}
type DragState =
  | { kind: 'move'; pointerId: number; startX: number; startY: number; before: string; positions: Map<string, { x: number; y: number }> }
  | { kind: 'pan'; pointerId: number; clientX: number; clientY: number; start: Viewport }
  | { kind: 'marquee'; pointerId: number; startX: number; startY: number }
  | { kind: 'resize'; pointerId: number; id: string; startX: number; startY: number; width: number; height: number; before: string }
  | { kind: 'arrow-point'; pointerId: number; id: string; index: number; before: string }

const GRID = 16
const MIN_ZOOM = 0.45
const MAX_ZOOM = 4

export function CanvasEditor({ source, onChange, onSelectionChange, onOpenSource, onSearchSources, onAnalyzeGitImpact, focusElementIds, focusKey, traceRequest, playbackRequest, onPlaybackComplete }: CanvasEditorProps) {
  const parsed = useMemo(() => {
    try {
      return { scene: parseCanvasScene(source), error: null as string | null }
    } catch (error) {
      return { scene: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [source])
  const [tool, setTool] = useState<CanvasTool>('select')
  const [architectureTheme, setArchitectureTheme] = useState<ArchitectureTheme>(parsed.scene?.architecture?.theme ?? 'enterprise')
  const [architectureView, setArchitectureView] = useState<CanvasArchitectureView>(parsed.scene?.architecture?.view ?? 'detail')
  const [architectureDensity, setArchitectureDensity] = useState<CanvasArchitectureDensity>(parsed.scene?.architecture?.density ?? 'auto')
  const [architectureScope, setArchitectureScope] = useState<CanvasArchitectureScope | null>(null)
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
  const [layersOpen, setLayersOpen] = useState(false)
  const [layerQuery, setLayerQuery] = useState('')
  const [selectedGroupTarget, setSelectedGroupTarget] = useState<string | null>(null)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [traceDirection, setTraceDirection] = useState<CanvasTraceDirection | null>(null)
  const [traceDepth, setTraceDepth] = useState(2)
  const editorRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const drag = useRef<DragState | null>(null)
  const sourceRef = useRef(source)
  const sceneRef = useRef<CanvasScene | null>(parsed.scene)
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const clipboard = useRef<CanvasElement[]>([])
  const playbackRun = useRef(0)
  const playbackCursor = useRef<CanvasPoint>({ x: 72, y: 72 })
  const viewportRef = useRef(viewport)

  useEffect(() => {
    sourceRef.current = source
    sceneRef.current = parsed.scene
  }, [parsed.scene, source])

  useEffect(() => {
    if (!parsed.scene?.architecture) return
    setArchitectureTheme(parsed.scene.architecture.theme)
    setArchitectureView(parsed.scene.architecture.view ?? 'detail')
    setArchitectureDensity(parsed.scene.architecture.density ?? 'auto')
  }, [parsed.scene?.architecture?.density, parsed.scene?.architecture?.theme, parsed.scene?.architecture?.view])

  useEffect(() => {
    if (!parsed.scene || !architectureScope) return
    const exists = architectureScope.kind === 'group'
      ? parsed.scene.groups?.some((group) => group.id === architectureScope.id)
      : architectureScope.kind === 'lane'
        ? parsed.scene.lanes?.some((lane) => lane.id === architectureScope.id)
        : parsed.scene.elements.some((item) => item.type !== 'arrow' && item.id === architectureScope.id)
    if (!exists) setArchitectureScope(null)
  }, [architectureScope, parsed.scene])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    if (!parsed.scene) return
    const valid = selectedIds.filter((id) => parsed.scene!.elements.some((item) => item.id === id))
    if (valid.length !== selectedIds.length) setSelectedIds(valid)
  }, [parsed.scene, selectedIds])

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
        if (architectureScope) {
          setArchitectureScope(null)
          setViewport({ x: 0, y: 0, zoom: 1 })
          return
        }
        setContextMenu(null)
        setSelectedIds([])
        setSelectedGroupTarget(null)
        setTraceDirection(null)
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

  useEffect(() => {
    if (!focusKey) return
    if (!traceRequest || traceRequest.key !== focusKey) {
      setTraceDirection(null)
      return
    }
    const seeds = traceRequest.seedElementIds.filter((id) => parsed.scene?.elements.some((item) => item.type !== 'arrow' && item.id === id))
    if (!seeds.length) return
    setSelectedIds(seeds)
    setSelectedGroupTarget(null)
    setTraceDirection(traceRequest.direction)
    setTraceDepth(traceRequest.depth)
    // traceRequest is an event keyed by the thread state's updatedAt. The parent
    // may recreate the object while rendering; only react to a new event key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, parsed.scene, traceRequest?.key])

  useEffect(() => {
    if (!playbackRequest?.key || !parsed.scene) return
    const runId = ++playbackRun.current
    const isActiveRun = () => playbackRun.current === runId
    const completePlayback = () => onPlaybackComplete?.(playbackRequest.key)
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPlayback(null)
      completePlayback()
      return
    }
    let previous: CanvasScene | undefined
    if (playbackRequest.fromSource) {
      try { previous = parseCanvasScene(playbackRequest.fromSource) } catch { previous = undefined }
    }
    const plan = buildCanvasPlaybackPlan(previous, parsed.scene, playbackRequest.mode)
    if (!plan.actions.length) {
      setPlayback(null)
      completePlayback()
      return
    }
    const pace = plan.actions.length > 60 ? 0.3 : plan.actions.length > 36 ? 0.46 : plan.actions.length > 20 ? 0.68 : 1
    const regionByKey = new Map(plan.regions.map((region, index) => [region.key, { ...region, index }]))
    const playbackPositions = new Map<string, CanvasPoint>(Object.entries(plan.initialPositionOverrides))
    const firstTarget = playbackActionTarget(parsed.scene, plan.actions[0]) ?? { x: 72, y: 72 }
    const firstRegion = regionByKey.get(plan.actions[0].regionKey)
    playbackCursor.current = { x: Math.max(36, firstTarget.x - 96), y: Math.max(36, firstTarget.y - 72) }
    setPlayback({
      active: true,
      visibleIds: plan.initialVisibleIds,
      visibleGroupIds: plan.initialVisibleGroupIds,
      cursor: playbackCursor.current,
      cursorVisible: true,
      clicking: false,
      positionOverrides: plan.initialPositionOverrides,
      boxOverrides: plan.initialBoxOverrides,
      arrowOverrides: plan.initialArrowOverrides,
      groupFrameOverrides: plan.initialGroupFrameOverrides,
      ghostElements: plan.ghostElements,
      phase: 'planning',
      intent: firstRegion ? `准备绘制 ${firstRegion.label}` : '准备绘制画板',
      regionLabel: firstRegion?.label,
      regionIndex: firstRegion ? firstRegion.index + 1 : undefined,
      totalRegions: plan.regions.length || undefined,
      activeRegionIds: firstRegion?.elementIds,
      step: 0,
      total: plan.actions.length,
      label: playbackRequest.label || (playbackRequest.mode === 'create' ? 'Codex 正在绘制画板' : 'Codex 正在调整画板'),
    })

    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
    const moveCursor = (target: CanvasPoint, duration: number) => new Promise<void>((resolve) => {
      const from = playbackCursor.current
      const started = performance.now()
      const frame = (now: number) => {
        if (playbackRun.current !== runId) return resolve()
        const raw = Math.min(1, (now - started) / duration)
        const eased = 1 - Math.pow(1 - raw, 3)
        const next = { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased }
        playbackCursor.current = next
        setPlayback((current) => current ? { ...current, cursor: next, cursorVisible: true } : current)
        if (raw < 1) window.requestAnimationFrame(frame)
        else resolve()
      }
      window.requestAnimationFrame(frame)
    })

    const moveCamera = (target: CanvasPoint, duration = 260, preferredZoom = 1.12) => new Promise<void>((resolve) => {
      const live = parsed.scene!
      const from = viewportRef.current
      const zoom = clamp(preferredZoom, 0.82, 1.85)
      const width = live.width / zoom
      const height = live.height / zoom
      const to: Viewport = {
        zoom,
        x: clamp(target.x - width / 2, 0, Math.max(0, live.width - width)),
        y: clamp(target.y - height / 2, 0, Math.max(0, live.height - height)),
      }
      if (Math.abs(from.x - to.x) < 8 && Math.abs(from.y - to.y) < 8 && Math.abs(from.zoom - to.zoom) < 0.03) return resolve()
      const started = performance.now()
      const frame = (now: number) => {
        if (playbackRun.current !== runId) return resolve()
        const raw = Math.min(1, (now - started) / duration)
        const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
        const next = {
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
          zoom: from.zoom + (to.zoom - from.zoom) * eased,
        }
        viewportRef.current = next
        setViewport(next)
        if (raw < 1) window.requestAnimationFrame(frame)
        else resolve()
      }
      window.requestAnimationFrame(frame)
    })

    const livePlaybackBox = (box: CanvasNode | CanvasNote): CanvasNode | CanvasNote => {
      const point = playbackPositions.get(box.id)
      return point ? { ...box, x: point.x, y: point.y } : box
    }

    const enterRegion = async (regionKey: string, previousRegionKey?: string) => {
      const nextRegion = regionByKey.get(regionKey)
      if (!nextRegion) return
      const previousRegion = previousRegionKey ? regionByKey.get(previousRegionKey) : undefined
      if (previousRegion && previousRegion.key !== nextRegion.key) {
        setPlayback((current) => current ? {
          ...current,
          phase: 'transitioning',
          intent: `完成 ${previousRegion.label}`,
          toolHint: 'select',
          activeRegionIds: previousRegion.elementIds,
        } : current)
        await moveCamera(previousRegion.center, 180 * pace, 0.9)
        if (!isActiveRun()) return
        await sleep(100 * pace)
        if (!isActiveRun()) return
      }
      const regionZoom = clamp(Math.min(
        parsed.scene!.width / Math.max(540, nextRegion.width + 420),
        parsed.scene!.height / Math.max(360, nextRegion.height + 300),
      ), 1.02, 1.55)
      setPlayback((current) => current ? {
        ...current,
        phase: 'planning',
        intent: `进入 ${nextRegion.label}`,
        regionLabel: nextRegion.label,
        regionIndex: nextRegion.index + 1,
        totalRegions: plan.regions.length,
        activeRegionIds: nextRegion.elementIds,
        toolHint: 'select',
      } : current)
      await moveCamera(nextRegion.center, 300 * pace, regionZoom)
      if (!isActiveRun()) return
      await sleep(90 * pace)
      if (!isActiveRun()) return
    }

    const typeText = async (id: string, text: string, fromText = '') => {
      if (!text || text === fromText) return
      setPlayback((current) => current ? {
        ...current,
        phase: 'typing',
        typing: { id, text: fromText },
        toolHint: 'select',
        intent: `输入 ${truncate(text, 22)}`,
      } : current)
      const prefix = commonPrefixLength(fromText, text)
      const start = fromText.slice(0, prefix)
      const tail = text.slice(prefix)
      const chunks = Math.min(pace < 0.5 ? 8 : pace < 0.8 ? 14 : 24, Math.max(1, tail.length))
      for (let index = 1; index <= chunks; index += 1) {
        if (playbackRun.current !== runId) return
        const end = Math.ceil((tail.length * index) / chunks)
        setPlayback((current) => current ? { ...current, typing: { id, text: start + tail.slice(0, end) } } : current)
        await sleep(Math.max(10, Math.min(44, (360 * pace) / chunks)))
      }
      if (!isActiveRun()) return
      setPlayback((current) => current ? { ...current, typing: undefined } : current)
    }

    const dragBoxToFinal = (id: string, before: CanvasNode | CanvasNote, after: CanvasNode | CanvasNote) => new Promise<void>((resolve) => {
      if (before.x === after.x && before.y === after.y) return resolve()
      const from = { x: before.x, y: before.y }
      const to = { x: after.x, y: after.y }
      const started = performance.now()
      const duration = 420 * pace
      setPlayback((current) => current ? {
        ...current,
        phase: 'arranging',
        toolHint: 'select',
        clicking: true,
        positionOverrides: { ...(current.positionOverrides ?? {}), [id]: from },
      } : current)
      const frame = (now: number) => {
        if (playbackRun.current !== runId) return resolve()
        const raw = Math.min(1, (now - started) / duration)
        const eased = 1 - Math.pow(1 - raw, 3)
        const point = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased }
        playbackCursor.current = { x: point.x + after.width / 2, y: point.y + after.height / 2 }
        setPlayback((current) => current ? {
          ...current,
          cursor: playbackCursor.current,
          positionOverrides: { ...(current.positionOverrides ?? {}), [id]: point },
        } : current)
        if (raw < 1) window.requestAnimationFrame(frame)
        else {
          setPlayback((current) => {
            if (!current) return current
            const next = { ...(current.positionOverrides ?? {}) }
            delete next[id]
            return { ...current, clicking: false, positionOverrides: next }
          })
          playbackPositions.delete(id)
          resolve()
        }
      }
      window.requestAnimationFrame(frame)
    })

    const animateSelection = async (ids: string[], intent: string) => {
      const bounds = playbackBoundsForIds(parsed.scene!, ids, playbackPositions)
      if (!bounds) return
      const start = { x: Math.max(0, bounds.x - 18), y: Math.max(0, bounds.y - 18) }
      const end = { x: Math.min(parsed.scene!.width, bounds.x + bounds.width + 18), y: Math.min(parsed.scene!.height, bounds.y + bounds.height + 18) }
      await moveCamera({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, 220 * pace, 1.12)
      if (!isActiveRun()) return
      await moveCursor(start, 180 * pace)
      if (!isActiveRun()) return
      setPlayback((current) => current ? {
        ...current,
        phase: 'selecting',
        intent,
        toolHint: 'select',
        clicking: true,
        selectionBox: { x: start.x, y: start.y, width: 0, height: 0 },
      } : current)
      const started = performance.now()
      await new Promise<void>((resolve) => {
        const duration = 320 * pace
        const frame = (now: number) => {
          if (playbackRun.current !== runId) return resolve()
          const raw = Math.min(1, (now - started) / Math.max(80, duration))
          const eased = 1 - Math.pow(1 - raw, 3)
          const cursor = { x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased }
          playbackCursor.current = cursor
          setPlayback((current) => current ? {
            ...current,
            cursor,
            selectionBox: { x: start.x, y: start.y, width: cursor.x - start.x, height: cursor.y - start.y },
          } : current)
          if (raw < 1) window.requestAnimationFrame(frame)
          else resolve()
        }
        window.requestAnimationFrame(frame)
      })
      if (!isActiveRun()) return
      setPlayback((current) => current ? { ...current, clicking: false } : current)
      await sleep(90 * pace)
      if (!isActiveRun()) return
    }

    const arrangeRegion = async (ids: string[], regionLabel: string) => {
      if (!ids.length) return
      await animateSelection(ids, `框选 ${regionLabel} 节点`)
      if (!isActiveRun()) return
      setPlayback((current) => current ? {
        ...current,
        phase: 'arranging',
        intent: `整理 ${regionLabel} 布局`,
        toolHint: 'select',
      } : current)
      for (const id of ids) {
        const after = parsed.scene!.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === id)
        if (!after) continue
        const point = playbackPositions.get(id)
        if (!point || (Math.abs(point.x - after.x) < 1 && Math.abs(point.y - after.y) < 1)) continue
        const before = { ...after, x: point.x, y: point.y }
        await moveCursor(center(before), 100 * pace)
        if (!isActiveRun()) return
        await dragBoxToFinal(id, before, after)
        if (!isActiveRun()) return
      }
      setPlayback((current) => current ? { ...current, selectionBox: undefined } : current)
      await sleep(80 * pace)
      if (!isActiveRun()) return
    }

    const drawBoundary = async (groupId: string, regionLabel: string, beforeRect?: { x: number; y: number; width: number; height: number }) => {
      const frame = canvasGroupFrames(parsed.scene!).find((group) => group.id === groupId)
      if (!frame) return
      await animateSelection(frame.memberIds, `框选 ${regionLabel} 成员`)
      if (!isActiveRun()) return
      const finalRect = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      const initialRect = beforeRect ?? { x: frame.x, y: frame.y, width: 0, height: 0 }
      const startHandle = beforeRect
        ? { x: beforeRect.x + beforeRect.width, y: beforeRect.y + beforeRect.height }
        : { x: frame.x, y: frame.y }
      const endHandle = { x: frame.x + frame.width, y: frame.y + frame.height }
      await moveCursor(startHandle, 120 * pace)
      if (!isActiveRun()) return
      setPlayback((current) => current ? {
        ...current,
        phase: 'grouping',
        intent: `${beforeRect ? '调整' : '创建'} ${regionLabel} 边界`,
        clicking: true,
        boundaryDraft: { ...initialRect, label: frame.label },
      } : current)
      const started = performance.now()
      await new Promise<void>((resolve) => {
        const duration = 340 * pace
        const tick = (now: number) => {
          if (playbackRun.current !== runId) return resolve()
          const raw = Math.min(1, (now - started) / Math.max(90, duration))
          const eased = 1 - Math.pow(1 - raw, 3)
          const cursor = { x: startHandle.x + (endHandle.x - startHandle.x) * eased, y: startHandle.y + (endHandle.y - startHandle.y) * eased }
          playbackCursor.current = cursor
          setPlayback((current) => current ? {
            ...current,
            cursor,
            boundaryDraft: {
              x: initialRect.x + (finalRect.x - initialRect.x) * eased,
              y: initialRect.y + (finalRect.y - initialRect.y) * eased,
              width: initialRect.width + (finalRect.width - initialRect.width) * eased,
              height: initialRect.height + (finalRect.height - initialRect.height) * eased,
              label: frame.label,
            },
          } : current)
          if (raw < 1) window.requestAnimationFrame(tick)
          else resolve()
        }
        window.requestAnimationFrame(tick)
      })
      if (!isActiveRun()) return
      setPlayback((current) => current ? {
        ...current,
        clicking: false,
        boundaryDraft: undefined,
        selectionBox: undefined,
        visibleGroupIds: [...new Set([...(current.visibleGroupIds ?? []), groupId])],
        groupFrameOverrides: removeRecordKey(current.groupFrameOverrides, groupId),
      } : current)
      await sleep(100 * pace)
      if (!isActiveRun()) return
    }

    const previewStyle = async (id: string, rows: Array<{ label: string; value: string }>) => {
      if (!rows.length) return
      const box = parsed.scene!.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === id)
      if (!box) return
      await moveCursor(center(livePlaybackBox(box)), 150 * pace)
      if (!isActiveRun()) return
      setPlayback((current) => current ? {
        ...current,
        currentElementId: id,
        phase: 'styling',
        intent: `调整 ${truncate(box.text, 18)} 属性`,
        toolHint: 'select',
        inspectorPreview: { title: box.text, rows, activeIndex: 0 },
      } : current)
      for (let index = 0; index < rows.length; index += 1) {
        if (playbackRun.current !== runId) return
        const dropdown = ['语义色', '形状', '角色', '技术栈', 'C4'].includes(rows[index].label)
        setPlayback((current) => current?.inspectorPreview ? {
          ...current,
          intent: `设置 ${rows[index].label} · ${rows[index].value}`,
          inspectorPreview: { ...current.inspectorPreview, activeIndex: index },
          inspectorDropdownOpen: dropdown,
          clicking: true,
        } : current)
        await sleep(90 * pace)
        if (!isActiveRun()) return
        setPlayback((current) => current ? { ...current, clicking: false } : current)
        await sleep((dropdown ? 150 : 80) * pace)
        if (!isActiveRun()) return
        setPlayback((current) => current ? { ...current, inspectorDropdownOpen: false } : current)
      }
      setPlayback((current) => current ? { ...current, inspectorPreview: undefined, inspectorDropdownOpen: false, currentElementId: undefined } : current)
      await sleep(60 * pace)
      if (!isActiveRun()) return
    }

    void (async () => {
      await sleep(140 * pace)
      let activeRegionKey: string | undefined
      for (let index = 0; index < plan.actions.length; index += 1) {
        if (playbackRun.current !== runId) return
        const action = plan.actions[index]
        if (action.regionKey !== activeRegionKey) {
          await enterRegion(action.regionKey, activeRegionKey)
          if (!isActiveRun()) return
          activeRegionKey = action.regionKey
        }
        if (action.kind === 'delete') {
          const deleted = action.element
          const ghostBoxes = [...plan.ghostElements, ...parsed.scene!.elements].filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
          const target = deleted.type !== 'arrow'
            ? center(deleted)
            : (() => {
                const from = ghostBoxes.find((item) => item.id === deleted.from)
                const to = ghostBoxes.find((item) => item.id === deleted.to)
                return from && to ? { x: (center(from).x + center(to).x) / 2, y: (center(from).y + center(to).y) / 2 } : null
              })()
          if (target) {
            await moveCamera(target, 220 * pace, 1.08)
            if (!isActiveRun()) return
            await moveCursor(target, 180 * pace)
            if (!isActiveRun()) return
          }
          const selection = deleted.type === 'arrow'
            ? undefined
            : { x: deleted.x - 10, y: deleted.y - 10, width: deleted.width + 20, height: deleted.height + 20 }
          setPlayback((current) => current ? {
            ...current,
            phase: 'selecting',
            toolHint: 'select',
            intent: playbackActionIntent(parsed.scene!, action),
            selectionBox: selection,
            deletingIds: [deleted.id],
            clicking: true,
            step: index + 1,
          } : current)
          await sleep(120 * pace)
          if (!isActiveRun()) return
          setPlayback((current) => current ? { ...current, clicking: false } : current)
          await sleep(160 * pace)
          if (!isActiveRun()) return
          setPlayback((current) => current ? {
            ...current,
            ghostElements: current.ghostElements?.filter((item) => item.id !== deleted.id),
            deletingIds: undefined,
            selectionBox: undefined,
          } : current)
          await sleep(70 * pace)
          if (!isActiveRun()) return
          continue
        }
        const target = playbackActionTarget(parsed.scene!, action)
        if (!target) continue
        await moveCamera(target, 260 * pace)
        if (!isActiveRun()) return
        if (action.kind === 'box') {
          const box = parsed.scene!.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === action.id)
          if (!box) continue
          const toolHint = action.added ? (box.type === 'note' ? 'note' : 'node') : 'select'
          setPlayback((current) => current ? {
            ...current,
            phase: action.added ? 'placing' : 'typing',
            toolHint,
            intent: playbackActionIntent(parsed.scene!, action),
          } : current)
          await moveCursor(target, 300 * pace)
          if (playbackRun.current !== runId) return
          if (action.added && action.rough) playbackPositions.set(action.id, action.rough)
          setPlayback((current) => current ? {
            ...current,
            visibleIds: action.added ? [...new Set([...current.visibleIds, action.id])] : current.visibleIds,
            currentElementId: action.id,
            clicking: true,
            typing: action.added ? { id: action.id, text: '' } : current.typing,
            positionOverrides: action.added && action.rough
              ? { ...(current.positionOverrides ?? {}), [action.id]: action.rough }
              : current.positionOverrides,
            toolHint,
            phase: action.added ? 'placing' : current.phase,
            step: index + 1,
          } : current)
          await sleep(100 * pace)
          if (!isActiveRun()) return
          setPlayback((current) => current ? { ...current, clicking: false } : current)
          await typeText(action.id, box.text, action.added ? '' : action.before?.text ?? box.text)
          if (!isActiveRun()) return
          if (action.before) {
            const hasStyleAction = plan.actions.some((candidate) => candidate.kind === 'style' && candidate.id === action.id)
            setPlayback((current) => {
              if (!current) return current
              if (!hasStyleAction) return { ...current, boxOverrides: removeRecordKey(current.boxOverrides, action.id) }
              return {
                ...current,
                boxOverrides: {
                  ...(current.boxOverrides ?? {}),
                  [action.id]: {
                    ...action.before!,
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                    text: box.text,
                  },
                },
              }
            })
          }
          await sleep((action.added ? 120 : 80) * pace)
          if (!isActiveRun()) return
        } else if (action.kind === 'arrange') {
          const region = regionByKey.get(action.regionKey)
          setPlayback((current) => current ? { ...current, step: index + 1 } : current)
          await arrangeRegion(action.ids, region?.label ?? '当前区域')
          if (!isActiveRun()) return
        } else if (action.kind === 'boundary') {
          const region = regionByKey.get(action.regionKey)
          setPlayback((current) => current ? { ...current, step: index + 1 } : current)
          await drawBoundary(action.groupId, region?.label ?? '当前区域', action.beforeRect)
          if (!isActiveRun()) return
        } else if (action.kind === 'style') {
          setPlayback((current) => current ? { ...current, step: index + 1 } : current)
          await previewStyle(action.id, action.rows)
          if (!isActiveRun()) return
          setPlayback((current) => current ? { ...current, boxOverrides: removeRecordKey(current.boxOverrides, action.id) } : current)
        } else {
          const arrow = parsed.scene!.elements.find((item): item is CanvasArrow => item.type === 'arrow' && item.id === action.id)
          const from = arrow ? parsed.scene!.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === arrow.from) : undefined
          const to = arrow ? parsed.scene!.elements.find((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && item.id === arrow.to) : undefined
          if (!arrow || !from || !to) continue
          const fromDisplay = livePlaybackBox(from)
          const toDisplay = livePlaybackBox(to)
          const fromAnchorPoint = anchorPoint(fromDisplay, arrow.fromAnchor, center(toDisplay))
          const toAnchorPoint = anchorPoint(toDisplay, arrow.toAnchor, center(fromDisplay))
          const previewPath = canvasArrowPath(fromAnchorPoint, toAnchorPoint, arrow)
          setPlayback((current) => current ? {
            ...current,
            phase: 'connecting',
            toolHint: 'connect',
            intent: playbackActionIntent(parsed.scene!, action),
            anchorPreview: { from: fromAnchorPoint, to: toAnchorPoint, path: previewPath, active: 'from' },
          } : current)
          await moveCursor(fromAnchorPoint, 190 * pace)
          if (!isActiveRun()) return
          setPlayback((current) => current ? {
            ...current,
            visibleIds: action.added ? [...new Set([...current.visibleIds, action.id])] : current.visibleIds,
            arrowOverrides: removeRecordKey(current.arrowOverrides, action.id),
            drawingArrowId: action.id,
            currentElementId: undefined,
            clicking: true,
            step: index + 1,
          } : current)
          await sleep(90 * pace)
          if (!isActiveRun()) return
          setPlayback((current) => current ? { ...current, clicking: false, anchorPreview: current.anchorPreview ? { ...current.anchorPreview, active: 'to' } : undefined } : current)
          await moveCursor(toAnchorPoint, 360 * pace)
          if (!isActiveRun()) return
          setPlayback((current) => current ? { ...current, drawingArrowId: undefined, anchorPreview: undefined } : current)
          await sleep(90 * pace)
          if (!isActiveRun()) return
        }
      }
      if (playbackRun.current !== runId) return
      const changedIds = [...new Set(plan.actions.flatMap((action) => {
        if (action.kind === 'box' || action.kind === 'arrow' || action.kind === 'style') return [action.id]
        if (action.kind === 'arrange') return action.ids
        return []
      }))]
      setPlayback((current) => current ? {
        ...current,
        visibleIds: parsed.scene!.elements.map((item) => item.id),
        currentElementId: undefined,
        drawingArrowId: undefined,
        typing: undefined,
        positionOverrides: {},
        boxOverrides: {},
        arrowOverrides: {},
        groupFrameOverrides: {},
        selectionBox: undefined,
        boundaryDraft: undefined,
        inspectorPreview: undefined,
        inspectorDropdownOpen: false,
        ghostElements: [],
        deletingIds: undefined,
        anchorPreview: undefined,
        toolHint: 'select',
        phase: 'finishing',
        intent: '检查整体布局',
        regionLabel: '全图',
        regionIndex: plan.regions.length,
        totalRegions: plan.regions.length,
        activeRegionIds: undefined,
        finalHighlightIds: changedIds,
        step: current.total,
      } : current)
      await moveCamera({ x: parsed.scene!.width / 2, y: parsed.scene!.height / 2 }, 360 * pace, 1)
      if (!isActiveRun()) return
      viewportRef.current = { x: 0, y: 0, zoom: 1 }
      setViewport({ x: 0, y: 0, zoom: 1 })
      setPlayback((current) => current ? { ...current, intent: '确认最终结果' } : current)
      await sleep(180 * pace)
      if (!isActiveRun()) return
      await moveCursor({ x: Math.max(72, parsed.scene!.width - 92), y: 72 }, 260 * pace)
      if (!isActiveRun()) return
      setPlayback((current) => current ? { ...current, intent: '完成画板', cursorVisible: false } : current)
      await sleep(340 * pace)
      if (!isActiveRun()) return
      if (playbackRun.current === runId) {
        setPlayback(null)
        completePlayback()
      }
    })()
    return () => {
      playbackRun.current += 1
      completePlayback()
    }
    // playbackRequest.key is an event id; source/scene are intentionally read from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRequest?.key, playbackRequest?.path])

  const traceResult = useMemo(() => {
    if (!parsed.scene || !traceDirection) return null
    const seeds = selectedIds.filter((id) => parsed.scene!.elements.some((item) => item.type !== 'arrow' && item.id === id))
    return seeds.length ? traceCanvasGraph(parsed.scene, seeds, traceDirection, traceDepth) : null
  }, [parsed.scene, selectedIds, traceDepth, traceDirection])

  useEffect(() => {
    if (!parsed.scene || selectedIds.length === 0) {
      onSelectionChange?.(null)
      return
    }
    onSelectionChange?.({
      ids: selectedIds,
      elements: parsed.scene.elements.filter((item) => selectedIds.includes(item.id)),
      ...(traceResult && traceDirection ? { trace: { direction: traceDirection, depth: traceDepth, nodeIds: traceResult.nodeIds, arrowIds: traceResult.arrowIds } } : {}),
    })
  }, [onSelectionChange, parsed.scene, selectedIds, traceDepth, traceDirection, traceResult])

  if (!parsed.scene) {
    return <div className="canvas-invalid"><strong>自由画布无法渲染</strong><span>{parsed.error}</span><p>可以切到“源码”修复 JSON。</p></div>
  }

  const scene = parsed.scene
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const arrows = scene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const baseArchitectureProjection = playback?.active
    ? { scene, view: scene.architecture?.view ?? 'detail' as const, density: 'comfortable' as const, hiddenNodes: 0, hiddenArrows: 0 }
    : canvasArchitectureProjection(scene)
  const scopedArchitectureProjection = !playback?.active && architectureScope
    ? canvasArchitectureScopeProjection(scene, architectureScope)
    : null
  const architectureProjection = scopedArchitectureProjection
    ? {
        ...baseArchitectureProjection,
        scene: scopedArchitectureProjection.scene,
        hiddenNodes: scopedArchitectureProjection.hiddenNodes,
        hiddenArrows: scopedArchitectureProjection.hiddenArrows,
      }
    : baseArchitectureProjection
  const renderScene = architectureProjection.scene
  const architectureBreadcrumbs = scopedArchitectureProjection?.breadcrumbs ?? []
  const projectedBoxes = renderScene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const projectedArrows = renderScene.elements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const selected = scene.elements.filter((item) => selectedIds.includes(item.id))
  const selectedSingle = selected.length === 1 ? selected[0] : null
  const selectedBox = selectedSingle && selectedSingle.type !== 'arrow' ? selectedSingle : null
  const selectedBoxes = selected.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const selectedLocked = selectedBoxes.filter((item) => item.locked)
  const selectedGroupIds = [...new Set(selectedBoxes.map((item) => item.groupId).filter((value): value is string => Boolean(value)))]
  const groupBounds = canvasGroupFrames(scene)
  const projectedGroupBounds = canvasGroupFrames(renderScene)
  const displayGroupBounds = projectedGroupBounds.map((group) => playback?.groupFrameOverrides?.[group.id] ?? group)
  const selectedGroupId = selectedGroupTarget ?? (selectedGroupIds.length === 1 ? selectedGroupIds[0] : undefined)
  const selectedGroup = selectedGroupId
    ? scene.groups?.find((group) => group.id === selectedGroupId) ?? { id: selectedGroupId, label: selectedGroupId, tone: 'muted' as CanvasTone }
    : undefined
  const collapsedOwners = canvasCollapsedOwners(renderScene)
  const collapsedMemberIds = new Set(collapsedOwners.keys())
  const renderBoxes = projectedBoxes.filter((item) => !collapsedMemberIds.has(item.id))
  const renderArrows = projectedArrows.filter((arrow) => !collapsedMemberIds.has(arrow.from) && !collapsedMemberIds.has(arrow.to))
  const largeSceneViewportCulling = Boolean(
    !playback?.active
    && !architectureScope
    && scene.architecture
    && architectureProjection.view === 'detail'
    && renderBoxes.length > 100,
  )
  const viewportMargin = 220 / Math.max(0.45, viewport.zoom)
  const viewportBounds = {
    x: viewport.x - viewportMargin,
    y: viewport.y - viewportMargin,
    width: scene.width / viewport.zoom + viewportMargin * 2,
    height: scene.height / viewport.zoom + viewportMargin * 2,
  }
  const viewportRenderBoxes = largeSceneViewportCulling
    ? renderBoxes.filter((item) => selectedIds.includes(item.id) || intersects(viewportBounds, item))
    : renderBoxes
  const viewportNodeIds = new Set(viewportRenderBoxes.map((item) => item.id))
  const viewportRenderArrows = largeSceneViewportCulling
    ? renderArrows.filter((arrow) => selectedIds.includes(arrow.id) || viewportNodeIds.has(arrow.from) || viewportNodeIds.has(arrow.to))
    : renderArrows
  const playbackVisibleIds = playback?.active ? new Set(playback.visibleIds) : null
  const playbackVisibleGroupIds = playback?.active ? new Set(playback.visibleGroupIds ?? []) : null
  const visibleRenderBoxes = playbackVisibleIds ? viewportRenderBoxes.filter((item) => playbackVisibleIds.has(item.id)) : viewportRenderBoxes
  const visibleRenderArrows = playbackVisibleIds ? viewportRenderArrows.filter((item) => playbackVisibleIds.has(item.id)) : viewportRenderArrows
  const collapsedConnections = playback?.active ? [] : canvasCollapsedConnections(renderScene, projectedGroupBounds)
  const relationBundleTrunks = playback?.active ? [] : canvasBundleTrunks(renderScene)
  const relationLabelLayouts = canvasArrowLabelLayouts(renderScene)
  const architectureHeader = canvasArchitectureHeader(scene)
  const architectureLegendStart = architectureHeader
    ? Math.max(scene.width * 0.56, scene.width - architectureHeader.legend.length * 92 - 34)
    : 0
  const selectedLane = selectedBox?.laneId ? scene.lanes?.find((lane) => lane.id === selectedBox.laneId) : undefined
  const layerNeedle = layerQuery.trim().toLocaleLowerCase()
  const layerBoxes = layerNeedle
    ? boxes.filter((item) => [item.text, item.subtitle, item.description, ...(item.tags ?? []), ...(item.sourcePaths ?? [])].some((value) => value?.toLocaleLowerCase().includes(layerNeedle)))
    : boxes
  const tracedNodeIds = new Set(traceResult?.nodeIds ?? [])
  const tracedArrowIds = new Set(traceResult?.arrowIds ?? [])
  const activePlaybackRegionIds = new Set(playback?.activeRegionIds ?? [])
  const playbackGhostElements = playback?.ghostElements ?? []
  const playbackGhostBoxes = playbackGhostElements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const playbackGhostArrows = playbackGhostElements.filter((item): item is CanvasArrow => item.type === 'arrow')
  const playbackBoxLookup = new Map<string, CanvasNode | CanvasNote>([...boxes, ...playbackGhostBoxes].map((item) => [item.id, item]))
  const playbackBubbleWidth = playback?.intent ? clamp(92 + playback.intent.length * 6.5, 126, 260) : 0

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

  function beautifyArchitecture() {
    const current = currentScene()
    const result = beautifyArchitectureScene(current, {
      theme: architectureTheme,
      view: architectureView,
      density: architectureDensity,
    })
    commit(result.scene)
    setSelectedIds([])
    setSelectedGroupTarget(null)
    setViewport({ x: 0, y: 0, zoom: 1 })
  }

  function tidyArchitectureRoutes() {
    commit(routeArchitectureEdges(currentScene()))
  }

  function updateArchitectureAppearance(patch: { view?: CanvasArchitectureView; density?: CanvasArchitectureDensity }) {
    const current = currentScene()
    commit({
      ...current,
      architecture: {
        theme: current.architecture?.theme ?? architectureTheme,
        ...(current.architecture?.presentation ? { presentation: true } : {}),
        view: patch.view ?? current.architecture?.view ?? architectureView,
        density: patch.density ?? current.architecture?.density ?? architectureDensity,
      },
    })
  }

  function applyArchitectureDensity(density: CanvasArchitectureDensity) {
    const result = beautifyArchitectureScene(currentScene(), {
      theme: architectureTheme,
      view: architectureView,
      density,
    })
    setArchitectureDensity(density)
    commit(result.scene)
    setSelectedIds([])
    setSelectedGroupTarget(null)
    setViewport({ x: 0, y: 0, zoom: 1 })
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
    setSelectedGroupTarget(grouped.groupId)
    setSelectedIds(expandCanvasGroupSelection(grouped.scene, selectedIds))
  }

  function ungroupSelection() {
    commit(ungroupCanvasSelection(currentScene(), selectedIds))
    setSelectedGroupTarget(null)
  }

  function updateSelectedGroup(patch: Partial<Omit<CanvasGroup, 'id'>>) {
    if (!selectedGroupId) return
    commit(updateCanvasGroup(currentScene(), selectedGroupId, patch))
  }

  function toggleSelectedGroupCollapsed() {
    if (!selectedGroup) return
    updateSelectedGroup({ collapsed: !selectedGroup.collapsed })
  }

  function applyLanePreset(axis: 'horizontal' | 'vertical') {
    commit(createCanvasLanePreset(currentScene(), axis, 3))
  }

  function insertArchitectureTemplate(template: CanvasArchitectureTemplate) {
    const result = insertCanvasArchitectureTemplate(currentScene(), template)
    commit(result.scene)
    setSelectedIds(result.selectedIds)
  }

  function removeLanes() {
    commit(clearCanvasLanes(currentScene()))
  }

  function assignSelectionLane(laneId?: string) {
    commit(assignCanvasSelectionToLane(currentScene(), selectedIds, laneId))
  }

  function applyLayout(mode: CanvasLayoutMode) {
    commit(layoutCanvasScene(currentScene(), mode, GRID))
    fit()
  }

  function applyLocalLayout(mode: CanvasLayoutMode) {
    const ids = selectedGroupId
      ? groupBounds.find((group) => group.id === selectedGroupId)?.memberIds ?? selectedIds
      : selectedIds
    if (ids.length < 2) return
    commit(layoutCanvasSelection(currentScene(), ids, mode, GRID))
    focusBoxes(ids)
  }

  function selectGroup(groupId: string) {
    const frame = groupBounds.find((group) => group.id === groupId)
    if (!frame) return
    setSelectedGroupTarget(groupId)
    setSelectedIds(frame.memberIds)
    focusBoxes(frame.memberIds)
  }

  function focusBoxes(ids: string[]) {
    const live = currentScene()
    const targets = live.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && ids.includes(item.id))
    if (!targets.length) return
    const left = Math.min(...targets.map((item) => item.x))
    const top = Math.min(...targets.map((item) => item.y))
    const right = Math.max(...targets.map((item) => item.x + item.width))
    const bottom = Math.max(...targets.map((item) => item.y + item.height))
    const width = Math.max(280, right - left + 200)
    const height = Math.max(180, bottom - top + 160)
    const zoom = clamp(Math.min(live.width / width, live.height / height), 0.8, 2.6)
    const viewWidth = live.width / zoom
    const viewHeight = live.height / zoom
    setViewport({
      zoom,
      x: clamp((left + right) / 2 - viewWidth / 2, 0, Math.max(0, live.width - viewWidth)),
      y: clamp((top + bottom) / 2 - viewHeight / 2, 0, Math.max(0, live.height - viewHeight)),
    })
  }

  function enterArchitectureScope(scope: CanvasArchitectureScope) {
    const projected = canvasArchitectureScopeProjection(currentScene(), scope)
    setArchitectureScope(scope)
    setSelectedGroupTarget(null)
    setSelectedIds(scope.kind === 'node' ? [scope.id] : [])
    setTraceDirection(null)
    focusArchitectureScene(projected.scene)
  }

  function leaveArchitectureScope() {
    setArchitectureScope(null)
    setSelectedGroupTarget(null)
    setSelectedIds([])
    setViewport({ x: 0, y: 0, zoom: 1 })
  }

  function focusArchitectureScene(projected: CanvasScene) {
    const collapsed = canvasCollapsedOwners(projected)
    const boxes = projected.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && !collapsed.has(item.id))
    const collapsedFrames = canvasGroupFrames(projected).filter((group) => group.collapsed)
    const rects = [
      ...boxes.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height })),
      ...collapsedFrames.map((group) => ({ x: group.x, y: group.y, width: group.width, height: group.height })),
    ]
    if (!rects.length) {
      setViewport({ x: 0, y: 0, zoom: 1 })
      return
    }
    const left = Math.min(...rects.map((item) => item.x))
    const top = Math.min(...rects.map((item) => item.y))
    const right = Math.max(...rects.map((item) => item.x + item.width))
    const bottom = Math.max(...rects.map((item) => item.y + item.height))
    const width = Math.max(360, right - left + 220)
    const height = Math.max(240, bottom - top + 190)
    const live = currentScene()
    const zoom = clamp(Math.min(live.width / width, live.height / height), 0.65, 2.3)
    const viewWidth = live.width / zoom
    const viewHeight = live.height / zoom
    setViewport({
      zoom,
      x: clamp((left + right) / 2 - viewWidth / 2, 0, Math.max(0, live.width - viewWidth)),
      y: clamp((top + bottom) / 2 - viewHeight / 2, 0, Math.max(0, live.height - viewHeight)),
    })
  }

  function revealAndFocus(ids: string[]) {
    const live = currentScene()
    const groups = new Map((live.groups ?? []).map((group) => [group.id, group]))
    const expand = new Set<string>()
    live.elements.forEach((item) => {
      if (item.type === 'arrow' || !ids.includes(item.id) || !item.groupId) return
      let groupId: string | undefined = item.groupId
      const seen = new Set<string>()
      while (groupId && !seen.has(groupId)) {
        seen.add(groupId)
        const group = groups.get(groupId)
        if (!group) break
        if (group.collapsed) expand.add(group.id)
        groupId = group.parentId
      }
    })
    if (expand.size) {
      commit({
        ...live,
        groups: live.groups?.map((group) => expand.has(group.id) ? { ...group, collapsed: undefined } : group),
      })
    }
    setSelectedGroupTarget(null)
    setSelectedIds(ids)
    focusBoxes(ids)
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
    setSelectedGroupTarget(null)
    if (!selectedIds.includes(id)) setSelectedIds([id])
    const surface = editorRef.current?.getBoundingClientRect()
    setContextMenu({ x: event.clientX - (surface?.left ?? 0), y: event.clientY - (surface?.top ?? 0) })
  }

  function handleBoxClick(id: string, event: React.MouseEvent<SVGGElement>) {
    setSelectedGroupTarget(null)
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
    setSelectedGroupTarget(null)
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
    setSelectedGroupTarget(null)
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
  const playbackBubbleOffsetX = playback?.intent && playback.cursor.x > viewport.x + viewWidth * 0.7
    ? -playbackBubbleWidth - 24
    : 26
  const playbackBubbleOffsetY = playback?.intent && playback.cursor.y < viewport.y + viewHeight * 0.14 ? 40 : -32

  function playbackBoxPosition(item: CanvasNode | CanvasNote): CanvasNode | CanvasNote {
    const presentation = playback?.boxOverrides?.[item.id] ?? item
    const position = playback?.positionOverrides?.[item.id]
    return position ? { ...presentation, x: position.x, y: position.y } : presentation
  }

  return (
    <div ref={editorRef} className={`freeform-editor architecture-view-${architectureProjection.view} architecture-density-${architectureProjection.density}`} tabIndex={0} aria-label="自由画布编辑器">
      <div className="freeform-surface">
        <div className="freeform-floating-toolbar" aria-label="自由画布工具">
          <ToolButton active={tool === 'select' || playback?.toolHint === 'select'} title="选择 (V)" onClick={() => { setTool('select'); setConnectFrom(null) }}>选择</ToolButton>
          <ToolButton active={tool === 'hand'} title="平移 (H / Space)" onClick={() => { setTool('hand'); setConnectFrom(null) }}>抓手</ToolButton>
          <span className="freeform-toolbar-separator" />
          <ToolButton active={tool === 'node' || playback?.toolHint === 'node'} title="节点 (N)" onClick={() => { setTool('node'); setConnectFrom(null) }}>节点</ToolButton>
          <ToolButton active={tool === 'note' || playback?.toolHint === 'note'} title="备注 (T)" onClick={() => { setTool('note'); setConnectFrom(null) }}>备注</ToolButton>
          <ToolButton active={tool === 'connect' || playback?.toolHint === 'connect'} title="连接 (C)" onClick={() => { setTool('connect'); setConnectFrom(null) }}>连接</ToolButton>
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
          <select
            className="freeform-layout-select"
            aria-label="泳道"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value
              if (value === 'horizontal') applyLanePreset('horizontal')
              if (value === 'vertical') applyLanePreset('vertical')
              if (value === 'clear') removeLanes()
              event.currentTarget.value = ''
            }}
          >
            <option value="">泳道</option>
            <option value="horizontal">水平泳道</option>
            <option value="vertical">垂直泳道</option>
            {scene.lanes?.length ? <option value="clear">移除泳道</option> : null}
          </select>
          <select
            className="freeform-layout-select"
            aria-label="架构模板"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value as CanvasArchitectureTemplate | ''
              if (value) insertArchitectureTemplate(value)
              event.currentTarget.value = ''
            }}
          >
            <option value="">模板</option>
            <option value="web-service">Web / API / Service</option>
            <option value="event-driven">事件驱动</option>
            <option value="cache-aside">Cache Aside</option>
          </select>
          <select
            className="freeform-layout-select"
            aria-label="架构主题"
            value={architectureTheme}
            onChange={(event) => setArchitectureTheme(event.target.value as ArchitectureTheme)}
          >
            <option value="enterprise">企业架构</option>
            <option value="technical">技术文档</option>
            <option value="presentation">汇报展示</option>
          </select>
          <select
            className="freeform-layout-select"
            aria-label="架构视图"
            value={architectureView}
            onChange={(event) => {
              const value = event.target.value as CanvasArchitectureView
              setArchitectureView(value)
              updateArchitectureAppearance({ view: value })
              setSelectedIds([])
              setSelectedGroupTarget(null)
            }}
          >
            <option value="detail">详情视图</option>
            <option value="overview">总览视图</option>
          </select>
          <select
            className="freeform-layout-select"
            aria-label="架构密度"
            value={architectureDensity}
            onChange={(event) => {
              const value = event.target.value as CanvasArchitectureDensity
              applyArchitectureDensity(value)
            }}
          >
            <option value="auto">密度 · 自动</option>
            <option value="comfortable">密度 · 舒适</option>
            <option value="compact">密度 · 紧凑</option>
            <option value="dense">密度 · 高密</option>
          </select>
          <button type="button" title="自动分区、配色、补图标并整理连线" onClick={beautifyArchitecture}>美化</button>
          <button type="button" title="保留节点位置，仅重新计算锚点、避障路径和线路通道" onClick={tidyArchitectureRoutes}>理线</button>
          {architectureScope ? <button type="button" className="is-active" title="返回完整架构视图" onClick={leaveArchitectureScope}>退出聚焦</button> : null}
          <button type="button" className={layersOpen ? 'is-active' : ''} aria-pressed={layersOpen} onClick={() => setLayersOpen((value) => !value)}>层级</button>
          {onAnalyzeGitImpact ? <button type="button" title="将当前 Git 改动映射到架构节点" onClick={() => void onAnalyzeGitImpact()}>改动影响</button> : null}
          <span className="freeform-toolbar-separator" />
          <button type="button" title="撤销 ⌘Z" aria-label="撤销" disabled={undoStack.current.length === 0} onClick={undo}>↶</button>
          <button type="button" title="重做 ⇧⌘Z" aria-label="重做" disabled={redoStack.current.length === 0} onClick={redo}>↷</button>
        </div>

        {architectureScope ? (
          <nav className="freeform-architecture-breadcrumb" aria-label="架构导航路径">
            <button type="button" onClick={leaveArchitectureScope}>全局</button>
            {architectureBreadcrumbs.map((item, index) => (
              <span key={`${item.kind}:${item.id}`}>
                <i>/</i>
                <button
                  type="button"
                  className={index === architectureBreadcrumbs.length - 1 ? 'is-current' : ''}
                  onClick={() => enterArchitectureScope({ kind: item.kind, id: item.id, ...(item.kind === 'node' ? { depth: architectureScope.depth ?? 1 } : {}) })}
                >{truncate(item.label, 26)}</button>
              </span>
            ))}
            {architectureScope.kind === 'node' ? (
              <span className="freeform-focus-depth" aria-label="聚焦深度">
                {[1, 2, 3].map((depth) => (
                  <button
                    key={depth}
                    type="button"
                    className={(architectureScope.depth ?? 1) === depth ? 'is-current' : ''}
                    onClick={() => enterArchitectureScope({ kind: 'node', id: architectureScope.id, depth })}
                  >{depth} 跳</button>
                ))}
              </span>
            ) : null}
            <em>{visibleRenderBoxes.length} 节点 · {displayGroupBounds.filter((group) => group.collapsed).length} 区域 · {visibleRenderArrows.length} 关系</em>
          </nav>
        ) : null}
        {largeSceneViewportCulling ? (
          <div className="freeform-large-scene-hint">大图视窗渲染 · {visibleRenderBoxes.length}/{renderBoxes.length} 节点</div>
        ) : null}

        {layersOpen ? (
          <aside className="freeform-layer-panel" aria-label="画布层级与搜索">
            <div className="freeform-layer-head">
              <strong>层级</strong>
              <button type="button" onClick={() => setLayersOpen(false)}>关闭</button>
            </div>
            <input value={layerQuery} onChange={(event) => setLayerQuery(event.target.value)} placeholder="搜索节点、标签、源码" aria-label="搜索画布节点" />
            {(scene.groups ?? []).length ? (
              <section>
                <span>边界</span>
                {(scene.groups ?? [])
                  .filter((group) => !layerNeedle || [group.id, group.label, group.description, group.c4Type].some((value) => value?.toLocaleLowerCase().includes(layerNeedle)))
                  .map((group) => (
                    <button key={group.id} type="button" className={selectedGroupId === group.id ? 'is-active' : ''} style={{ paddingLeft: 8 + groupDepth(group.id, scene.groups ?? []) * 12 }} onClick={() => selectGroup(group.id)}>
                      <span>{group.collapsed ? '▸' : '▾'}</span>
                      <strong>{group.label || group.id}</strong>
                      <small>{group.c4Type ? c4Label(group.c4Type) : group.kind === 'boundary' ? 'Boundary' : 'Group'}</small>
                    </button>
                  ))}
              </section>
            ) : null}
            {(scene.lanes ?? []).length ? (
              <section>
                <span>泳道</span>
                {(scene.lanes ?? []).filter((lane) => !layerNeedle || lane.label.toLocaleLowerCase().includes(layerNeedle)).map((lane) => (
                  <button key={lane.id} type="button" onClick={() => {
                    const ids = boxes.filter((item) => item.laneId === lane.id).map((item) => item.id)
                    setSelectedGroupTarget(null)
                    setSelectedIds(ids)
                    focusBoxes(ids)
                  }}>
                    <strong>{lane.label}</strong><small>{lane.axis === 'horizontal' ? 'Horizontal' : 'Vertical'}</small>
                  </button>
                ))}
              </section>
            ) : null}
            <section>
              <span>节点 · {layerBoxes.length}</span>
              {layerBoxes.slice(0, 120).map((item) => (
                <button key={item.id} type="button" className={selectedIds.includes(item.id) ? 'is-active' : ''} onClick={() => revealAndFocus([item.id])}>
                  <strong>{item.text}</strong>
                  <small>{item.c4Type ? c4Label(item.c4Type) : item.stencil ? canvasStencilLabel(item.stencil) : item.icon ? canvasIconLabel(item.icon) : item.type}</small>
                </button>
              ))}
              {layerBoxes.length > 120 ? <em>只显示前 120 个结果，请继续缩小搜索范围。</em> : null}
            </section>
          </aside>
        ) : null}

        {selected.length > 0 ? (
          <div className={`freeform-inspector${detailsExpanded ? ' is-expanded' : ''}`} aria-label="选中元素属性">
            <div className="freeform-inspector-head">
              <strong>{selected.length === 1 ? elementLabel(selected[0]) : `${selected.length} 个元素`}</strong>
              <div>
                {scene.architecture && selectedBox ? <button type="button" title="只查看当前节点及邻域" onClick={() => enterArchitectureScope({ kind: 'node', id: selectedBox.id, depth: 1 })}>聚焦</button> : null}
                {scene.architecture && selectedGroupId ? <button type="button" title="进入当前边界查看内部结构" onClick={() => enterArchitectureScope({ kind: 'group', id: selectedGroupId })}>下钻</button> : null}
                {selectedBox || selectedGroup ? <button type="button" aria-pressed={detailsExpanded} onClick={() => setDetailsExpanded((value) => !value)}>{detailsExpanded ? '收起' : '详情'}</button> : null}
                <button type="button" title="删除" aria-label="删除选中元素" onClick={deleteSelected}>删除</button>
              </div>
            </div>
            {selectedBoxes.length ? (
              <div className="freeform-trace-tools" aria-label="关系追踪">
                <div>
                  <button type="button" className={traceDirection === 'upstream' ? 'is-active' : ''} onClick={() => setTraceDirection((value) => value === 'upstream' ? null : 'upstream')}>上游</button>
                  <button type="button" className={traceDirection === 'both' ? 'is-active' : ''} onClick={() => setTraceDirection((value) => value === 'both' ? null : 'both')}>邻域</button>
                  <button type="button" className={traceDirection === 'downstream' ? 'is-active' : ''} onClick={() => setTraceDirection((value) => value === 'downstream' ? null : 'downstream')}>下游</button>
                  <select aria-label="关系追踪深度" value={traceDepth} onChange={(event) => setTraceDepth(Number(event.target.value))}>
                    <option value={1}>1 跳</option>
                    <option value={2}>2 跳</option>
                    <option value={3}>3 跳</option>
                  </select>
                </div>
                {traceResult ? <span>{traceResult.nodeIds.length} 节点 · {traceResult.arrowIds.length} 关系</span> : null}
              </div>
            ) : null}
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
                  <span>C4 语义</span>
                  <select aria-label="C4 语义" disabled={selectedBox.locked} value={selectedBox.c4Type ?? ''} onChange={(event) => updateSelectedBoxes((item) => ({ ...item, c4Type: (event.target.value || undefined) as CanvasC4Type | undefined }))}>
                    <option value="">未指定</option>
                    <option value="person">Person</option>
                    <option value="software-system">Software System</option>
                    <option value="container">Container</option>
                    <option value="component">Component</option>
                  </select>
                </label>
                <label>
                  <span>节点角色</span>
                  <select aria-label="节点角色图标" disabled={selectedBox.locked} value={selectedBox.icon ?? ''} onChange={(event) => updateSelectedBoxes((item) => ({ ...item, icon: (event.target.value || undefined) as CanvasIcon | undefined }))}>
                    <option value="">无</option>
                    <option value="user">用户</option>
                    <option value="web">Web / 前端</option>
                    <option value="api">API / 网关</option>
                    <option value="gateway">网关 / Proxy</option>
                    <option value="service">服务</option>
                    <option value="worker">Worker / Processor</option>
                    <option value="database">数据库</option>
                    <option value="cache">缓存</option>
                    <option value="queue">消息队列</option>
                    <option value="search">搜索 / 索引</option>
                    <option value="vector">向量检索</option>
                    <option value="cloud">云 / 平台</option>
                    <option value="file">文件 / 对象</option>
                    <option value="auth">认证 / 身份</option>
                    <option value="ai">AI / 模型</option>
                    <option value="mcp">MCP</option>
                    <option value="scheduler">调度 / 定时</option>
                    <option value="external">外部系统</option>
                  </select>
                </label>
                <label>
                  <span>技术栈</span>
                  <select aria-label="节点技术栈" disabled={selectedBox.locked} value={selectedBox.stencil ?? ''} onChange={(event) => updateSelectedBoxes((item) => ({ ...item, stencil: (event.target.value || undefined) as CanvasStencil | undefined }))}>
                    <option value="">无</option>
                    <option value="spring">Spring</option>
                    <option value="react">React</option>
                    <option value="vue">Vue</option>
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="redis">Redis</option>
                    <option value="kafka">Kafka</option>
                    <option value="rabbitmq">RabbitMQ</option>
                    <option value="docker">Docker</option>
                    <option value="kubernetes">Kubernetes</option>
                    <option value="qdrant">Qdrant</option>
                    <option value="opensearch">OpenSearch</option>
                    <option value="elasticsearch">Elasticsearch</option>
                    <option value="mongodb">MongoDB</option>
                    <option value="minio">MinIO / S3</option>
                    <option value="nginx">Nginx</option>
                    <option value="grpc">gRPC</option>
                    <option value="oidc">OIDC</option>
                    <option value="openai">LLM / OpenAI-compatible</option>
                    <option value="mcp">MCP</option>
                  </select>
                </label>
                {detailsExpanded ? (
                  <>
                    <label>
                      <span>副标题</span>
                      <input aria-label="节点副标题" disabled={selectedBox.locked} value={selectedBox.subtitle ?? ''} placeholder="例如：Spring Boot 4" onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, subtitle: event.target.value || undefined })} />
                    </label>
                    <label>
                      <span>说明</span>
                      <textarea aria-label="节点说明" disabled={selectedBox.locked} value={selectedBox.description ?? ''} placeholder="职责、边界、风险或实现备注" onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, description: event.target.value || undefined })} />
                    </label>
                    <label>
                      <span>标签</span>
                      <input aria-label="节点标签" disabled={selectedBox.locked} value={selectedBox.tags?.join(', ') ?? ''} placeholder="核心, 外部, 异步" onChange={(event) => updateElement(selectedBox.id, (item) => item.type === 'arrow' || item.locked ? item : { ...item, tags: splitTags(event.target.value) })} />
                    </label>
                    {scene.lanes?.length ? (
                      <label>
                        <span>泳道</span>
                        <select aria-label="节点泳道" disabled={selectedBox.locked} value={selectedBox.laneId ?? ''} onChange={(event) => assignSelectionLane(event.target.value || undefined)}>
                          <option value="">未分配</option>
                          {scene.lanes.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}
                        </select>
                      </label>
                    ) : null}
                    {selectedLane ? (
                      <div className="freeform-lane-inspector">
                        <div className="freeform-section-caption">当前泳道</div>
                        <label><span>名称</span><input value={selectedLane.label} onChange={(event) => commit(updateCanvasLane(currentScene(), selectedLane.id, { label: event.target.value || selectedLane.label }))} /></label>
                        <label><span>色调</span><select value={selectedLane.tone ?? 'muted'} onChange={(event) => commit(updateCanvasLane(currentScene(), selectedLane.id, { tone: event.target.value as CanvasTone }))}><option value="default">默认</option><option value="accent">强调</option><option value="success">成功</option><option value="warning">警告</option><option value="danger">危险</option><option value="muted">弱化</option></select></label>
                      </div>
                    ) : null}
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
                  </>
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
                <label>
                  <span>边界类型</span>
                  <select aria-label="组合边界类型" value={selectedGroup.kind ?? 'group'} onChange={(event) => updateSelectedGroup({ kind: event.target.value as 'group' | 'boundary' })}>
                    <option value="group">普通容器</option>
                    <option value="boundary">系统边界</option>
                  </select>
                </label>
                <label>
                  <span>C4 层级</span>
                  <select aria-label="容器 C4 层级" value={selectedGroup.c4Type ?? ''} onChange={(event) => updateSelectedGroup({ c4Type: (event.target.value || undefined) as 'software-system' | 'container' | undefined })}>
                    <option value="">未指定</option>
                    <option value="software-system">Software System</option>
                    <option value="container">Container</option>
                  </select>
                </label>
                <label>
                  <span>父边界</span>
                  <select aria-label="父边界" value={selectedGroup.parentId ?? ''} onChange={(event) => {
                    if (!selectedGroupId) return
                    commit(setCanvasGroupParent(currentScene(), selectedGroupId, event.target.value || undefined))
                  }}>
                    <option value="">顶层</option>
                    {(scene.groups ?? []).filter((group) => group.id !== selectedGroup.id).map((group) => <option key={group.id} value={group.id}>{group.label || group.id}</option>)}
                  </select>
                </label>
                {detailsExpanded ? (
                  <label>
                    <span>边界说明</span>
                    <textarea aria-label="边界说明" value={selectedGroup.description ?? ''} placeholder="系统职责、边界约束或部署范围" onChange={(event) => updateSelectedGroup({ description: event.target.value || undefined })} />
                  </label>
                ) : null}
                <div className="freeform-align-row">
                  <button type="button" onClick={() => applyLocalLayout('horizontal')}>局部横向</button>
                  <button type="button" onClick={() => applyLocalLayout('vertical')}>局部纵向</button>
                </div>
                <button type="button" className="freeform-lock-button" onClick={toggleSelectedGroupCollapsed}>{selectedGroup.collapsed ? '展开容器' : '折叠容器'}</button>
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
                <div className="freeform-align-row">
                  <button type="button" onClick={() => applyLocalLayout('horizontal')}>局部横向</button>
                  <button type="button" onClick={() => applyLocalLayout('vertical')}>局部纵向</button>
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
          style={playback?.active ? { pointerEvents: 'none' } : undefined}
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
          {architectureHeader ? (
            <g className="freeform-architecture-header" pointerEvents="none">
              <rect width={scene.width} height={architectureHeader.height} />
              <path className="freeform-architecture-header-rule" d={`M 28 ${architectureHeader.height - 1} H ${scene.width - 28}`} />
              <text className="freeform-architecture-eyebrow" x="32" y="24">{architectureHeader.eyebrow}</text>
              <text className="freeform-architecture-title" x="32" y="52">{truncate(architectureHeader.title, 42)}</text>
              <text className="freeform-architecture-subtitle" x="32" y="72">{architectureHeader.subtitle}</text>
              {architectureHeader.legend.map((item, index) => {
                const x = architectureLegendStart + index * 92
                return (
                  <g key={item.kind} className={`freeform-architecture-legend kind-${item.kind}`} transform={`translate(${x} 50)`}>
                    <path d="M 0 0 H 26" />
                    <text x="34" y="4">{item.label}</text>
                  </g>
                )
              })}
            </g>
          ) : null}
          {(renderScene.lanes ?? []).map((lane) => {
            const x = lane.axis === 'vertical' ? lane.start : 0
            const y = lane.axis === 'horizontal' ? lane.start : architectureHeader?.height ?? 0
            const width = lane.axis === 'vertical' ? lane.size : scene.width
            const height = lane.axis === 'horizontal' ? lane.size : scene.height - (architectureHeader?.height ?? 0)
            return (
              <g key={lane.id} className={`freeform-lane tone-${lane.tone ?? 'muted'}`} pointerEvents="none">
                <rect className="freeform-lane-body" x={x} y={y} width={width} height={height} rx="14" />
                <rect
                  className="freeform-lane-head is-navigable"
                  x={x}
                  y={y}
                  width={width}
                  height={34}
                  rx="14"
                  pointerEvents="all"
                  onClick={(event) => {
                    event.stopPropagation()
                    const ids = boxes.filter((item) => item.laneId === lane.id).map((item) => item.id)
                    setSelectedGroupTarget(null)
                    setSelectedIds(ids)
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    if (scene.architecture) enterArchitectureScope({ kind: 'lane', id: lane.id })
                    else focusBoxes(boxes.filter((item) => item.laneId === lane.id).map((item) => item.id))
                  }}
                />
                <text x={x + 14} y={y + 22}>{truncate(lane.label, 32)}</text>
              </g>
            )
          })}
          {displayGroupBounds.filter((group) => (
            !groupHiddenByCollapsedAncestor(group.id, renderScene.groups ?? [])
            && (!playbackVisibleGroupIds || playbackVisibleGroupIds.has(group.id))
          )).map((group) => (
            <g
              key={group.id}
              className={`freeform-group-frame kind-${group.kind ?? 'group'} c4-${group.c4Type ?? 'none'}${group.parentId ? ' has-parent' : ''}${group.collapsed ? ' is-collapsed' : ''} tone-${group.tone ?? 'muted'}${selectedGroupId === group.id || selectedGroupIds.includes(group.id) ? ' is-selected' : ''}${traceResult ? group.memberIds.some((id) => tracedNodeIds.has(id)) ? ' is-traced' : ' is-trace-dimmed' : ''}${playback?.active && group.memberIds.some((id) => activePlaybackRegionIds.has(id)) ? ' is-ai-region-active' : ''}`}
              pointerEvents="none"
            >
              {group.description ? <title>{group.description}</title> : null}
              <rect
                x={group.x}
                y={group.y}
                width={group.width}
                height={group.height}
                rx="20"
                pointerEvents={group.collapsed ? 'all' : 'none'}
                onClick={group.collapsed ? (event) => { event.stopPropagation(); selectGroup(group.id) } : undefined}
                onDoubleClick={group.collapsed ? (event) => {
                  event.stopPropagation()
                  if (scene.architecture) enterArchitectureScope({ kind: 'group', id: group.id })
                  else {
                    commit(updateCanvasGroup(currentScene(), group.id, { collapsed: false }))
                    setSelectedGroupTarget(group.id)
                  }
                } : undefined}
              />
              {group.c4Type === 'software-system' && !group.collapsed ? <rect className="freeform-group-header" x={group.x} y={group.y} width={group.width} height="34" rx="20" /> : null}
              {!group.collapsed ? (
                <rect
                  className="freeform-group-navigation-hit"
                  x={group.x}
                  y={group.y}
                  width={Math.min(group.width, 260)}
                  height="34"
                  rx="12"
                  pointerEvents="all"
                  onClick={(event) => { event.stopPropagation(); selectGroup(group.id) }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    if (scene.architecture) enterArchitectureScope({ kind: 'group', id: group.id })
                  }}
                />
              ) : null}
              {group.label ? <text x={group.x + 14} y={group.y + 22}>{truncate(group.label, 28)}{group.c4Type ? ` · ${c4Label(group.c4Type)}` : ''}{group.collapsed ? scene.architecture ? ' · 双击下钻' : ' · 双击展开' : ''}</text> : null}
            </g>
          ))}
          {relationBundleTrunks.map((bundle) => (
            <path
              key={bundle.id}
              d={bundle.path}
              className={`freeform-bundle-trunk emphasis-${bundle.emphasis ?? 'secondary'}`}
              pointerEvents="none"
            />
          ))}
          {playbackGhostArrows.map((arrow) => {
            const from = playbackBoxLookup.get(arrow.from)
            const to = playbackBoxLookup.get(arrow.to)
            if (!from || !to) return null
            const fromCenter = center(from)
            const toCenter = center(to)
            const start = anchorPoint(from, arrow.fromAnchor, arrow.points?.[0] ?? toCenter)
            const end = anchorPoint(to, arrow.toAnchor, arrow.points?.at(-1) ?? fromCenter)
            return (
              <g key={`ghost-${arrow.id}`} className={`freeform-arrow freeform-ai-ghost${playback?.deletingIds?.includes(arrow.id) ? ' is-deleting' : ''}`} pointerEvents="none">
                <path d={canvasArrowPath(start, end, arrow)} markerEnd="url(#canvas-arrow)" />
              </g>
            )
          })}
          {visibleRenderArrows.map((arrow) => {
            const displayArrow = playback?.arrowOverrides?.[arrow.id] ?? arrow
            const fromRaw = playbackBoxLookup.get(displayArrow.from)
            const toRaw = playbackBoxLookup.get(displayArrow.to)
            const from = fromRaw ? playbackBoxPosition(fromRaw) : undefined
            const to = toRaw ? playbackBoxPosition(toRaw) : undefined
            if (!from || !to) return null
            const fromCenter = center(from)
            const toCenter = center(to)
            const start = anchorPoint(from, displayArrow.fromAnchor, displayArrow.points?.[0] ?? toCenter)
            const end = anchorPoint(to, displayArrow.toAnchor, displayArrow.points?.at(-1) ?? fromCenter)
            const path = canvasArrowPath(start, end, displayArrow)
            const overridden = Boolean(playback?.arrowOverrides?.[arrow.id])
            const fallbackLabelPoint = pathLabelPoint(start, end, displayArrow.points)
            const labelLayout = overridden && displayArrow.label
              ? { x: fallbackLabelPoint.x, y: fallbackLabelPoint.y - 10, width: Math.max(46, Math.min(220, displayArrow.label.length * 7 + 20)), height: 22 }
              : relationLabelLayouts.get(arrow.id)
            return (
              <g key={arrow.id} className={`freeform-arrow emphasis-${displayArrow.emphasis ?? 'secondary'}${displayArrow.bundleKey ? ' is-bundled' : ''}${selectedIds.includes(arrow.id) ? ' is-selected' : ''}${displayArrow.lineStyle === 'dashed' ? ' is-dashed' : ''}${traceResult ? tracedArrowIds.has(arrow.id) ? ' is-traced' : ' is-trace-dimmed' : ''}${playback?.drawingArrowId === arrow.id ? ' is-ai-drawing' : ''}${playback?.finalHighlightIds?.includes(arrow.id) ? ' is-ai-final-highlight' : ''}${playback?.active && (activePlaybackRegionIds.has(displayArrow.from) || activePlaybackRegionIds.has(displayArrow.to)) ? ' is-ai-region-active' : ''}`} onContextMenu={(event) => openContextMenu(event, arrow.id)} onPointerDown={(event) => { event.stopPropagation(); setContextMenu(null); setSelectedGroupTarget(null); editorRef.current?.focus({ preventScroll: true }); setSelectedIds(event.shiftKey ? toggleId(selectedIds, arrow.id) : [arrow.id]) }}>
                <path d={path} markerEnd="url(#canvas-arrow)" pathLength="1" />
                {displayArrow.label && labelLayout ? (
                  <g className="freeform-arrow-label" pointerEvents="none">
                    <rect x={labelLayout.x - labelLayout.width / 2} y={labelLayout.y - labelLayout.height / 2} width={labelLayout.width} height={labelLayout.height} rx={labelLayout.height / 2} />
                    <text x={labelLayout.x} y={labelLayout.y + 4} textAnchor="middle">{truncate(displayArrow.label, 30)}</text>
                  </g>
                ) : null}
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
          {collapsedConnections.map((connection) => {
            const fromCenter = center(connection.fromBox)
            const toCenter = center(connection.toBox)
            const start = anchorPoint(connection.fromBox, connection.fromAnchor, toCenter)
            const end = anchorPoint(connection.toBox, connection.toAnchor, fromCenter)
            const path = canvasArrowPath(start, end, connection)
            const label = connection.labels.slice(0, 2).join(' · ')
            return (
              <g key={connection.id} className={`freeform-arrow is-collapsed-summary${connection.lineStyle === 'dashed' ? ' is-dashed' : ''}`} pointerEvents="none">
                <path d={path} markerEnd="url(#canvas-arrow)" />
                {label || connection.count > 1 ? <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 10} textAnchor="middle">{truncate(`${label}${connection.count > 1 ? ` ×${connection.count}` : ''}`, 36)}</text> : null}
              </g>
            )
          })}
          {playbackGhostBoxes.map((item) => (
            <g
              key={`ghost-${item.id}`}
              className={`freeform-box freeform-${item.type} freeform-ai-ghost tone-${item.tone ?? 'default'} shape-${item.shape ?? 'rounded'}${playback?.deletingIds?.includes(item.id) ? ' is-deleting' : ''}`}
              transform={`translate(${item.x} ${item.y})`}
              pointerEvents="none"
            >
              <rect width={item.width} height={item.height} rx={item.shape === 'square' ? 3 : item.shape === 'pill' ? item.height / 2 : 14} />
              <text x={item.width / 2} y={item.height / 2} textAnchor="middle" dominantBaseline="middle">{truncate(item.text, 28)}</text>
            </g>
          ))}
          {visibleRenderBoxes.map((item) => {
            const playbackPosition = playback?.positionOverrides?.[item.id]
            const displayItem = playbackBoxPosition(item)
            const displayX = displayItem.x
            const displayY = displayItem.y
            const displayText = playback?.typing?.id === item.id ? playback.typing.text : displayItem.text
            const architectureCard = displayItem.type === 'node' && Boolean(displayItem.icon || displayItem.stencil || displayItem.c4Type)
            const cardTemplate = canvasArchitectureCardTemplate(displayItem)
            const cardMeta = displayItem.stencil ? canvasStencilLabel(displayItem.stencil) : architectureCard ? cardTemplate.label : displayItem.icon ? canvasIconLabel(displayItem.icon) : undefined
            const showCardSubtitle = Boolean(displayItem.subtitle && (!architectureCard || architectureProjection.density !== 'dense'))
            const cardTitleLimit = architectureProjection.density === 'dense' ? 22 : architectureProjection.density === 'compact' ? 26 : 30
            return (
            <g
              key={item.id}
              className={`freeform-box freeform-${displayItem.type} tone-${displayItem.tone ?? 'default'} shape-${displayItem.shape ?? 'rounded'} emphasis-${displayItem.emphasis ?? 'secondary'}${architectureCard ? ` is-architecture-card card-kind-${cardTemplate.kind}` : ''}${displayItem.locked ? ' is-locked' : ''}${selectedIds.includes(item.id) ? ' is-selected' : ''}${connectFrom === item.id ? ' is-connect-source' : ''}${traceResult ? tracedNodeIds.has(item.id) ? ` is-traced trace-depth-${Math.min(3, traceResult.distanceById[item.id] ?? 0)}` : ' is-trace-dimmed' : ''}${playback?.currentElementId === item.id ? ' is-ai-drawing-target' : ''}${playback?.finalHighlightIds?.includes(item.id) ? ' is-ai-final-highlight' : ''}${playbackPosition ? ' is-ai-dragging' : ''}${playback?.active && activePlaybackRegionIds.has(item.id) ? ' is-ai-region-active' : ''}`}
              transform={`translate(${displayX} ${displayY})`}
              onContextMenu={(event) => openContextMenu(event, item.id)}
              onPointerDown={(event) => startMove(event, item)}
              onClick={(event) => { event.stopPropagation(); handleBoxClick(item.id, event) }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (scene.architecture && architectureProjection.view === 'overview') {
                  enterArchitectureScope({ kind: 'node', id: item.id, depth: 1 })
                  return
                }
                setSelectedGroupTarget(null)
                setSelectedIds([item.id])
                if (!item.locked) window.setTimeout(() => { textInputRef.current?.focus(); textInputRef.current?.select() }, 0)
              }}
              onPointerMove={(event) => moveSelection(event, item)}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
            >
              {displayItem.description ? <title>{displayItem.description}</title> : null}
              <rect width={displayItem.width} height={displayItem.height} rx={displayItem.shape === 'square' ? 3 : displayItem.shape === 'pill' ? displayItem.height / 2 : 14} />
              {displayItem.emphasis === 'primary' ? <rect className="freeform-card-accent" width="5" height={displayItem.height} rx="3" /> : null}
              {architectureCard ? <rect className="freeform-card-kind-band" x="12" y={displayItem.height - 4} width={Math.max(24, displayItem.width - 24)} height="2" rx="1" /> : null}
              {displayItem.icon ? (
                <g className="freeform-node-role" transform="translate(18 18)">
                  <circle r="10" />
                  <g className="freeform-node-role-symbol" transform="translate(-7 -7) scale(.5833)">
                    {canvasIconPaths(displayItem.icon).map((path, index) => <path key={`${displayItem.icon}-${index}`} d={path} />)}
                  </g>
                </g>
              ) : null}
              {cardMeta ? <text className="freeform-node-icon" x={displayItem.icon ? 34 : 13} y="19">{cardMeta}</text> : null}
              {displayItem.c4Type ? <text className="freeform-c4-badge" x={displayItem.width - 10} y={19} textAnchor="end">{c4Label(displayItem.c4Type)}</text> : null}
              <text className={architectureCard ? 'freeform-node-title' : undefined} x={architectureCard ? 16 : displayItem.width / 2} y={architectureCard ? (showCardSubtitle ? 55 : Math.max(54, displayItem.height / 2 + 5)) : displayItem.height / 2} textAnchor={architectureCard ? 'start' : 'middle'} dominantBaseline={architectureCard ? undefined : 'middle'}>
                {truncate(displayText, architectureCard ? cardTitleLimit : 28)}{playback?.typing?.id === item.id ? <tspan className="freeform-ai-caret">│</tspan> : null}
              </text>
              {showCardSubtitle ? <text className="freeform-node-subtitle" x={architectureCard ? 16 : displayItem.width / 2} y={displayItem.height - 12} textAnchor={architectureCard ? 'start' : 'middle'}>{truncate(displayItem.subtitle!, architectureCard ? 34 : 32)}</text> : null}
              {displayItem.sourcePaths?.length ? <text className="freeform-source-badge" x={displayItem.width - 10} y={displayItem.c4Type ? 34 : 18} textAnchor="end">⌘ {displayItem.sourcePaths.length}</text> : null}
              {(tool === 'connect' || selectedIds.includes(item.id)) ? (
                <g className="freeform-anchor-points">
                  <circle cx={displayItem.width / 2} cy={0} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'top')} />
                  <circle cx={displayItem.width} cy={displayItem.height / 2} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'right')} />
                  <circle cx={displayItem.width / 2} cy={displayItem.height} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'bottom')} />
                  <circle cx={0} cy={displayItem.height / 2} r="7" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => handleAnchorClick(event, item.id, 'left')} />
                </g>
              ) : null}
              {selectedIds.length === 1 && selectedIds[0] === item.id && !item.locked ? (
                <rect
                  className="freeform-resize-handle"
                  x={displayItem.width - 7}
                  y={displayItem.height - 7}
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
          )})}
          {selectionRect ? (() => {
            const rect = normalizeRect(selectionRect)
            return <rect className="freeform-marquee" x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
          })() : null}
          {playback?.selectionBox ? (
            <rect
              className="freeform-ai-selection-box"
              x={playback.selectionBox.x}
              y={playback.selectionBox.y}
              width={playback.selectionBox.width}
              height={playback.selectionBox.height}
              rx="10"
              pointerEvents="none"
            />
          ) : null}
          {playback?.boundaryDraft ? (
            <g className="freeform-ai-boundary-draft" pointerEvents="none">
              <rect
                x={playback.boundaryDraft.x}
                y={playback.boundaryDraft.y}
                width={playback.boundaryDraft.width}
                height={playback.boundaryDraft.height}
                rx="20"
              />
              {playback.boundaryDraft.label && playback.boundaryDraft.width > 120 ? (
                <text x={playback.boundaryDraft.x + 14} y={playback.boundaryDraft.y + 22}>{truncate(playback.boundaryDraft.label, 28)}</text>
              ) : null}
            </g>
          ) : null}
          {playback?.anchorPreview ? (
            <g className="freeform-ai-anchor-preview" pointerEvents="none">
              <path d={playback.anchorPreview.path ?? `M ${playback.anchorPreview.from.x} ${playback.anchorPreview.from.y} L ${playback.anchorPreview.to.x} ${playback.anchorPreview.to.y}`} />
              <circle className={playback.anchorPreview.active === 'from' ? 'is-active' : ''} cx={playback.anchorPreview.from.x} cy={playback.anchorPreview.from.y} r="9" />
              <circle className={playback.anchorPreview.active === 'to' ? 'is-active' : ''} cx={playback.anchorPreview.to.x} cy={playback.anchorPreview.to.y} r="9" />
            </g>
          ) : null}
          {playback?.active && playback.cursorVisible ? (
            <g
              className={`freeform-ai-cursor${playback.clicking ? ' is-clicking' : ''}`}
              transform={`translate(${playback.cursor.x} ${playback.cursor.y}) scale(${1 / viewport.zoom})`}
              pointerEvents="none"
            >
              <circle className="freeform-ai-cursor-ring" cx="3" cy="4" r="16" />
              <path className="freeform-ai-cursor-pointer" d="M0 0 L0 24 L6 18 L11 29 L17 26 L12 15 L22 15 Z" />
              <circle className="freeform-ai-cursor-dot" cx="3" cy="4" r="3" />
              {playback.intent ? (
                <g className="freeform-ai-intent-bubble" transform={`translate(${playbackBubbleOffsetX} ${playbackBubbleOffsetY})`}>
                  <rect x="0" y="-22" width={playbackBubbleWidth} height="30" rx="9" />
                  <text x="10" y="-3">{truncate(playback.intent, 34)}</text>
                </g>
              ) : null}
            </g>
          ) : null}
        </svg>

        {playback?.active ? (
          <div className="freeform-playback-status" role="status" aria-live="polite">
            <span className="freeform-playback-pulse" />
            <div>
              <strong>{playback.label}</strong>
              <span>{playback.regionIndex && playback.totalRegions ? `区域 ${playback.regionIndex}/${playback.totalRegions} · ` : ''}{playbackPhaseLabel(playback.phase)} · {playback.step}/{playback.total}</span>
            </div>
            <button type="button" onClick={() => { playbackRun.current += 1; setPlayback(null); onPlaybackComplete?.(playbackRequest?.key ?? '') }}>跳过</button>
          </div>
        ) : null}

        {playback?.inspectorPreview ? (
          <aside className="freeform-ai-inspector" aria-label="AI 正在调整属性">
            <div className="freeform-ai-inspector-head">
              <span>INSPECTOR</span>
              <strong>{truncate(playback.inspectorPreview.title, 22)}</strong>
            </div>
            {playback.inspectorPreview.rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className={`freeform-ai-inspector-row${index === playback.inspectorPreview!.activeIndex ? ' is-active' : ''}`}>
                <span>{row.label}</span>
                <strong>{truncate(row.value, 24)}</strong>
                {index === playback.inspectorPreview!.activeIndex && playback.inspectorDropdownOpen ? (
                  <div className="freeform-ai-inspector-menu">
                    {playbackInspectorOptions(row.label, row.value).map((option) => (
                      <span key={option} className={option === row.value ? 'is-selected' : ''}>{option === row.value ? '✓ ' : ''}{truncate(option, 22)}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </aside>
        ) : null}

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
          {displayGroupBounds.filter((group) => (
            group.collapsed
            && !groupHiddenByCollapsedAncestor(group.id, renderScene.groups ?? [])
            && (!playbackVisibleGroupIds || playbackVisibleGroupIds.has(group.id))
          )).map((group) => <rect key={`group-${group.id}`} x={group.x} y={group.y} width={group.width} height={group.height} rx="12" className="freeform-minimap-group" />)}
          {renderBoxes.map((item) => <rect key={item.id} x={item.x} y={item.y} width={item.width} height={item.height} rx="10" className={`freeform-minimap-node${selectedIds.includes(item.id) ? ' is-selected' : ''}`} />)}
          <rect x={viewport.x} y={viewport.y} width={viewWidth} height={viewHeight} className="freeform-minimap-viewport" />
        </svg>
      </div>
    </div>
  )
}

type CanvasPlaybackAction =
  | { kind: 'box'; id: string; added: boolean; before?: CanvasNode | CanvasNote; rough?: CanvasPoint; regionKey: string }
  | { kind: 'arrange'; ids: string[]; regionKey: string }
  | { kind: 'boundary'; groupId: string; regionKey: string; beforeRect?: { x: number; y: number; width: number; height: number } }
  | { kind: 'style'; id: string; rows: Array<{ label: string; value: string }>; regionKey: string }
  | { kind: 'arrow'; id: string; added: boolean; before?: CanvasArrow; regionKey: string }
  | { kind: 'delete'; element: CanvasElement; regionKey: string }

type CanvasPlaybackRegion = {
  key: string
  label: string
  elementIds: string[]
  center: CanvasPoint
  width: number
  height: number
}

export function buildCanvasPlaybackPlan(previous: CanvasScene | undefined, next: CanvasScene, mode: 'create' | 'update'): {
  initialVisibleIds: string[]
  initialVisibleGroupIds: string[]
  initialPositionOverrides: Record<string, CanvasPoint>
  initialBoxOverrides: Record<string, CanvasNode | CanvasNote>
  initialArrowOverrides: Record<string, CanvasArrow>
  initialGroupFrameOverrides: Record<string, CanvasGroupFrame>
  ghostElements: CanvasElement[]
  actions: CanvasPlaybackAction[]
  regions: CanvasPlaybackRegion[]
} {
  const previousById = new Map(previous?.elements.map((item) => [item.id, item]) ?? [])
  const nextById = new Map(next.elements.map((item) => [item.id, item]))
  const nextIds = new Set(next.elements.map((item) => item.id))
  const removedElements = previous?.elements.filter((item) => !nextIds.has(item.id)) ?? []
  const previousGroups = new Map(previous?.groups?.map((group) => [group.id, group]) ?? [])
  const previousGroupFrames = new Map((previous ? canvasGroupFrames(previous) : []).map((group) => [group.id, group]))
  const changed = new Set<string>()
  const added = new Set<string>()
  for (const item of next.elements) {
    const before = previousById.get(item.id)
    if (!before) added.add(item.id)
    else if (JSON.stringify(before) !== JSON.stringify(item)) changed.add(item.id)
  }
  const orderedBoxes = playbackBoxOrder(next)
  const regionByBoxId = new Map<string, string>()
  const regions = buildCanvasPlaybackRegions(next)
  regions.forEach((region) => region.elementIds.forEach((id) => regionByBoxId.set(id, region.key)))
  const collapsedOwners = canvasCollapsedOwners(next)
  const regionOrderIndex = new Map(regions.map((region, index) => [region.key, index]))
  const arrowRegionKey = (arrow: CanvasArrow) => {
    const fromRegion = regionByBoxId.get(arrow.from)
    const toRegion = regionByBoxId.get(arrow.to)
    if (!fromRegion) return toRegion ?? 'canvas'
    if (!toRegion) return fromRegion
    return (regionOrderIndex.get(toRegion) ?? -1) >= (regionOrderIndex.get(fromRegion) ?? -1) ? toRegion : fromRegion
  }
  const changedArrows = next.elements.filter((item): item is CanvasArrow => (
    item.type === 'arrow'
    && (added.has(item.id) || changed.has(item.id))
    && !collapsedOwners.has(item.from)
    && !collapsedOwners.has(item.to)
  ))
  const nextGroups = new Map((next.groups ?? []).map((group) => [group.id, group]))
  const nextGroupFrames = new Map(canvasGroupFrames(next).map((group) => [group.id, group]))
  const initialPositionOverrides: Record<string, CanvasPoint> = {}
  const initialBoxOverrides: Record<string, CanvasNode | CanvasNote> = {}
  const initialArrowOverrides: Record<string, CanvasArrow> = {}
  const initialGroupFrameOverrides: Record<string, CanvasGroupFrame> = {}
  next.elements.forEach((item) => {
    const before = previousById.get(item.id)
    if (!before || !changed.has(item.id)) return
    if (item.type === 'arrow') {
      if (before.type === 'arrow') initialArrowOverrides[item.id] = before
      return
    }
    if (before.type !== 'arrow') {
      initialBoxOverrides[item.id] = before
      if (before.x !== item.x || before.y !== item.y) initialPositionOverrides[item.id] = { x: before.x, y: before.y }
    }
  })
  for (const [groupId, beforeFrame] of previousGroupFrames) {
    const afterFrame = nextGroupFrames.get(groupId)
    const before = previousGroups.get(groupId)
    const after = nextGroups.get(groupId)
    if (!afterFrame || !after) continue
    const changedMetadata = JSON.stringify(before) !== JSON.stringify(after)
    const changedFrame = beforeFrame.x !== afterFrame.x || beforeFrame.y !== afterFrame.y || beforeFrame.width !== afterFrame.width || beforeFrame.height !== afterFrame.height
    if (changedMetadata || changedFrame) initialGroupFrameOverrides[groupId] = beforeFrame
  }

  const actions: CanvasPlaybackAction[] = []
  for (const region of regions) {
    const regionIds = new Set(region.elementIds)
    const boxIds = orderedBoxes.filter((id) => regionIds.has(id) && !collapsedOwners.has(id) && (added.has(id) || changed.has(id)))
    const addedBoxes = boxIds.filter((id) => added.has(id))
    const roughById = new Map<string, CanvasPoint>()
    addedBoxes.forEach((id, index) => {
      const candidate = nextById.get(id)
      const item = candidate && candidate.type !== 'arrow' ? candidate : undefined
      if (item) roughById.set(id, playbackRoughPosition(next, region, index, addedBoxes.length, item))
    })

    for (const id of boxIds) {
      const before = previousById.get(id)
      actions.push({
        kind: 'box',
        id,
        added: added.has(id),
        regionKey: region.key,
        ...(roughById.has(id) ? { rough: roughById.get(id) } : {}),
        ...(before && before.type !== 'arrow' ? { before } : {}),
      })
    }

    const arrangeIds = boxIds.filter((id) => {
      if (added.has(id)) return true
      const before = previousById.get(id)
      const after = nextById.get(id)
      return Boolean(before && before.type !== 'arrow' && after && after.type !== 'arrow' && (before.x !== after.x || before.y !== after.y))
    })
    if (arrangeIds.length) {
      actions.push({ kind: 'arrange', ids: arrangeIds, regionKey: region.key })
    }

    if (region.key.startsWith('group:')) {
      const groupId = region.key.slice('group:'.length)
      const group = nextGroups.get(groupId)
      const before = previousGroups.get(groupId)
      const beforeFrame = previousGroupFrames.get(groupId)
      const afterFrame = nextGroupFrames.get(groupId)
      const frameChanged = Boolean(beforeFrame && afterFrame && (
        beforeFrame.x !== afterFrame.x || beforeFrame.y !== afterFrame.y || beforeFrame.width !== afterFrame.width || beforeFrame.height !== afterFrame.height
      ))
      if (group && (!before || JSON.stringify(before) !== JSON.stringify(group) || frameChanged)) {
        actions.push({
          kind: 'boundary',
          groupId,
          regionKey: region.key,
          ...(beforeFrame ? { beforeRect: { x: beforeFrame.x, y: beforeFrame.y, width: beforeFrame.width, height: beforeFrame.height } } : {}),
        })
      }
    }

    for (const id of boxIds) {
      const candidate = nextById.get(id)
      const after = candidate && candidate.type !== 'arrow' ? candidate : undefined
      if (!after) continue
      const before = previousById.get(id)
      const rows = playbackStyleRows(before && before.type !== 'arrow' ? before : undefined, after)
      if (rows.length) actions.push({ kind: 'style', id, rows, regionKey: region.key })
    }

    changedArrows
      .filter((arrow) => arrowRegionKey(arrow) === region.key)
      .forEach((arrow) => {
        const before = previousById.get(arrow.id)
        actions.push({
          kind: 'arrow',
          id: arrow.id,
          added: added.has(arrow.id),
          regionKey: region.key,
          ...(before?.type === 'arrow' ? { before } : {}),
        })
      })
  }

  const knownRegionKeys = new Set(regions.map((region) => region.key))
  changedArrows
    .filter((arrow) => !knownRegionKeys.has(arrowRegionKey(arrow)))
    .forEach((arrow) => {
      const before = previousById.get(arrow.id)
      actions.push({ kind: 'arrow', id: arrow.id, added: added.has(arrow.id), regionKey: 'canvas', ...(before?.type === 'arrow' ? { before } : {}) })
    })

  let deletionRegion: CanvasPlaybackRegion | undefined
  if (removedElements.length) {
    const previousBoxes = previous?.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow') ?? []
    const removedBoxes = removedElements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
    const relatedBoxes = removedBoxes.length
      ? removedBoxes
      : previousBoxes.filter((box) => removedElements.some((item) => item.type === 'arrow' && (item.from === box.id || item.to === box.id)))
    if (relatedBoxes.length) {
      const left = Math.min(...relatedBoxes.map((item) => item.x))
      const top = Math.min(...relatedBoxes.map((item) => item.y))
      const right = Math.max(...relatedBoxes.map((item) => item.x + item.width))
      const bottom = Math.max(...relatedBoxes.map((item) => item.y + item.height))
      deletionRegion = {
        key: 'cleanup',
        label: '清理旧结构',
        elementIds: relatedBoxes.map((item) => item.id),
        center: { x: (left + right) / 2, y: (top + bottom) / 2 },
        width: right - left,
        height: bottom - top,
      }
    } else {
      deletionRegion = { key: 'cleanup', label: '清理旧结构', elementIds: [], center: { x: next.width / 2, y: next.height / 2 }, width: 480, height: 320 }
    }
    removedElements
      .filter((item) => item.type === 'arrow')
      .forEach((element) => actions.push({ kind: 'delete', element, regionKey: 'cleanup' }))
    removedElements
      .filter((item) => item.type !== 'arrow')
      .forEach((element) => actions.push({ kind: 'delete', element, regionKey: 'cleanup' }))
  }
  const hidden = mode === 'create'
    ? new Set(next.elements.map((item) => item.id))
    : added
  const regionOrder = [...new Set(actions.map((action) => action.regionKey))]
  const regionMap = new Map(regions.map((region) => [region.key, region]))
  return {
    initialVisibleIds: next.elements.filter((item) => !hidden.has(item.id)).map((item) => item.id),
    initialVisibleGroupIds: mode === 'create' ? [] : [...previousGroups.keys()],
    initialPositionOverrides,
    initialBoxOverrides,
    initialArrowOverrides,
    initialGroupFrameOverrides,
    ghostElements: removedElements,
    actions,
    regions: regionOrder.flatMap((key) => {
      const region = regionMap.get(key)
      return region ? [region] : []
    }).concat(deletionRegion ? [deletionRegion] : []),
  }
}

function buildCanvasPlaybackRegions(scene: CanvasScene): CanvasPlaybackRegion[] {
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const groups = new Map<string, Array<CanvasNode | CanvasNote>>()
  const labels = new Map<string, string>()
  const groupMeta = new Map((scene.groups ?? []).map((group) => [group.id, group]))
  const laneMeta = new Map((scene.lanes ?? []).map((lane) => [lane.id, lane]))
  for (const box of boxes) {
    let key: string
    let label: string
    if (box.groupId && groupMeta.has(box.groupId)) {
      key = `group:${box.groupId}`
      label = groupMeta.get(box.groupId)?.label || '系统区域'
    } else if (box.laneId && laneMeta.has(box.laneId)) {
      key = `lane:${box.laneId}`
      label = laneMeta.get(box.laneId)?.label || '泳道区域'
    } else {
      const column = Math.floor((box.x + box.width / 2) / 760)
      const row = Math.floor((box.y + box.height / 2) / 520)
      key = `area:${column}:${row}`
      label = boxes.length <= 8 ? '核心画布' : `区域 ${row + 1}-${column + 1}`
    }
    const members = groups.get(key) ?? []
    members.push(box)
    groups.set(key, members)
    labels.set(key, label)
  }
  return [...groups.entries()]
    .map(([key, members]) => {
      const left = Math.min(...members.map((item) => item.x))
      const top = Math.min(...members.map((item) => item.y))
      const right = Math.max(...members.map((item) => item.x + item.width))
      const bottom = Math.max(...members.map((item) => item.y + item.height))
      return {
        key,
        label: labels.get(key) ?? '画布区域',
        elementIds: members.map((item) => item.id),
        center: { x: (left + right) / 2, y: (top + bottom) / 2 },
        width: right - left,
        height: bottom - top,
      }
    })
    .sort((left, right) => left.center.x - right.center.x || left.center.y - right.center.y)
}

function playbackBoxOrder(scene: CanvasScene): string[] {
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow')
  const boxById = new Map(boxes.map((item) => [item.id, item]))
  const boxIds = new Set(boxes.map((item) => item.id))
  const incoming = new Map(boxes.map((item) => [item.id, 0]))
  const outgoing = new Map(boxes.map((item) => [item.id, [] as string[]]))
  scene.elements.forEach((item) => {
    if (item.type !== 'arrow' || !boxIds.has(item.from) || !boxIds.has(item.to) || item.from === item.to) return
    incoming.set(item.to, (incoming.get(item.to) ?? 0) + 1)
    outgoing.get(item.from)?.push(item.to)
  })
  const byPosition = (a: string, b: string) => {
    const left = boxById.get(a)!
    const right = boxById.get(b)!
    return left.x - right.x || left.y - right.y
  }
  const queue = boxes.filter((item) => (incoming.get(item.id) ?? 0) === 0).map((item) => item.id).sort(byPosition)
  const result: string[] = []
  const resultIds = new Set<string>()
  let queueIndex = 0
  while (queueIndex < queue.length) {
    const id = queue[queueIndex++]
    if (resultIds.has(id)) continue
    result.push(id)
    resultIds.add(id)
    for (const next of outgoing.get(id) ?? []) {
      incoming.set(next, Math.max(0, (incoming.get(next) ?? 0) - 1))
      if ((incoming.get(next) ?? 0) === 0) {
        queue.push(next)
      }
    }
  }
  boxes.map((item) => item.id).filter((id) => !resultIds.has(id)).sort(byPosition).forEach((id) => result.push(id))
  return result
}

function playbackActionTarget(scene: CanvasScene, action: CanvasPlaybackAction): CanvasPoint | null {
  if (action.kind === 'delete') {
    if (action.element.type !== 'arrow') return center(action.element)
    return null
  }
  if (action.kind === 'arrange') {
    const bounds = playbackBoundsForIds(scene, action.ids)
    return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null
  }
  if (action.kind === 'boundary') {
    const frame = canvasGroupFrames(scene).find((group) => group.id === action.groupId)
    return frame ? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 } : null
  }
  if (action.kind === 'style') {
    const item = scene.elements.find((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.id === action.id)
    return item ? center(item) : null
  }
  const item = scene.elements.find((candidate) => candidate.id === action.id)
  if (!item) return null
  if (item.type !== 'arrow') {
    if (action.kind === 'box' && action.rough) return { x: action.rough.x + item.width / 2, y: action.rough.y + item.height / 2 }
    if (action.kind === 'box' && action.before) return center(action.before)
    return center(item)
  }
  const from = scene.elements.find((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.id === item.from)
  const to = scene.elements.find((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.id === item.to)
  if (!from || !to) return null
  return { x: (center(from).x + center(to).x) / 2, y: (center(from).y + center(to).y) / 2 }
}

function playbackRoughPosition(scene: CanvasScene, region: CanvasPlaybackRegion, index: number, total: number, item: CanvasNode | CanvasNote): CanvasPoint {
  const columns = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(total))))
  const rows = Math.max(1, Math.ceil(total / columns))
  const col = index % columns
  const row = Math.floor(index / columns)
  const cellWidth = Math.max(220, Math.min(300, (region.width + 260) / columns))
  const cellHeight = Math.max(120, Math.min(180, (region.height + 180) / rows))
  const totalWidth = columns * cellWidth
  const totalHeight = rows * cellHeight
  const x = region.center.x - totalWidth / 2 + col * cellWidth + (cellWidth - item.width) / 2
  const y = region.center.y - totalHeight / 2 + row * cellHeight + (cellHeight - item.height) / 2
  return {
    x: clamp(x + 34, 0, Math.max(0, scene.width - item.width)),
    y: clamp(y + 26, 0, Math.max(0, scene.height - item.height)),
  }
}

function playbackBoundsForIds(scene: CanvasScene, ids: string[], overrides?: Map<string, CanvasPoint>): { x: number; y: number; width: number; height: number } | null {
  const boxes = scene.elements.filter((item): item is CanvasNode | CanvasNote => item.type !== 'arrow' && ids.includes(item.id))
  if (!boxes.length) return null
  const left = Math.min(...boxes.map((item) => overrides?.get(item.id)?.x ?? item.x))
  const top = Math.min(...boxes.map((item) => overrides?.get(item.id)?.y ?? item.y))
  const right = Math.max(...boxes.map((item) => (overrides?.get(item.id)?.x ?? item.x) + item.width))
  const bottom = Math.max(...boxes.map((item) => (overrides?.get(item.id)?.y ?? item.y) + item.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function playbackStyleRows(before: CanvasNode | CanvasNote | undefined, after: CanvasNode | CanvasNote): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  const add = (label: string, previous: unknown, next: unknown, format = (value: unknown) => String(value ?? '默认')) => {
    if (previous !== next && next !== undefined) rows.push({ label, value: format(next) })
  }
  add('语义色', before?.tone, after.tone)
  add('形状', before?.shape, after.shape)
  add('角色', before?.icon, after.icon, (value) => canvasIconLabel(value as CanvasIcon))
  add('技术栈', before?.stencil, after.stencil, (value) => canvasStencilLabel(value as CanvasStencil))
  add('C4', before?.c4Type, after.c4Type, (value) => c4Label(value as CanvasC4Type))
  add('副标题', before?.subtitle, after.subtitle)
  if (JSON.stringify(before?.tags ?? []) !== JSON.stringify(after.tags ?? []) && after.tags?.length) rows.push({ label: '标签', value: after.tags.slice(0, 3).join(' · ') })
  return rows.slice(0, 6)
}

function playbackInspectorOptions(label: string, selected: string): string[] {
  const options = label === '语义色'
    ? ['default', 'accent', 'success', 'warning', 'danger', 'muted']
    : label === '形状'
      ? ['rounded', 'square', 'pill']
      : label === '角色'
        ? ['User', 'Web', 'API', 'Service', 'Database', 'Cache', 'Queue', 'External']
        : label === '技术栈'
          ? ['Spring', 'React', 'Vue', 'Postgres', 'Redis', 'Kafka', 'Kubernetes']
          : label === 'C4'
            ? ['Person', 'Software System', 'Container', 'Component']
            : [selected]
  return [...new Set([selected, ...options])].slice(0, 6)
}

function playbackActionIntent(scene: CanvasScene, action: CanvasPlaybackAction): string {
  if (action.kind === 'delete') {
    return action.element.type === 'arrow'
      ? `删除 ${action.element.label ? truncate(action.element.label, 22) : '旧连接'}`
      : `删除 ${truncate(action.element.text, 22)}`
  }
  if (action.kind === 'arrange') return '整理当前区域布局'
  if (action.kind === 'boundary') {
    const group = scene.groups?.find((item) => item.id === action.groupId)
    return `创建 ${truncate(group?.label || '系统', 20)} 边界`
  }
  if (action.kind === 'style') return '调整节点属性'
  if (action.kind === 'box') {
    const item = scene.elements.find((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.id === action.id)
    if (!item) return '调整节点'
    if (action.added) return `添加 ${truncate(item.text, 22)}`
    const moved = action.before && (action.before.x !== item.x || action.before.y !== item.y)
    if (moved) return `整理 ${truncate(item.text, 22)} 位置`
    return `更新 ${truncate(item.text, 22)}`
  }
  const item = scene.elements.find((candidate): candidate is CanvasArrow => candidate.type === 'arrow' && candidate.id === action.id)
  if (!item) return '连接关系'
  const from = scene.elements.find((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.id === item.from)
  const to = scene.elements.find((candidate): candidate is CanvasNode | CanvasNote => candidate.type !== 'arrow' && candidate.id === item.to)
  if (from && to) return `连接 ${truncate(from.text, 12)} → ${truncate(to.text, 12)}`
  return item.label ? `连接 ${truncate(item.label, 22)}` : '连接节点关系'
}

function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length)
  let index = 0
  while (index < max && left[index] === right[index]) index += 1
  return index
}

function playbackPhaseLabel(phase: PlaybackState['phase']): string {
  if (phase === 'planning') return '规划区域'
  if (phase === 'transitioning') return '切换区域'
  if (phase === 'placing') return '放置节点'
  if (phase === 'typing') return '输入内容'
  if (phase === 'selecting') return '框选元素'
  if (phase === 'grouping') return '创建边界'
  if (phase === 'styling') return '调整属性'
  if (phase === 'connecting') return '连接关系'
  if (phase === 'arranging') return '整理布局'
  if (phase === 'finishing') return '完成收尾'
  return '准备绘制'
}

function ToolButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: string }) {
  return <button type="button" className={active ? 'is-active' : ''} title={title} aria-label={title} onClick={onClick}>{children}</button>
}

function center(item: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>) {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function pathLabelPoint(start: CanvasPoint, end: CanvasPoint, points?: CanvasPoint[]): CanvasPoint {
  if (!points?.length) return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const path = [start, ...points, end]
  const middle = Math.floor((path.length - 1) / 2)
  return { x: (path[middle].x + path[middle + 1].x) / 2, y: (path[middle].y + path[middle + 1].y) / 2 }
}

function groupDepth(groupId: string, groups: CanvasGroup[]): number {
  const byId = new Map(groups.map((group) => [group.id, group]))
  let depth = 0
  let current = byId.get(groupId)?.parentId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    depth += 1
    current = byId.get(current)?.parentId
  }
  return Math.min(depth, 6)
}

function groupHiddenByCollapsedAncestor(groupId: string, groups: CanvasGroup[]): boolean {
  const byId = new Map(groups.map((group) => [group.id, group]))
  let current = byId.get(groupId)?.parentId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const group = byId.get(current)
    if (!group) return false
    if (group.collapsed) return true
    current = group.parentId
  }
  return false
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

function splitTags(value: string): string[] | undefined {
  const tags = [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12)
  return tags.length ? tags : undefined
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

function removeRecordKey<T>(record: Record<string, T> | undefined, key: string): Record<string, T> {
  if (!record || !(key in record)) return record ?? {}
  const next = { ...record }
  delete next[key]
  return next
}

function truncate(value: string, max: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function elementLabel(item: CanvasElement) {
  if (item.type === 'arrow') return '连接'
  return item.type === 'note' ? '备注' : '节点'
}
