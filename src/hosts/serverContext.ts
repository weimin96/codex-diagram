import path from 'node:path'

export interface DiagramSessionContext {
  host: 'deepseek'
  sessionId: string
  workspacePath: string
}

export function diagramSessionContext(meta: unknown): DiagramSessionContext | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const context = (meta as Record<string, unknown>)['diagram/context']
  if (context === undefined) return undefined
  if (!context || typeof context !== 'object') throw new Error('Diagram 会话上下文无效。')
  const value = context as Record<string, unknown>
  if (value.host !== 'deepseek' || typeof value.sessionId !== 'string' || !value.sessionId.trim()
    || typeof value.workspacePath !== 'string' || !path.isAbsolute(value.workspacePath)) {
    throw new Error('Diagram 会话身份或工作区无效。')
  }
  return value as unknown as DiagramSessionContext
}
