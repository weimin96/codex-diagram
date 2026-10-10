import { useMemo, useState } from 'react'
import { CANVAS_SHAPE_CATALOG, canvasShapeGeometry, type CanvasShapeDefinition, type CanvasShapePack, type CanvasShapeRef } from './shapeRegistry.js'

interface ShapeLibraryProps {
  packs: CanvasShapePack[]
  activeShape?: CanvasShapeRef
  onClose: () => void
  onInsert: (shape: CanvasShapeDefinition) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, shape: CanvasShapeDefinition) => void
  onDragEnd: () => void
  draggingShape?: CanvasShapeRef
}

export function ShapeLibrary({ packs, activeShape, onClose, onInsert, onDragStart, onDragEnd, draggingShape }: ShapeLibraryProps) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shapes = useMemo(() => CANVAS_SHAPE_CATALOG.filter((shape) => (
    packs.includes(shape.pack)
    && (!needle || `${shape.label} ${shape.keywords.join(' ')}`.toLowerCase().includes(needle))
  )), [needle, packs])
  const packOrder = packs.includes('flowchart') && packs[0] === 'flowchart' ? ['flowchart', 'basic'] as const : ['basic', 'flowchart'] as const

  return (
    <aside className="freeform-shape-library" aria-label="图形库">
      <div className="freeform-shape-library-head">
        <strong>图形库</strong>
        <button type="button" aria-label="收起图形库" onClick={onClose}>‹</button>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图形" aria-label="搜索图形" />
      <div className="freeform-shape-library-scroll">
        {packOrder.map((pack) => {
          if (!packs.includes(pack)) return null
          const items = shapes.filter((shape) => shape.pack === pack)
          if (!items.length) return null
          return (
            <section key={pack}>
              <span>{pack === 'basic' ? '基础图形' : 'Flowchart 流程图'}</span>
              <div className="freeform-shape-grid">
                {items.map((shape) => (
                  <button
                    key={shape.ref}
                    type="button"
                    draggable
                    title={`${shape.label} · 点击插入，拖拽精确放置`}
                    className={`${activeShape === shape.ref ? 'is-active' : ''}${draggingShape === shape.ref ? ' is-dragging' : ''}`}
                    onClick={() => onInsert(shape)}
                    onDragStart={(event) => onDragStart(event, shape)}
                    onDragEnd={onDragEnd}
                  >
                    <ShapePreview shape={shape} />
                    <em>{shape.label}</em>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
        {!shapes.length ? <p>没有匹配图形</p> : null}
      </div>
    </aside>
  )
}

export function ShapePreview({ shape }: { shape: CanvasShapeDefinition }) {
  const geometry = canvasShapeGeometry(shape.ref, 34, 24)
  return (
    <svg viewBox="-2 -2 38 28" aria-hidden="true">
      <path d={geometry.bodyPath} />
      {geometry.detailPaths.map((path, index) => <path key={index} d={path} className="is-detail" />)}
    </svg>
  )
}
