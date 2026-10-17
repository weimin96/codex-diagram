import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { canvasSceneToSvg, parseCanvasScene, serializeCanvasScene } from '../src/canvas.js'
import { canvasStyledBox, canvasVisualSkin, canvasVisualStyles } from '../src/canvasVisualStyles.js'
import { buildGenerationPrompt, buildModificationPrompt } from '../src/aiPrompts.js'

test('内置样式可持久化且只改变渲染，不改写图表内容和手工样式', () => {
  const scene = parseCanvasScene(readFileSync(new URL('./fixtures/canvas-labels/chinese-relations.diagram.json', import.meta.url), 'utf8'))
  const original = serializeCanvasScene(scene)
  const outputs = new Set<string>()
  for (const style of canvasVisualStyles) {
    const styled = parseCanvasScene(serializeCanvasScene({ ...scene, style: style.id }))
    assert.equal(styled.style, style.id)
    assert.deepEqual(styled.elements, scene.elements)
    outputs.add(canvasSceneToSvg(styled))
    assert.match(canvasSceneToSvg(styled, { background: '#18181b' }), /#f8fafc/)
  }
  assert.equal(outputs.size, canvasVisualStyles.length)
  assert.equal(serializeCanvasScene(scene), original)
  const node = { id: 'manual', type: 'node' as const, text: '手工节点', x: 20, y: 20, width: 100, height: 60, fillColor: '#ffeecc', strokeColor: '#123456', strokeWidth: 4, cornerRadius: 7 }
  assert.deepEqual(canvasStyledBox(node, canvasVisualSkin('ocean', false)), node)
  assert.throws(() => parseCanvasScene(JSON.stringify({ ...scene, style: 'unsupported' })), /不支持的画布样式/)
  assert.equal(parseCanvasScene(original).style, undefined)
  const architecture = { ...scene, architecture: { theme: 'technical' as const } }
  assert.equal(canvasSceneToSvg({ ...architecture, style: 'ink' }), canvasSceneToSvg(architecture))
})

test('AI 生成合同包含样式选择场景，局部修改保留原样式', () => {
  const prompt = buildGenerationPrompt('/workspace', { type: 'canvas', title: '审批流程', scope: '', instructions: '' })
  for (const style of canvasVisualStyles) assert.ok(prompt.includes(`scene.style="${style.id}"`))
  assert.match(prompt, /主动选择/)
  assert.match(buildModificationPrompt('/workspace', { path: 'flow.diagram.json', name: '审批流程', type: 'canvas', modifiedAt: '', source: '{}' }, '修改节点标题'), /scene.style/)
})
