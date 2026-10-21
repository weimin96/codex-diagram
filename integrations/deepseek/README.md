# Diagram for DeepSeek Harness

在 DeepSeek Harness 的聊天右侧创建、查看和编辑 Mermaid 图表与自由布局 Canvas，图表保存在项目的 `docs/diagrams/` 中。

## 安装

在 DeepSeek Desktop 的“插件 → 添加插件”中输入：

```text
@weimin96/diagram-plugin@0.20.0
```

也可以在完整退出 Desktop 后，使用应用提供的 `dsh` 命令安装：

```sh
dsh plugin --profile desktop add @weimin96/diagram-plugin@0.20.0
```

重新打开 Desktop，在项目聊天标题栏点击 Diagram，或让助手调用 Diagram 工具打开画板。此包已包含编译产物，不需要克隆仓库、构建或单独配置 MCP 服务。

## 能力

- Mermaid 流程图、时序图、ER 图等结构化图表。
- Canvas 节点、连接、布局、源码编辑与保存。
- 对话工具操作后，右侧画板跟随到相应图表。
- AI 对已有图的修改可先形成 Proposal，确认后写盘。
- 会话与项目状态隔离，保存时检查版本冲突。

## 兼容性

本版本面向 DeepSeek Harness Desktop `0.2.1-rc.2`，已在 macOS 原生应用中验证模型工具、面板、Mermaid、Canvas、Proposal 和重启后的文件读取。Windows、Linux 及其他宿主版本尚未完成原生验收。

使用 Desktop 自带的运行时；独立 Node.js 运行环境需为 Node.js 22 或更高版本。不要为同一插件再配置通用 MCP 客户端，以免创建重复实例。

已保存文件可以在重启后重新打开，当前图选择和未确认 Proposal 为进程内状态。

## 许可

MIT。第三方资源声明见包内 `THIRD_PARTY_NOTICES.md`，依赖的许可注释保留在构建产物中。
