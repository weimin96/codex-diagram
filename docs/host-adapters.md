# 宿主适配与 DeepSeek 接入

Diagram 共用图表文件、服务工具和编辑器，宿主只负责会话、工具传输、消息与文件能力。

## 当前实现

| 位置 | 职责 |
| --- | --- |
| `src/hosts/types.ts` | 编辑器使用的宿主合同 |
| `src/hosts/codex.ts` | 现有 MCP Apps 与 OpenAI 扩展 |
| `src/hosts/deepseek.ts` | 与 DeepSeek 标签页通信的 MessagePort |
| `src/hosts/serverContext.ts` | 带宿主命名空间的会话和绝对工作区 |
| `integrations/deepseek/host.mjs` | stdio 子进程、模型工具和经过宿主认证的面板接口 |
| `integrations/deepseek/client.mjs` | 原生右侧标签页、共享编辑器和 Session Controller 调用 |

DeepSeek 模型与面板使用同一个服务实例。模型工具名为 `diagram_create` 等，内部工具不注册给模型。面板只能操作其所属会话的工作区。文件导出沿用 `docs/diagrams/exports/`。

画板运行在不含 `allow-same-origin` 的 sandbox iframe 内，通过父窗口核验及独立 MessagePort 交换请求，不接触宿主认证凭据。面板接口注册在 DeepSeek Connection 的 `/api` 路径下，沿用其认证、来源检查及 owner 限制，不另开端口。

写入采用进程内队列、跨进程工作区锁与 revision 检查。锁位于用户临时目录，适用于同一台机器、同一用户下的多个宿主，不提供跨机器分布式锁。外部编辑器如果不遵守锁协议，仍需依赖 revision 检查，不能保证任意外部写入者的事务隔离。

## 构建与安装

当前目标是 Desktop `0.2.1-rc.2`，按本机已安装包内接口核对；其他版本需要重新验证。

```sh
pnpm build
pnpm smoke
pnpm check:hosts
```

产物为 `package/`：保留 Codex 的 `.codex-plugin/plugin.json` 与 `.mcp.json`，同时包含 DeepSeek 的 npm 包声明及宿主、客户端入口。

可在 DeepSeek 插件管理中安装本地 `package/`。若使用 Desktop 自带 CLI，先完整退出 DeepSeek，再执行：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "file:/绝对路径/codex-diagram/package"
```

随后重新打开 Desktop。不要再为同一个 Diagram 配置通用 MCP 客户端，避免重复工具或模型与面板连接不同实例。同版本的 `file:` 依赖可能继续使用已安装副本。开发中重新构建后，需要在退出 Desktop 后先 `plugin --profile desktop remove @local/diagram-deepseek`，再执行上述添加命令，并检查插件已进入 `dsh.profile.bundles`。

## 验证

`pnpm check:hosts` 覆盖工作区越界拒绝、内部工具过滤、工作目录变化、真实 stdio 会话隔离、两个服务进程竞争同一 revision，以及 Proposal 确认流程。

可使用目标 Desktop 的 Electron 运行隔离检查，加载其实际 MCP 结果适配实现。该检查使用受控的会话和注册表替身，不修改 Desktop profile，不执行模型请求，不能代替原生界面验收。

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  scripts/verify-deepseek-runtime.mjs \
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh"
```

原生界面验收：

- 安装后打开本地项目聊天，从聊天标题区 Diagram 入口打开面板，应显示该项目图表。
- 新建 Mermaid 和 Canvas，保存、重开并导出，应操作同一份文件，导出进入项目导出目录。
- 聊天调用图表工具后面板跟随；已有图修改先形成 Proposal，接受前文件不变。
- 切换两个项目聊天，图表、选区和 Proposal 不应串用；主题切换同步到面板。
- Codex 与 DeepSeek 基于旧 revision 保存同一张图，应有一个请求明确报告冲突。
- 终止 Diagram 子进程后操作明确失败，重新加载插件恢复。当前不自动重放写操作；Proposal 为进程内状态，重载后需要重新生成。

## 新增其他宿主

实现 `DiagramHost` 所需的实际能力，并在宿主入口选择适配器。缺失的消息、文件打开和下载能力应显式声明；下载缺失时沿用既有服务端导出。

宿主端从真实会话取得身份与工作区，传入受控上下文，并确保模型与界面共享服务状态。不要把模型参数中的会话标识当成宿主权威，也不要为各宿主复制编辑器、存储或 Proposal 实现。


## Desktop 实测记录

2026-10-21，在 macOS 的 DeepSeek Harness Desktop `0.2.1-rc.2` 中完成本地安装与原生验收。插件通过 `dsh.bundle.patch` 启用，聊天入口注册到 `conversation.session.header.utilities` 列表插槽，避免占用右侧栏使用的单占位角落插槽。

服务资源按打包目录定位，不依赖 Desktop profile 的启动目录；集成测试也从项目外的临时目录启动 stdio 服务，防止仓库内运行掩盖路径错误。

使用 `test-results/deepseek-desktop-install/workspace/` 作为独立验收工作区：模型创建、更新和回读 Mermaid，右侧面板自动跟随并渲染；随后生成 Proposal，确认前读取磁盘仍为三个节点，在面板接受后磁盘与预览均变为四个节点。Canvas 由模型创建两个节点与一条连线，在原生 Inspector 中将文字改为“DeepSeek Desktop（已验证）”并保存，磁盘读取一致。完整退出并重启 Desktop 后，插件组件显示“1 运行中”，重新选择图表可读回已保存文字；当前图选择和待确认 Proposal 仍是进程内状态，不承诺跨重启恢复。更多界面证据保存在 `test-results/deepseek-desktop-install/`，该目录不进入 Git。

安装前的 desktop profile 清单与锁文件备份位于该目录的 `profile-backup/`。安装只增加当前插件，未变更其他插件或模型凭据。
