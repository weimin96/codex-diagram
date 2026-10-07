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
- 从当前 Codex 对话发起“从代码生成图表”
- 让 Codex 补异常路径、简化结构、整理布局或按自定义要求修改当前图
- Codex / 外部编辑器写回后自动同步当前图
- 通过 Codex Host 导出 SVG
- 预览画布支持拖拽、滚轮平移、缩放、100% 与适配
- 图表侧栏支持搜索、收起与展开
- 分屏模式支持拖动调整 Mermaid 源码与预览宽度
- 保存时使用文件 revision 防止覆盖 Codex / IDE 的并发修改

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

如果 Codex Desktop 已经打开，开发时可以安装后顺便刷新插件宿主：

```bash
pnpm plugin:install:desktop
```

安装后在 Codex 的全局插件入口中打开 `Diagram`。

## MCP 工具

| Tool | 用途 |
| --- | --- |
| `diagram.workspace` | 打开 Diagram UI |
| `diagram.list` | 列出当前工作空间图表 |
| `diagram.get` | 读取一个 Mermaid 图表 |
| `diagram.revision` | UI 内部检查当前图是否发生磁盘变更 |
| `diagram.create` | 在 `docs/diagrams/` 创建图表 |
| `diagram.update` | 更新已有图表源码 |

## 当前边界

当前仍以 Mermaid 为主。Excalidraw / 自由画布、PNG 导出、节点级可视化编辑和更深的代码图谱索引放到后续阶段。源码区目前还是轻量文本编辑器，后续再评估 CodeMirror/Monaco，避免为了行号和高亮引入不必要的体积。
