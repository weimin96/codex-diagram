import { App } from '@modelcontextprotocol/ext-apps'
import { OpenAIExtensions } from '@openai/mcp-extensions/app'
import type { DiagramHost } from './types.js'

export function createCodexHost(version: string): DiagramHost {
  const app = new App({ name: 'diagram-plugin-sidebar', version })
  const extensions = new OpenAIExtensions(app)
  return {
    canSelectWorkspace: true,
    connect: () => app.connect(),
    getHostContext: () => app.getHostContext(),
    onContextChanged: (listener) => { app.addEventListener('hostcontextchanged', listener) },
    onToolResult: (listener) => { app.ontoolresult = listener },
    callServerTool: (request, options) => app.callServerTool(request, options),
    get sendMessage() {
      return extensions.message ? async (text: string) => {
        await extensions.message!.send({
          role: 'user', content: [{ type: 'text', text }],
          _meta: { 'openai/message': { target: 'active', send: true } },
        })
      } : undefined
    },
    get files() { return extensions.files },
    get downloadFile() {
      return app.getHostCapabilities()?.downloadFile ? app.downloadFile.bind(app) : undefined
    },
  }
}
