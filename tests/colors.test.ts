import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMermaidColor } from '../src/colors.js'

test('converts CSS Color 4 srgb colors to Mermaid-compatible rgb values', () => {
  assert.equal(
    normalizeMermaidColor('color(srgb 0.964706 0.964706 0.964706 / 0.75)', '#fff'),
    'rgba(246, 246, 246, 0.75)',
  )
  assert.equal(normalizeMermaidColor('color(srgb 0.1 0.2 0.3)', '#fff'), 'rgb(26, 51, 77)')
})

test('keeps Mermaid-compatible colors and rejects unsupported formats', () => {
  assert.equal(normalizeMermaidColor('rgba(1, 2, 3, 0.4)', '#fff'), 'rgba(1, 2, 3, 0.4)')
  assert.equal(normalizeMermaidColor('oklab(0.5 0 0)', '#fff'), '#fff')
})
