import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseCanvasScene } from '../src/canvas.js'
import { DiagramStore } from '../src/store.js'

test('creates, lists and updates a Mermaid diagram inside the workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-'))
  try {
    const store = await DiagramStore.open(root)
    const created = await store.create('flowchart', 'API Flow')
    assert.equal(created.path, 'docs/diagrams/api-flow.mmd')
    assert.equal(created.type, 'flowchart')

    const listed = await store.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.path, created.path)

    const updated = await store.update(created.path, 'sequenceDiagram\n  A->>B: ping')
    assert.equal(updated.type, 'sequence')
    assert.match(await readFile(path.join(root, created.path), 'utf8'), /sequenceDiagram/)

    const revision = await store.revision(created.path)
    assert.equal(revision.path, created.path)
    assert.equal(revision.modifiedAt, updated.modifiedAt)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects traversal and ignores diagrams in excluded directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-'))
  try {
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(root, 'node_modules', 'pkg', 'hidden.mmd'), 'flowchart LR\n  A-->B\n')
    const store = await DiagramStore.open(root)
    assert.deepEqual(await store.list(), [])
    await assert.rejects(() => store.get('../outside.mmd'), /当前工作空间内/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects an update when the diagram changed after it was read', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-'))
  try {
    const store = await DiagramStore.open(root)
    const created = await store.create('flowchart', 'Concurrent Edit')
    await new Promise((resolve) => setTimeout(resolve, 15))
    await writeFile(path.join(root, created.path), 'flowchart LR\n  External-->Change\n', 'utf8')

    await assert.rejects(
      () => store.update(created.path, 'flowchart LR\n  Local-->Change\n', created.modifiedAt),
      /其他编辑器修改/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('indexes source files without generated or dependency directories', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-sources-'))
  try {
    await mkdir(path.join(workspace, 'src', 'auth'), { recursive: true })
    await mkdir(path.join(workspace, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(path.join(workspace, 'docs', 'diagrams'), { recursive: true })
    await writeFile(path.join(workspace, 'src', 'auth', 'LoginService.java'), 'class LoginService {}')
    await writeFile(path.join(workspace, 'src', 'app.ts'), 'export {}')
    await writeFile(path.join(workspace, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}')
    await writeFile(path.join(workspace, 'docs', 'diagrams', 'existing.mmd'), 'flowchart LR\n A --> B\n')

    const store = await DiagramStore.open(workspace)
    const files = await store.listSourceFiles()
    assert.deepEqual(files, ['src/app.ts', 'src/auth/LoginService.java'])
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('renames, duplicates and deletes diagrams without losing source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-actions-'))
  try {
    const store = await DiagramStore.open(root)
    const created = await store.create('flowchart', 'Checkout Flow')
    const source = 'flowchart LR\n  Cart --> Pay\n'
    const updated = await store.update(created.path, source, created.modifiedAt)

    const renamed = await store.rename(updated.path, 'Payment Flow', updated.modifiedAt)
    assert.equal(renamed.path, 'docs/diagrams/payment-flow.mmd')
    assert.equal(renamed.source, source)
    await assert.rejects(() => store.get(created.path), /图表不存在/)

    const duplicated = await store.duplicate(renamed.path)
    assert.equal(duplicated.path, 'docs/diagrams/payment-flow-copy.mmd')
    assert.equal(duplicated.source, source)

    const deleted = await store.delete(duplicated.path, duplicated.modifiedAt)
    assert.equal(deleted, duplicated.path)
    assert.deepEqual((await store.list()).map((item) => item.path), [renamed.path])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('exports SVG and PNG assets without overwriting previous exports', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-export-'))
  try {
    const store = await DiagramStore.open(root)
    const firstSvg = await store.exportAsset('System Overview.svg', '<svg />')
    const secondSvg = await store.exportAsset('System Overview.svg', '<svg>2</svg>')
    const png = await store.exportAsset('System Overview.png', new Uint8Array([137, 80, 78, 71]))

    assert.equal(firstSvg, 'docs/diagrams/exports/system-overview.svg')
    assert.equal(secondSvg, 'docs/diagrams/exports/system-overview-2.svg')
    assert.equal(png, 'docs/diagrams/exports/system-overview.png')
    assert.equal(await readFile(path.join(root, firstSvg), 'utf8'), '<svg />')
    assert.deepEqual([...await readFile(path.join(root, png))], [137, 80, 78, 71])
    await assert.rejects(() => store.exportAsset('../escape.png', new Uint8Array([1])), /文件名无效/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('persists Canvas image assets inside the diagram asset directory and reads them back safely', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-image-'))
  try {
    const store = await DiagramStore.open(root)
    const diagram = await store.create('canvas', 'Image Board', 'freeform')
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const imported = await store.importCanvasImage(diagram.path, 'Screen Shot.png', 'image/png', bytes)
    assert.match(imported.path, /^docs\/diagrams\/assets\/screen-shot-[a-f0-9]{8}\.png$/)
    assert.equal(imported.mimeType, 'image/png')
    const loaded = await store.readCanvasImage(imported.path)
    assert.equal(loaded.mimeType, 'image/png')
    assert.deepEqual([...loaded.content], [...bytes])
    await assert.rejects(() => store.readCanvasImage('docs/diagrams/image-board.diagram.json'), /当前工作空间内/)
    await assert.rejects(() => store.importCanvasImage(diagram.path, 'icon.svg', 'image/svg+xml', bytes), /只支持 PNG、JPEG 和 WebP/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('creates and manages freeform Canvas diagrams beside Mermaid files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex-diagram-canvas-'))
  try {
    const store = await DiagramStore.open(root)
    const canvas = await store.create('canvas', 'Service Landscape')
    assert.equal(canvas.path, 'docs/diagrams/service-landscape.diagram.json')
    assert.equal(canvas.type, 'canvas')
    assert.equal(parseCanvasScene(canvas.source).elements.length, 0)

    const architecture = await store.create('canvas', 'Architecture Board', 'architecture')
    assert.equal(parseCanvasScene(architecture.source).workbench, 'architecture')
    assert.equal(parseCanvasScene(architecture.source).elements.length, 0)

    const mermaid = await store.create('sequence', 'Request Flow')
    assert.deepEqual(new Set((await store.list()).map((item) => item.type)), new Set(['canvas', 'sequence']))

    const renamed = await store.rename(canvas.path, 'Platform Canvas', canvas.modifiedAt)
    assert.equal(renamed.path, 'docs/diagrams/platform-canvas.diagram.json')
    const duplicated = await store.duplicate(renamed.path)
    assert.equal(duplicated.path, 'docs/diagrams/platform-canvas-copy.diagram.json')
    assert.equal(duplicated.type, 'canvas')

    const sourceFiles = await store.listSourceFiles()
    assert.ok(!sourceFiles.includes(renamed.path))
    assert.ok(!sourceFiles.includes(duplicated.path))
    assert.ok(!sourceFiles.includes(mermaid.path))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
