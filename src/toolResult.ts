export const TOOL_RESULT_JSON_PREFIX = '__CODEX_DIAGRAM_JSON__:'

export interface ToolResultLike {
  isError?: boolean
  structuredContent?: unknown
  content?: Array<{ type?: string; text?: string }>
}

export function encodeToolResultFallback(value: unknown): string {
  return `${TOOL_RESULT_JSON_PREFIX}${JSON.stringify(value)}`
}

export function extractToolResultPayload<T>(result: ToolResultLike): T | undefined {
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent as T
  }

  for (const block of result.content ?? []) {
    if (block.type !== 'text' || typeof block.text !== 'string' || !block.text.startsWith(TOOL_RESULT_JSON_PREFIX)) continue
    try {
      return JSON.parse(block.text.slice(TOOL_RESULT_JSON_PREFIX.length)) as T
    } catch {
      return undefined
    }
  }
  return undefined
}

export function extractToolResultError(result: ToolResultLike): string | undefined {
  if (!result.isError) return undefined
  const messages = (result.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && !block.text.startsWith(TOOL_RESULT_JSON_PREFIX))
    .map((block) => block.text!.trim())
    .filter(Boolean)
  return messages.length > 0 ? messages.join('\n') : '工具调用失败。'
}
