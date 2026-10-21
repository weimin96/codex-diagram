import { build } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = path.join(root, 'package')
const dist = path.join(packageRoot, 'dist')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)

await rm(packageRoot, { recursive: true, force: true })
await mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true })
await mkdir(path.join(packageRoot, 'assets'), { recursive: true })
await mkdir(dist, { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/server.ts')],
  outfile: path.join(dist, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  banner: { js: "import { createRequire as createNodeRequire } from 'node:module'; const require = createNodeRequire(import.meta.url);" },
  define: { __CODEX_DIAGRAM_VERSION__: JSON.stringify(version) },
})

await build({
  entryPoints: [path.join(root, 'src/app.tsx')],
  outfile: path.join(dist, 'app.js'),
  bundle: true,
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: true,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    __CODEX_DIAGRAM_VERSION__: JSON.stringify(version),
  },
})

const stylesheetPath = path.join(root, 'src/styles.css')
const stylesheet = await readFile(stylesheetPath, 'utf8')
const compiledStylesheet = await postcss([tailwindcss()]).process(stylesheet, {
  from: stylesheetPath,
  to: path.join(dist, 'app.css'),
})
await writeFile(path.join(dist, 'app.css'), compiledStylesheet.css)
const pluginManifest = JSON.parse(await readFile(path.join(root, 'manifest/plugin.json'), 'utf8'))
pluginManifest.version = version
await writeFile(path.join(packageRoot, '.codex-plugin/plugin.json'), `${JSON.stringify(pluginManifest, null, 2)}\n`)
await cp(path.join(root, 'manifest/mcp.json'), path.join(packageRoot, '.mcp.json'))
await cp(path.join(root, 'assets/icon.svg'), path.join(packageRoot, 'assets/icon.svg'))
await cp(path.join(root, 'assets/icon-dark.svg'), path.join(packageRoot, 'assets/icon-dark.svg'))

console.log(`Built Codex Diagram plugin: ${packageRoot}`)

await build({
  entryPoints: [path.join(root, 'integrations/deepseek/host.mjs')],
  outfile: path.join(dist, 'deepseek-host.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['@deepseek-ai/*'],
  define: { __CODEX_DIAGRAM_VERSION__: JSON.stringify(version) },
  banner: { js: "import { createRequire as createNodeRequire } from 'node:module'; const require = createNodeRequire(import.meta.url);" },
})
const clientBuild = await build({
  entryPoints: [path.join(root, 'integrations/deepseek/client.mjs')],
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'cjs',
  external: ['react'],
  write: false,
})
await writeFile(path.join(dist, 'deepseek-client.js'), `window.__ModuleLoader__.load({id:"@weimin96/diagram-deepseek",factory:(require)=>{const module={exports:{}};const exports=module.exports;\n${clientBuild.outputFiles[0].text}\nreturn module.exports;}});\n`)
await mkdir(path.join(packageRoot, 'locale'), { recursive: true })
await cp(path.join(root, 'integrations/deepseek/locale/en.json'), path.join(packageRoot, 'locale/en.json'))
await cp(path.join(root, 'integrations/deepseek/locale/zh.json'), path.join(packageRoot, 'locale/zh.json'))
await writeFile(path.join(packageRoot, 'package.json'), `${JSON.stringify({
  name: '@weimin96/diagram-deepseek', version, type: 'module',
  description: '在 DeepSeek Harness 中编辑 Mermaid 与 Canvas 图表。',
  keywords: [
    'dsh-plugin', 'deepseek', 'deepseek-harness', 'dsh', 'diagram', 'mermaid',
    'canvas', 'architecture', 'visualization', 'mcp', 'cordis',
  ],
  license: packageJson.license,
  repository: { type: 'git', url: 'git+https://github.com/weimin96/codex-diagram.git' },
  engines: { node: '>=22', dsh: '>=0.2.0-rc.1 <0.3.0-0' },
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
  icon: './assets/icon.svg',
  files: ['dist/*.mjs', 'dist/*.js', 'dist/*.css', 'assets/*.svg', 'locale/*.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
  main: './dist/deepseek-host.mjs',
  exports: {
    '.': './dist/deepseek-host.mjs',
    './client': './dist/deepseek-client.js',
    './icon': './assets/icon.svg',
    './locale/*.json': './locale/*.json',
    './package.json': './package.json',
    './cordis.patch.yml': './cordis.patch.yml',
  },
  dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [
    '@deepseek-ai/dsh-api-gateway', '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-sidebar-right', '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-client-ui-theme',
  ] } },
  peerDependencies: {
    '@deepseek-ai/cordis': '~4.0.5',
    '@deepseek-ai/dsh-mcp-client': '0.2.1-rc.2',
    '@deepseek-ai/dsh-api-session-controller': '0.2.1-rc.2',
    '@deepseek-ai/dsh-client-connection': '0.2.1-rc.2',
    '@deepseek-ai/dsh-working-directory': '0.2.1-rc.2',
    '@deepseek-ai/dsh-system-prompt': '0.2.1-rc.2',
    '@deepseek-ai/dsh-tools': '0.2.1-rc.2',
  },
}, null, 2)}\n`)
await cp(path.join(root, 'integrations/deepseek/cordis.patch.yml'), path.join(packageRoot, 'cordis.patch.yml'))
await cp(path.join(root, 'integrations/deepseek/README.md'), path.join(packageRoot, 'README.md'))
await cp(path.join(root, 'LICENSE'), path.join(packageRoot, 'LICENSE'))
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(packageRoot, 'THIRD_PARTY_NOTICES.md'))
console.log(`Built DeepSeek Diagram plugin: ${packageRoot}`)
