# 开发与发布

面向维护者的开发、测试、构建与发布说明。用户安装和使用请看 [README](../README.md)。

## 项目结构

```text
src/                图表服务、React 编辑器与共享领域逻辑
  hosts/            Codex / DeepSeek 宿主适配层
  diagramSkills/    19 种 Mermaid 图表的生成与修改规则
  canvasPlayback.ts Canvas 绘制回放的纯计划算法
  ReviewPanels.tsx  候选修改、历史、Git 影响审查面板
  reviewTypes.ts    审查面板与主工作台共享的结果类型
integrations/deepseek/  DeepSeek 插件入口、客户端与 locale
manifest/           Codex 插件清单与 MCP 配置
scripts/            构建、安装、冒烟与视觉回归脚本
tests/              单元测试、宿主集成测试与视觉基线
docs/               维护者文档与 README 截图
```

核心约定：

- 模型与图表面板共享同一个图表服务实例，面板不复制编辑器、存储或 Proposal 实现。
- 画布回放计划独立于 React 编辑器，可单独测试；审查面板从主工作台拆分，仍共享原有状态和请求。
- 大画布的连线标签避让和节点重叠检测采用临时矩形空间索引，避免每个候选位置扫描所有图元；布局结果与原有精确矩形相交判断一致，不持久化索引。
- Canvas 语义投影以离散 LOD 等级而非连续缩放值作为重新计算条件；同一等级内的平移和缩放不会重复执行语义投影。
- 不需要视口裁剪的静态画布只在图形、语义等级或选中关系变化时更新标签布局；折叠关系和捆绑线在几何变化时更新。拖动中的临时图形和已裁剪大图仍计算实时布局。
- 大画布视口裁剪复用静态投影的节点、关系与折叠映射，超大画布（超过 6000 个可绘制节点）才使用空间索引查询，其余继续线性过滤；保留图层顺序及选中节点、连线端点。缩略图节点云路径不再随平移反复生成，拖动中的几何修改仍走实时裁剪。
- Mermaid 使用同一个渲染队列串行完成初始化与渲染，避免模板缩略图和编辑器预览互相覆盖全局配置。新建图表的模板缩略图只在进入可见区域时渲染，已卸载的请求在入队执行前跳过。
- 面板在浏览器后台或被宿主隐藏时暂停会话跟随、图表发现和 revision 轮询；重新可见时恢复同步，正在进行的 AI 新图表监听不受影响。
- Mermaid 直接读写 `.mmd` / `.mermaid`；Canvas 保存为 `.diagram.json`，两者共用保存、revision 与导出链路。
- 服务端写入采用进程内队列、跨进程工作区锁与 revision 检查；锁位于系统临时目录，只保证同机同用户下的多宿主互斥。
- 会话选择、未确认的 Proposal 等状态只在当前服务进程保留；超过 24 小时不访问或进程内活跃会话超过 512 个时进行惰性清理，不影响已经保存的图表文件。

## 本地开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm check:hosts
```

- `pnpm build` 生成 `package/`，其中同时包含 Codex 的 `.codex-plugin/plugin.json`、`.mcp.json` 与 DeepSeek 的 npm 包入口。
- `pnpm test` 运行领域逻辑单元测试；`pnpm check:hosts` 覆盖工作区越界拒绝、内部工具过滤、会话隔离、并发 revision 冲突与 Proposal 确认流程。
- `pnpm smoke` 检查构建产物中的关键 UI 资源、MCP 标记、npm 元数据与 locale 文件。

## 视觉回归

```sh
pnpm visual:smoke       # 真实 Chrome 渲染全部 Mermaid 模板，捕获 lexer / 渲染兼容问题
pnpm visual:benchmark   # 复杂样例的尺寸、文字越界、节点重叠与拆图建议
pnpm visual:styles      # 12 套样式 × 19 种图表 × 明暗主题
pnpm visual:regression  # 固定画布像素 golden 对比
pnpm visual:verify      # 依次执行以上全部检查
```

像素基线存放在 `tests/fixtures/visual-baseline/`，只有确认视觉改动符合预期后才运行 `pnpm visual:regression:update` 重建。失败时诊断图写入 `test-results/visual-regression/`。

## 本地安装

### Codex

```sh
pnpm plugin:install
```

脚本会注册本地 marketplace 并安装 `diagram-plugin@diagram-plugin-local`。Codex Desktop 已打开时可用 `pnpm plugin:install:desktop` 顺便刷新宿主。

### DeepSeek Harness

当前目标为 Desktop `0.2.1-rc.2`，按本机安装包内的接口核对；其他版本需要重新验证。先完整退出 Desktop，再执行：

```sh
pnpm build
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:/绝对路径/diagram-plugin/package"
```

随后重新打开 Desktop。不要为同一个 Diagram 再配置通用 MCP 客户端，避免重复工具或模型与面板连接到不同实例。同版本的 `file:` 依赖可能继续使用已安装副本；开发中重新构建后，需要先 `plugin --profile desktop remove @weimin96/diagram-plugin`，再重新添加，并确认插件已进入 `dsh.profile.bundles`。

Web 使用同一份 DeepSeek Client 与 MCP 服务，不需要独立的 Web 编辑器。将 `--profile desktop` 换成 `--profile web` 后启动 `dsh web`；Web 侧需单独检查 Web profile 是否安装插件。客户端在同一应用实例的多个会话之间复用静态画板 HTML，但每个会话都必须重新建立独立的 MessagePort 和宿主绑定。面板的工作区由当前会话确定，不能自行切换到其他目录。

原生验收至少覆盖：

- 安装后从聊天标题区打开 Diagram，能看到当前项目的图表。
- 新建 Mermaid 与 Canvas，保存、重开并导出，操作的是同一份文件。
- 聊天调用图表工具后面板跟随；已有图修改先形成 Proposal，接受前文件不变。
- 两个项目聊天之间的图表、选区与 Proposal 不串用，主题切换同步。
- Codex 与 DeepSeek 基于旧 revision 保存同一张图时，必须有一个请求明确报告冲突。

## 宿主适配

| 位置 | 职责 |
| --- | --- |
| `src/hosts/types.ts` | 编辑器使用的宿主合同 |
| `src/hosts/codex.ts` | MCP Apps 与 OpenAI 扩展 |
| `src/hosts/deepseek.ts` | 与 DeepSeek 标签页通信的 MessagePort |
| `src/hosts/serverContext.ts` | 带宿主命名空间的会话与绝对工作区 |
| `integrations/deepseek/host.mjs` | stdio 子进程、模型工具与经过宿主认证的面板接口 |
| `integrations/deepseek/client.mjs` | 原生右侧标签页、共享编辑器与 Session Controller |

DeepSeek 模型工具注册为 `diagram_create` 等名字，内部工具只供面板调用。画板运行在不含 `allow-same-origin` 的 sandbox iframe 内，通过父窗口核验与独立 MessagePort 交换请求，不接触宿主认证凭据；面板接口挂载在 DeepSeek Connection 的 `/api` 路径下，沿用其认证、来源检查与 owner 限制。

新增宿主时实现 `DiagramHost` 所需的能力并在入口选择适配器。缺失的消息、文件打开和下载能力应显式声明；宿主必须从真实会话取得身份与工作区，不能把模型参数中的会话标识当作权威。

## 发布

正式包名为 `@weimin96/diagram-plugin`。发布流程：

1. 更新根目录 `package.json` 的版本号并提交。
2. 推送 `diagram-plugin-v<版本>` 标签，或手动触发 `publish-plugin.yml` 并填写相同版本。
3. 工作流执行类型检查、构建、冒烟、宿主集成测试与产物校验，然后发布 tarball。

本地验包：

```sh
pnpm build
mkdir -p release
npm pack ./package --ignore-scripts --pack-destination release
# 文件名中的版本号来自根目录 package.json，例如 0.20.0
node scripts/check-deepseek-package.mjs release/weimin96-diagram-plugin-<version>.tgz
```

发布使用 npm Trusted Publishing（OIDC），不配置长期 `NPM_TOKEN`。新包需要先通过交互式 `npm login` 完成首次建包，再执行 `npm trust github` 绑定仓库 `weimin96/diagram-plugin`、工作流 `publish-plugin.yml`，权限为 `publish`。工作流当前显式关闭 npm provenance（`--provenance=false`）。

### 插件市场发现

社区市场通过两条独立通道发现插件，发布包必须同时满足：

- **npm 关键词**：`keywords` 首个为 `dsh-plugin`，且声明 `dsh.bundle`；缺任一项不会被收录。
- **GitHub topic**：仓库需公开并设置 `dsh-plugin` topic。

兼容性由 `engines.dsh` 单独决定，当前为 `>=0.2.0-rc.1 <0.3.0-0`；比较使用 `includePrerelease: true`，且禁止 `workspace:` 前缀。展示信息来自 `package.json` 的 `icon` 与 `locale/<lang>.json` 的 `meta.title` / `meta.description`，必须通过 `exports` 暴露。`scripts/check-deepseek-package.mjs` 与 `pnpm smoke` 会断言这些字段。

## 兼容性

Canvas 文档类型与 Mermaid 样式指令保留向后兼容：读取时同时接受 `codex-diagram-canvas` 与 `%% codex-diagram:style=`，写入时统一使用新前缀，旧图可直接打开并在首次保存后迁移。最近工作区状态优先写入 `~/.diagram-plugin`，并回退读取 `~/.codex-diagram`。

改名前的 `@weimin96/diagram-deepseek` 与正式包是不同包。已安装旧插件的用户应先移除旧插件，再安装新包，否则会重复注册 Diagram 标签页和工具。
