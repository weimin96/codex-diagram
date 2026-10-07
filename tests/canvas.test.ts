import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasSceneToSvg, createCanvasSource, parseCanvasScene, serializeCanvasScene } from '../src/canvas.js'

test('round-trips a Canvas scene and renders standalone SVG', () => {
  const source = createCanvasSource('Architecture')
  const scene = parseCanvasScene(source)
  assert.equal(scene.type, 'codex-diagram-canvas')
  assert.equal(scene.title, 'Architecture')
  assert.equal(scene.elements.filter((item) => item.type === 'node').length, 2)
  assert.equal(parseCanvasScene(serializeCanvasScene(scene)).elements.length, scene.elements.length)

  const svg = canvasSceneToSvg(scene)
  assert.match(svg, /^<svg /)
  assert.match(svg, /Architecture/)
  assert.match(svg, /marker-end="url\(#arrow\)"/)
})

test('rejects malformed Canvas documents', () => {
  assert.throws(() => parseCanvasScene('{bad json'), /JSON 格式无效/)
  assert.throws(() => parseCanvasScene('{"type":"other","version":1,"elements":[]}'), /受支持/)
})
