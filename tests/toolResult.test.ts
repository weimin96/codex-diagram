import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeToolResultFallback, extractToolResultError, extractToolResultPayload } from '../src/toolResult.js'

test('prefers structured content when the host preserves it', () => {
  const payload = extractToolResultPayload<{ ok: boolean }>({
    structuredContent: { ok: true },
    content: [{ type: 'text', text: encodeToolResultFallback({ ok: false }) }],
  })
  assert.deepEqual(payload, { ok: true })
})

test('falls back to bridge JSON text when structured content is stripped', () => {
  const payload = extractToolResultPayload<{ kind: string; value: number }>({
    content: [{ type: 'text', text: encodeToolResultFallback({ kind: 'revision', value: 7 }) }],
  })
  assert.deepEqual(payload, { kind: 'revision', value: 7 })
})

test('ignores normal human-readable tool text', () => {
  assert.equal(extractToolResultPayload({ content: [{ type: 'text', text: 'not bridge json' }] }), undefined)
})

test('preserves the actual server tool error instead of reporting missing structured content', () => {
  assert.equal(extractToolResultError({
    isError: true,
    content: [{ type: 'text', text: 'Diagram does not exist: docs/diagrams/missing.mmd' }],
  }), 'Diagram does not exist: docs/diagrams/missing.mmd')
})
