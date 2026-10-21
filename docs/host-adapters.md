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
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "file:/绝对路径/diagram-plugin/package"
```

随后重新打开 Desktop。不要再为同一个 Diagram 配置通用 MCP 客户端，避免重复工具或模型与面板连接不同实例。同版本的 `file:` 依赖可能继续使用已安装副本。开发中重新构建后，需要在退出 Desktop 后先 `plugin --profile desktop remove @weimin96/diagram-plugin`，再执行上述添加命令，并检查插件已进入 `dsh.profile.bundles`。

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


## npm 与 GitHub Actions 发布

正式包名为 `@weimin96/diagram-plugin`。构建包中的 npm 名称、客户端模块标识、标签页类型和 bundle 注册保持一致。

工作流 `.github/workflows/publish-plugin.yml` 支持手动指定版本，或推送 `diagram-plugin-v<版本>` 标签。版本必须与根目录 `package.json` 一致。工作流执行类型检查、构建、产物检查和宿主集成测试，再生成 tarball，在隔离目录解包并运行服务验证，最后发布同一个 tarball。Actions 也会保存该 tarball 作为运行产物。

发布使用 npm Trusted Publishing（OIDC），不配置 `NPM_TOKEN`。工作流使用 GitHub-hosted runner、Node.js 24、npm 11.21.0，并声明 `id-token: write`。

在 npm 包设置的 Trusted Publisher 中选择 GitHub Actions，填写：

- Organization or user：`weimin96`
- Repository：`diagram-plugin`
- Workflow filename：`publish-plugin.yml`
- Environment：留空（工作流未使用 GitHub Environment）
- Allowed actions：允许直接 `npm publish`

npm 当前要求配置 trust 的包已存在。新包需要先通过 npm 账号认证完成首次建包，再配置可信发布者；不能仅凭 GitHub 仓库身份首次占用 npm 包名。首次认证可以使用交互式 `npm login`，不必创建长期 CI token。当前源码仓库为私有，工作流显式关闭 npm provenance，不修改仓库可见性。

旧包 `@weimin96/diagram-deepseek` 已完成首次建包并绑定过 Trusted Publisher，现按“保留旧包、另发新包”的策略处理：旧包不再更新，也不再配置新的 trust。

新包 `@weimin96/diagram-plugin` 需要在 npm 上重新走一次首次建包（交互式 2FA 发布占位版本），再执行 `npm trust github` 绑定仓库 `weimin96/diagram-plugin`、工作流文件 `publish-plugin.yml`、不绑定 Environment，权限为 `publish`。完成后正式版本由工作流发布，本地不再需要长期 npm token。

本地验包：

```sh
pnpm build
mkdir -p release
npm pack ./package --ignore-scripts --pack-destination release
node scripts/check-deepseek-package.mjs release/weimin96-diagram-plugin-0.19.0.tgz
```

发布后，用户可在 Desktop 插件管理中输入包名，或完整退出应用后执行：

```sh
dsh plugin --profile desktop add @weimin96/diagram-plugin@0.19.0
```

改名前的 `@weimin96/diagram-deepseek`、更早的测试名 `@local/diagram-deepseek` 与正式名称都是不同包。已装旧包的用户应先移除旧插件，再安装新包，否则会重复注册 Diagram 标签页和工具。

Canvas 文档类型与 Mermaid 样式指令保留了向后兼容：读取时同时接受 `codex-diagram-canvas` 与 `%% codex-diagram:style=`，写入时统一使用新前缀，旧图可直接打开，首次保存后自动迁移。状态目录从 `~/.codex-diagram` 回退读取，新数据写入 `~/.diagram-plugin`。

## 插件市场发现

社区插件市场靠两条互相独立的通道发现插件，发布包必须同时满足。

**npm 关键词**。索引生成器用 `keywords:dsh-plugin` 搜索 npm，再逐包拉取 packument，只保留声明了 `dsh.bundle` 的包。构建产物因此写入 `keywords`（首个为 `dsh-plugin`）与 `dsh.bundle.patch`；缺任一项都不会被收录。关键词只认 `dsh-plugin`，不要用 `dsh` 代替——后者在其它语境也常用，会混入大量非插件包。

**GitHub topic**。另一类市场直接读 GitHub `dsh-plugin` topic，因此仓库需要设置该 topic，且仓库公开可见才能被检索。

兼容性由 `engines.dsh` 单独决定，声明后 `peerDependencies` 不再参与判定。当前值为 `>=0.2.0-rc.1 <0.3.0-0`：下界覆盖 DSH `0.2.x` 全系，上界用 `<0.3.0-0` 排除 `0.3` 的预发布版本。比较使用 `includePrerelease: true`，若漏写该选项，`*` 对 `0.2.1-rc.2` 会判定为不兼容。`engines.dsh` 禁止 `workspace:` 前缀。

展示信息来自 `package.json` 的 `icon` 与 `locale/<lang>.json` 的 `meta.title` / `meta.description`，`en.json` 必须存在，其余语言可选。这些资源都要通过 `exports` 暴露（`./icon`、`./locale/*.json`），否则 DSH 的模块解析器读不到，插件列表会退化成包名且没有图标。

`scripts/check-deepseek-package.mjs` 与 `scripts/smoke.mjs` 会断言上述字段，构建产物缺字段时在打包阶段就失败。
