# Diagram Plugin

在 Codex 与 DeepSeek Harness 的聊天右侧创建、查看和编辑 Mermaid 图表与 Canvas 画板。图表以纯文本保存在项目的 `docs/diagrams/` 中，可读、可 diff、可版本控制。

## 安装

### Codex Desktop / CLI

安装 Codex CLI 与 Node.js 22+ 后运行（npm 包 `0.20.1` 及以上）：

```sh
npx @weimin96/diagram-plugin@latest install --codex
```

安装器自动注册 Codex marketplace 和 MCP 服务，无需拉取源码或安装 pnpm。完成后重新打开 Codex Desktop。

### DeepSeek Harness

在 DeepSeek Desktop 的「插件 → 添加插件」中输入：

```text
@weimin96/diagram-plugin
```

也可以完全退出 Desktop 后，使用自带的 `dsh` 命令安装：

```sh
dsh plugin --profile desktop add @weimin96/diagram-plugin
```

重新打开 Desktop，在项目聊天标题栏点击 **Diagram**，或让助手调用图表工具打开画板。此包已包含编译产物，不需要克隆仓库、构建或单独配置 MCP 服务。

> 不要为同一个 Diagram 再配置通用 MCP 客户端，以免创建重复实例。

## 功能

- 19 种 Mermaid 图表：流程图、时序图、思维导图（脑图）、类图、ER 图、状态图、甘特图、时间线、Git 分支图、用户旅程、四象限、看板、需求图、桑基图、XY 图、饼图、雷达图、矩形树图、鱼骨图。
- Canvas 画板：架构、流程和自由画布三种工作台，支持节点、连线、分组、泳道、对齐与导出。
- 对话联动：助手读取、创建或修改图表后，右侧面板自动跟随。
- 可审查修改：AI 对已有图的修改先生成 Proposal，确认后才写入磁盘。
- 安全写入：会话与项目状态隔离，保存时检查版本冲突。
- 源码绑定：Canvas 节点可关联真实源码文件，并分析 Git 改动的影响范围。

## 兼容性

本版本面向 DeepSeek Harness Desktop `0.2.1-rc.2`，已在 macOS 原生应用中验证模型工具、面板、Mermaid、Canvas、Proposal 和重启后的文件读取。Windows、Linux 及其他宿主版本尚未完成原生验收。

使用 Desktop 自带的运行时；独立 Node.js 运行环境需为 Node.js 22 或更高版本。

已保存文件可以在重启后重新打开，当前图选择和未确认 Proposal 为进程内状态。

## 开发与许可

源码、开发说明与问题反馈：<https://github.com/weimin96/diagram-plugin>

基于 MIT License 开源。第三方资源声明见包内 `THIRD_PARTY_NOTICES.md`，依赖的许可注释保留在构建产物中。
