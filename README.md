# Codex Diagram

Codex 的可视化图表侧边栏插件。第一版使用 Mermaid 作为统一图表 DSL，让 Codex 与 UI 编辑器直接读写工作空间中的同一份 `.mmd` / `.mermaid` 文件。

当前支持：

- 流程图 Flowchart
- 时序图 Sequence Diagram
- 思维脑图 Mindmap
- 类图 Class Diagram
- ER 图
- 状态图 State Diagram
- 工作空间自动识别与 Mermaid 文件扫描
- 实时预览、源码编辑、分屏模式
- `Cmd/Ctrl + S` 保存
- MCP `list / get / create / update` 工具，供 Codex 直接操作图表
- 新图默认保存到 `docs/diagrams/`

## 本地开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

## 安装到 Codex

安装方式与 `codex-git` 一致，项目会作为本地 marketplace 安装：

```bash
pnpm plugin:install
```

安装后在 Codex 的全局插件入口中打开 `Diagram`。

## MCP 工具

| Tool | 用途 |
| --- | --- |
| `diagram.workspace` | 打开 Diagram UI |
| `diagram.list` | 列出当前工作空间图表 |
| `diagram.get` | 读取一个 Mermaid 图表 |
| `diagram.create` | 在 `docs/diagrams/` 创建图表 |
| `diagram.update` | 更新已有图表源码 |

## 当前边界

第一阶段只接 Mermaid。Excalidraw / 自由画布、从代码自动推导调用链、SVG/PNG 导出和更完整的 AI 操作面板放到后续阶段。
