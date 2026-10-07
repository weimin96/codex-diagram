import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
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
