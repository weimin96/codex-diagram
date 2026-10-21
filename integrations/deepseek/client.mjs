import React, { useEffect, useRef, useState } from 'react'

export const inject = ['sidebarRight', 'sidebarRightTabs', 'slots', 'remote', 'remote.session', 'theme']
const tabId = '@local/diagram-deepseek'

function requestFetch(input, init) {
  return (globalThis.__DSH_TRANSPORT__?.fetch ?? globalThis.fetch)(input, init)
}

async function callHost(sessionId, method, params, signal) {
  const response = await requestFetch('api/diagram/call', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, method, params }), signal,
  })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`图表服务返回了无效响应（HTTP ${response.status}）。`)
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(body.error ?? `图表服务请求失败：${response.status}`)
  return body.result
}

function hostContext(ctx, element) {
  const styles = getComputedStyle(element)
  const aliases = {
    '--color-background-primary': '--dsw-alias-bg-base',
    '--color-background-secondary': '--dsw-alias-bg-layer-1',
    '--color-background-tertiary': '--dsw-alias-bg-layer-2',
    '--color-text-primary': '--dsw-alias-label-primary',
    '--color-text-secondary': '--dsw-alias-label-secondary',
    '--color-text-tertiary': '--dsw-alias-label-tertiary',
    '--color-border-primary': '--dsw-alias-border-l2',
    '--color-border-secondary': '--dsw-alias-border-l4',
    '--color-accent-primary': '--dsw-alias-brand-primary',
    '--color-text-danger': '--dsw-alias-state-error-primary',
  }
  const variables = Object.fromEntries(Object.entries(aliases)
    .map(([target, source]) => [target, styles.getPropertyValue(source).trim()]).filter(([, value]) => value))
  return { theme: ctx.theme.getTheme().active.colorScheme, styles: { variables } }
}

export function apply(ctx) {
  function DiagramBody({ sessionId, useSessions }) {
    const cwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd)
    const frame = useRef(null)
    const [html, setHtml] = useState('')
    const [error, setError] = useState('')
    useEffect(() => {
      setHtml('')
      setError('')
      const controller = new AbortController()
      let port
      let themeFrame
      const unsubscribeTheme = ctx.on('theme/change', () => {
        cancelAnimationFrame(themeFrame)
        themeFrame = requestAnimationFrame(() => {
          if (port && frame.current) port.postMessage({ type: 'context', context: hostContext(ctx, frame.current) })
        })
      })
      const receive = (event) => {
        if (event.source !== frame.current?.contentWindow || event.data?.type !== 'diagram.ready' || port) return
        const channel = new MessageChannel()
        port = channel.port1
        port.onmessage = async ({ data }) => {
          try {
            let result
            if (data.method === 'tool') result = await callHost(sessionId, 'tool', data.params, controller.signal)
            else if (data.method === 'message') {
              if (typeof data.params?.text !== 'string' || !data.params.text.trim()) throw new Error('对话消息不能为空。')
              const response = await ctx.remote.session.prompt({
                sessionId, requestId: crypto.randomUUID(), mode: 'queue',
                content: [{ type: 'text', text: data.params.text }],
              }, controller.signal)
              if (!response.ok) throw response.error
            } else if (data.method === 'openFile') {
              const filePath = await callHost(sessionId, 'filePath', data.params, controller.signal)
              const response = await ctx.remote.session.openWorkspacePath({ path: filePath, action: 'open' }, controller.signal)
              if (!response.ok) throw response.error
            } else throw new Error('未知的 Diagram 宿主请求。')
            port?.postMessage({ id: data.id, result })
          } catch (cause) {
            port?.postMessage({ id: data.id, error: cause instanceof Error ? cause.message : String(cause) })
          }
        }
        frame.current.contentWindow.postMessage({ type: 'diagram.connect', context: hostContext(ctx, frame.current) }, '*', [channel.port2])
      }
      window.addEventListener('message', receive)
      void (async () => {
        try {
          const response = await requestFetch('api/diagram/app', { signal: controller.signal })
          if (!response.ok) throw new Error(`加载 Diagram 失败：${response.status}`)
          setHtml(await response.text())
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
        }
      })()
      return () => { controller.abort(); cancelAnimationFrame(themeFrame); unsubscribeTheme(); port?.close(); window.removeEventListener('message', receive) }
    }, [sessionId, cwd])
    if (error) return React.createElement('div', { role: 'alert' }, error)
    if (!html) return React.createElement('div', null, '正在连接 Diagram…')
    return React.createElement('iframe', {
      ref: frame, srcDoc: html, title: 'Diagram', sandbox: 'allow-scripts allow-downloads',
      style: { width: '100%', height: '100%', border: 0, display: 'block' },
    })
  }

  function DiagramEntry({ sessionId }) {
    const [error, setError] = useState('')
    useEffect(() => {
      const controller = new AbortController()
      let previous = 0
      let timer
      async function poll() {
        try {
          if (ctx.sidebarRight.mounted.getSnapshot() === sessionId) {
            const status = await callHost(sessionId, 'status', {}, controller.signal)
            if (status.openRequest > previous) {
              ctx.sidebarRight.openTab('diagram')
              previous = status.openRequest
            }
            setError('')
          }
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          if (!controller.signal.aborted) timer = setTimeout(poll, 1500)
        }
      }
      void poll()
      return () => { controller.abort(); clearTimeout(timer) }
    }, [sessionId])
    return React.createElement('button', {
      type: 'button', title: error || '打开 Diagram',
      onClick: () => { try { ctx.sidebarRight.openTab('diagram') } catch (cause) { setError(String(cause)) } },
      style: { background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: '4px 8px' },
    }, error ? 'Diagram 连接失败' : 'Diagram')
  }

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: tabId, kind: 'diagram', title: () => 'Diagram', keepMounted: true,
    guide: [{ id: 'diagram', order: 35, title: () => 'Diagram' }],
  }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: tabId }, DiagramBody)))
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'diagram' }, DiagramEntry)))
}
