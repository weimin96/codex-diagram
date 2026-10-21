import type { App } from '@modelcontextprotocol/ext-apps'

export type HostContext = ReturnType<App['getHostContext']>

export interface DiagramHost {
  canSelectWorkspace: boolean
  connect(): Promise<void>
  getHostContext(): HostContext
  onContextChanged(listener: (context: HostContext) => void): void
  onToolResult(listener: NonNullable<App['ontoolresult']>): void
  callServerTool: App['callServerTool']
  sendMessage?: (text: string) => Promise<void>
  files?: { open(path: string): Promise<unknown> }
  downloadFile?: App['downloadFile']
}
