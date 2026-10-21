import type { DiagramHost, HostContext } from './types.js'

// The sandbox receives a dedicated port from its owning tab; it never holds Host credentials.
export function createDeepSeekHost(): DiagramHost {
  let port: MessagePort | undefined
  let context: HostContext
  let contextListener: ((context: HostContext) => void) | undefined
  let sequence = 0
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  function request(method: string, params: unknown): Promise<unknown> {
    if (!port) return Promise.reject(new Error('Diagram 宿主尚未连接。'))
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Diagram 宿主请求超时。')) }, 65_000)
      pending.set(id, { resolve, reject, timer })
      port!.postMessage({ id, method, params })
    })
  }
  return {
    canSelectWorkspace: false,
    connect: () => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('连接 DeepSeek Diagram 面板超时。')) }, 10_000)
      function receive(event: MessageEvent) {
        if (event.source !== window.parent || event.data?.type !== 'diagram.connect' || !event.ports[0] || port) return
        clearTimeout(timeout)
        window.removeEventListener('message', receive)
        port = event.ports[0]
        context = event.data.context
        port.onmessage = ({ data }) => {
          if (data.type === 'context') { context = data.context; contextListener?.(context); return }
          const operation = pending.get(data.id)
          if (!operation) return
          clearTimeout(operation.timer)
          pending.delete(data.id)
          if (typeof data.error === 'string') operation.reject(new Error(data.error))
          else operation.resolve(data.result)
        }
        resolve()
      }
      window.addEventListener('message', receive)
      window.parent.postMessage({ type: 'diagram.ready' }, '*')
    }),
    getHostContext: () => context,
    onContextChanged: (listener) => { contextListener = listener },
    onToolResult: () => {},
    callServerTool: async (params) => await request('tool', params) as Awaited<ReturnType<DiagramHost['callServerTool']>>,
    sendMessage: async (text) => { await request('message', { text }) },
    files: { open: async (path: string) => { await request('openFile', { path }) } },
  }
}
