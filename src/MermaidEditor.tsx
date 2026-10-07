import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

interface MermaidEditorProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  searchRequest: number
  syntax?: 'mermaid' | 'plain'
  ariaLabel?: string
}

const mermaidLanguage = StreamLanguage.define({
  startState: () => ({}),
  token(stream) {
    if (stream.sol() && stream.match(/\s*%%.*/)) return 'comment'
    if (stream.match(/\b(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|mindmap|subgraph|end|participant|actor|class|state|direction|style|classDef|linkStyle|click|note|loop|alt|else|opt|par|and|rect|activate|deactivate|autonumber)\b/)) return 'keyword'
    if (stream.match(/(?:-->|---|==>|-.->|--x|--o|<-->|->>|-->>|<<--|\|>|\|\||\|)/)) return 'operator'
    if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return 'string'
    if (stream.match(/\b[A-Za-z_][\w-]*(?=\s*[\[({])/)) return 'typeName'
    if (stream.match(/\b[A-Za-z_][\w-]*\b/)) return 'variableName'
    if (stream.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/)) return 'atom'
    stream.next()
    return null
  },
})

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--editor-keyword)', fontWeight: '600' },
  { tag: tags.operator, color: 'var(--editor-operator)' },
  { tag: tags.string, color: 'var(--editor-string)' },
  { tag: tags.comment, color: 'var(--text-tertiary)', fontStyle: 'italic' },
  { tag: tags.typeName, color: 'var(--editor-type)' },
  { tag: tags.variableName, color: 'var(--text-primary)' },
  { tag: tags.atom, color: 'var(--editor-atom)' },
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--surface-panel)',
    color: 'var(--text-primary)',
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.65',
  },
  '.cm-content': { padding: '12px 0 28px' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-panel)',
    color: 'var(--text-tertiary)',
    borderRight: '1px solid var(--border)',
    paddingTop: '12px',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--surface-muted)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection-bg) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
  '.cm-search': {
    backgroundColor: 'var(--surface-raised)',
    borderTop: '1px solid var(--border)',
    color: 'var(--text-primary)',
  },
  '.cm-search input': {
    backgroundColor: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
    borderRadius: '6px',
  },
  '.cm-search button': {
    color: 'var(--text-primary)',
    backgroundColor: 'var(--surface-panel)',
    border: '1px solid var(--border)',
    borderRadius: '5px',
  },
})

export function MermaidEditor({ value, onChange, onSave, searchRequest, syntax = 'mermaid', ariaLabel = 'Mermaid 源码编辑器' }: MermaidEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveRef = useRef(onSave)
  const externalUpdate = useRef(false)

  useEffect(() => { saveRef.current = onSave }, [onSave])

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        ...(syntax === 'mermaid' ? [mermaidLanguage, syntaxHighlighting(highlightStyle)] : []),
        editorTheme,
        Prec.highest(keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              saveRef.current()
              return true
            },
          },
          {
            key: 'Mod-f',
            preventDefault: true,
            run: (view) => openSearchPanel(view),
          },
        ])),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || externalUpdate.current) return
          onChange(update.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    externalUpdate.current = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    externalUpdate.current = false
  }, [value])

  useEffect(() => {
    if (searchRequest <= 0 || !viewRef.current) return
    openSearchPanel(viewRef.current)
  }, [searchRequest])

  return <div ref={hostRef} className="mermaid-editor" aria-label={ariaLabel} />
}
