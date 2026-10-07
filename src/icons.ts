import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Icon } from '@modelcontextprotocol/sdk/types.js'
import type { OpenAIUiEntrypoint } from '@openai/mcp-extensions/server'

const iconSize = '256x256'

async function svgIcon(assetDir: string, filename: string, theme: 'light' | 'dark'): Promise<Icon> {
  const svg = await readFile(path.join(assetDir, filename), 'utf8')
  return {
    src: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
    mimeType: 'image/svg+xml',
    sizes: [iconSize],
    theme,
  }
}

export async function loadDiagramIcons(assetDir = path.resolve(process.cwd(), 'assets')): Promise<Icon[]> {
  return Promise.all([
    svgIcon(assetDir, 'icon.svg', 'light'),
    svgIcon(assetDir, 'icon-dark.svg', 'dark'),
  ])
}

export function diagramGlobalEntrypoint(icons: Icon[]): OpenAIUiEntrypoint {
  return {
    type: 'global',
    quickAction: {
      title: 'Diagram',
      icons,
      target: { type: 'tool', name: 'diagram.workspace' },
    },
  }
}
