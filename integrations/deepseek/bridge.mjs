import path from 'node:path'
import { realpath } from 'node:fs/promises'

export function isModelTool(tool) {
  const visibility = tool._meta?.ui?.visibility
  return !Array.isArray(visibility) || visibility.includes('model')
}

export function toolName(rawName) {
  if (!/^diagram\.[A-Za-z][A-Za-z0-9]*$/.test(rawName)) throw new Error(`无效的 Diagram 工具名称：${rawName}`)
  return rawName.replace('.', '_')
}

export async function boundArguments(args, workspacePath) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('图表工具参数无效。')
  const workspace = await realpath(workspacePath)
  if (args.workspacePath !== undefined) {
    if (typeof args.workspacePath !== 'string' || !path.isAbsolute(args.workspacePath)
      || await realpath(args.workspacePath) !== workspace) throw new Error('图表操作超出当前会话工作区。')
  }
  return { ...args, workspacePath: workspace }
}

export function inspectionDirectory(inspection) {
  let directory = inspection.meta.cwd
  for (const event of inspection.events) {
    if (event.type === 'working-directory/change') directory = event.data.cwd
  }
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('当前会话没有有效的本地工作区。')
  return directory
}
