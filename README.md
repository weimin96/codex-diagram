# Codex Diagram

Codex 的可视化图表插件。**主使用方式是当前聊天右侧的 Diagram 伴随面板**：一边和 Codex 对话，一边查看、编辑和跟随当前图；全局 `Diagram 图表库` 只负责图表浏览、CRUD、导出和完整分屏编辑。结构化图使用 Mermaid，直接读写 `.mmd` / `.mermaid`；自由布局图使用可版本控制的 `.diagram.json` Canvas 文档。v0.8 起 Canvas 支持缩放/平移、多选、框选、复制粘贴、撤销重做、节点 resize、对齐/分布、对象锁定、图层顺序、样式 Inspector、MiniMap 与选区 Codex 上下文。

当前支持：

- Thread 伴随模式：从当前聊天的“插件和 MCP”打开 Diagram，右侧只保留当前图、预览/源码和高频对话操作
- AI 可直接打开伴随面板：`diagram.thread` 同时对 model/app 可见，因此可以直接在聊天里说“打开右侧画板/Diagram”，让 Codex 调 MCP 工具打开右侧面板
- 聊天目录优先：模型调用 `diagram.create` 时默认使用当前 thread 绑定的项目目录，不需要传 `workspacePath`；新图统一进入该项目的 `docs/diagrams/`
- 自由画板：让 Codex 调 `diagram.create(type=canvas)` 即可在当前聊天项目中创建 `.diagram.json` 画板，创建后右侧面板自动跟随到新画板
- 对话双向联动：Codex 在同一聊天调用 `diagram.get/create/update/rename/duplicate` 后，右侧面板自动跟随到对应图；用户在面板切图后，Model Context 也同步回当前聊天
- Thread 右侧会把当前聊天最近涉及的图表收进临时 Tabs；Codex 操作新图时自动加入，用户可手动切换/关闭，最多保留 6 张，避免架构图、时序图、ER 图之间反复使用下拉框
- “跟随”可随时暂停，避免 Codex 为分析临时读取其他图时右侧面板频繁跳转；恢复后会继续跟随当前对话状态
- Thread 空面板会自动发现当前项目中新创建或恢复的图表，不需要关闭重开 Diagram
- `diagram.thread` 是唯一的右侧面板打开入口：模型可直接调用它，Host 以 fullscreen side-tab 自动打开一个持续复用的 `Diagram` 标签；后续 `diagram.get/create/update` 只改数据，由该面板自动跟随，避免每个业务工具各开一个标签页
- 当前图被 Codex、IDE 或其他外部进程删除时，右侧会自动刷新并切换到其他可用图表，不会继续对失效路径轮询报错
- 内部 MCP bridge 对 Host 丢失 `structuredContent` 的情况提供 JSON fallback；后台同步异常会自动重试，不直接用红色错误条打断工作流
- 高频联动操作：“按对话更新”“补异常”“解释”，直接复用当前 Codex 对话，不在插件内部再造一套聊天框
- Global 图表库：保留图表搜索、新建、重命名、复制、删除、导出和完整分屏编辑，作为管理入口而不是默认工作流
- 流程图 Flowchart
- 时序图 Sequence Diagram
- 思维脑图 Mindmap
- 类图 Class Diagram
- ER 图
- 状态图 State Diagram
- 甘特图 Gantt
- 时间线 Timeline
- Git 分支图 Git Graph
- 用户旅程 User Journey
- 四象限图 Quadrant
- 工作空间自动识别与 Mermaid 文件扫描
- CodeMirror 源码编辑器：行号、语法高亮、搜索、撤销/重做与编辑快捷键
- 实时预览、源码编辑、分屏模式
- `Cmd/Ctrl + S` 保存
- MCP `list / get / create / update` 工具，供 Codex 直接操作图表
- 新图默认保存到 `docs/diagrams/`
- 从当前 Codex 对话发起“从代码生成图表”
- 让 Codex 补异常路径、简化结构、整理布局或按自定义要求修改当前图
- Codex / 外部编辑器写回后自动同步当前图
- 导出 SVG 与 2x PNG（超大图自动限制到安全画布尺寸）；Host 支持文件下载时走原生下载，否则保存到 `docs/diagrams/exports/`
- 预览画布支持拖拽、滚轮平移、缩放、100% 与适配
- 图表侧栏支持搜索、收起与展开
- 分屏模式支持拖动调整 Mermaid 源码与预览宽度
- 保存时使用文件 revision 防止覆盖 Codex / IDE 的并发修改
- 图表支持重命名、复制与删除；重命名和删除同样带 revision 并发保护
- 自由画布支持节点、备注、连接、拖拽、文字编辑、缩放/平移、多选/框选、复制粘贴、撤销重做、节点 resize、对齐/等距分布、删除，并与 Mermaid 共用保存、并发保护和导出链路
- Canvas 节点支持默认/强调/成功/警告/危险/弱化语义色，圆角/方形/胶囊形状，以及锁定；连线支持标签、实线/虚线、直线/正交路由、四向锚点和可拖动手工折点
- Canvas 支持右键菜单、前后图层调整和 MiniMap；锁定节点仍可选中查看，但不会被拖动、resize、对齐或 AI 无意重排
- Canvas 支持节点组合/取消组合；组内任一节点默认按组选择和移动，Alt 可临时单独操作一个成员；复制组合会生成新的 groupId，不会和原组合串联
- Canvas 连线支持四向锚点和手工折点：选中节点会显示边缘连接点，选中连线可以添加/拖动/双击删除折点；SVG/PNG 导出使用同一套路径数据
- Canvas 节点可绑定一个或多个真实工作区源码文件；Inspector 支持真实源码搜索、绑定、移除和原生打开，绑定信息会同步给 Codex Model Context
- MCP `diagram.findBySource` 可按源码文件反查关联的 Canvas 节点；唯一命中时会同步当前聊天 active diagram + element ids，右侧会自动切图、选中节点并聚焦视口
- Canvas 选中元素会同步到当前聊天 Model Context；右侧可直接“调整选中”，让 Codex 只修改当前选区
- Codex / IDE 外部更新图表后会保留修改前快照，可在右侧“查看变更”，并一键恢复旧版
- Canvas 文档默认保存为 `docs/diagrams/*.diagram.json`，可以直接进入 Git diff，也不会被源码选择器误当成业务 JSON
- Codex 生成面板可以直接选择“自由画布”或“架构画布”预设，生成时使用独立 Canvas JSON 协议，不会混入 Mermaid 语法
- 从代码生成内置架构依赖、调用链、数据模型、状态流转四种快捷预设
- `工作区→图` 快捷入口，可让 Codex 从整个 Workspace 提炼核心结构
- “文件或目录”支持搜索真实工作区源码路径，不需要手敲文件名
- 当前图可通过 Codex Host 原生文件能力直接打开，继续在 Host / VS Code 中编辑

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

安装后推荐的正常使用路径：

1. 新建或打开一个 Codex 聊天。
2. 从当前聊天的“插件和 MCP”打开 `Diagram`，右侧显示伴随面板。
3. 直接在聊天里让 Codex 生成、修改或解释图表；面板会跟随当前图。
4. 需要批量管理、导出或完整分屏编辑时，再打开全局 `Diagram 图表库`。

也可以完全通过对话启动，例如：`调用 Diagram MCP 打开右侧画板，然后在当前聊天项目里创建一个“登录架构”自由画板并开始绘制。` Codex 会先调用 `diagram.thread`，再调用 `diagram.create(type=canvas)`；画板文件保存到当前聊天项目的 `docs/diagrams/`。

## MCP 工具

| Tool | 用途 |
| --- | --- |
| `diagram.thread` | 在当前聊天旁打开 Diagram 伴随面板 |
| `diagram.workspace` | 打开全局 Diagram 图表库 / 管理工作台 |
| `diagram.threadState` | UI 内部同步当前聊天正在操作的图表 |
| `diagram.list` | 列出当前工作空间图表 |
| `diagram.get` | 读取一个 Mermaid / Canvas 图表 |
| `diagram.revision` | UI 内部检查当前图是否发生磁盘变更 |
| `diagram.sources` | UI 内部搜索当前工作空间真实源码路径 |
| `diagram.findBySource` | 按源码文件反查绑定的 Canvas 节点 |
| `diagram.create` | 在 `docs/diagrams/` 创建图表 |
| `diagram.update` | 更新已有图表源码 |
| `diagram.rename` | 重命名图表 |
| `diagram.duplicate` | 复制图表 |
| `diagram.delete` | 删除图表 |
| `diagram.exportAsset` | Host 不支持原生下载时，UI 内部保存 SVG / PNG 导出文件 |

## 当前边界

当前已经支持 Mermaid + 内置自由 Canvas 双模式。Canvas v1 聚焦架构草图需要的节点、备注和连接，暂不追求 Excalidraw 的完整手绘、图片和多人协作能力；文件协议和渲染器已分层，后续可以继续接 Excalidraw adapter。更深的代码图谱索引也放在后续阶段。

当前 Codex MCP App Host 提供 `files.open(path)`，但没有公开“当前活动编辑器文件 / 当前代码选区”的读取接口。因此插件不会伪装成能自动读取 IDE 选区：生成时可以从真实工作区路径选择文件/目录，或者让 Codex 根据当前对话与整个工作区定位实现；后续 Host 提供 active file / selection API 后再直接接入。
