# Codex Diagram

Codex 的可视化图表插件。**主使用方式是当前聊天右侧的 Diagram 伴随面板**：一边和 Codex 对话，一边查看、编辑和跟随当前图；全局 `Diagram 图表库` 只负责图表浏览、CRUD、导出和完整分屏编辑。结构化图使用 Mermaid，直接读写 `.mmd` / `.mermaid`；自由布局图使用可版本控制的 `.diagram.json` Canvas 文档。v0.8 起 Canvas 支持缩放/平移、多选、框选、复制粘贴、撤销重做、节点 resize、对齐/分布、对象锁定、图层顺序、命名容器、自动布局、技术角色节点、源码双向定位、样式 Inspector 与 MiniMap。Diagram 不再把当前图常驻注入聊天 Model Context；Codex 通过 MCP 按需读取图表，选区修改由右侧操作显式携带 element ids。

v0.16 起 Mermaid 不再走单一通用生成 Prompt；v0.17 进一步扩展到 19 种正式 Mermaid 类型。Flowchart / Sequence / Mindmap / Class / ER / State / Gantt / Timeline / GitGraph / Journey / Quadrant / Kanban / Requirement / Sankey / XY Chart / Pie / Radar / Treemap / Ishikawa 全部进入 Diagram Skill Registry。每种类型都有独立的构图、密度、视觉、反模式、生成与修改规则；数据图额外禁止无依据编造数值。预览与 SVG/PNG 导出同时使用按图类型的 Visual Grammar，并根据源码规模自动切换 comfortable / compact / dense 间距，不修改 Mermaid 源文件。类型选择器按核心结构、分析规划、数据可视化和专业分析分组，避免类型扩展后形成长平铺菜单。

v0.18 增加 Visual Quality Gate 与可重复压力基准。`pnpm visual:benchmark` 会在真实 Chrome 中以 light/dark 两套主题渲染复杂 Flowchart、Sequence、ER、Kanban、Sankey、Mindmap、Requirement、Treemap 等固定样例，同时检查尺寸、文字越界、节点重叠和关系标签重叠。结构复杂度超过单图可读上限时不会继续靠缩小字体硬塞，而是在预览左上角显示轻量“建议拆图”提示；例如 20+ 节点/多决策 Flowchart、10+ participant 或 24+ message Sequence、过大的 Class 图会进入拆图建议。Dense Treemap 会隐藏渲染层数值标签以避免小块越界，但源数据保持不变；Flowchart 的 `<br/>` 仅在渲染输入中规范为空格，源码不会被静默改写。

v0.19 增加固定画布的 Pixel Visual Regression。`pnpm visual:regression` 会把同一批复杂样例以 1400×1000、固定 48px 边距和 light/dark 两套主题渲染成 golden view，再同时比较显著像素变化、平均色差与 20px macro-cell 结构差异。少量抗锯齿抖动不会直接失败，但整体间距、配色、节点形态或布局明显变化会阻断回归。基线存放在 `tests/fixtures/visual-baseline/`；只有显式运行 `pnpm visual:regression:update` 才会重建。失败时会把 baseline/current/diff 三张诊断图写到 `test-results/visual-regression/`。`pnpm visual:verify` 会串行执行模板浏览器 smoke、复杂几何 benchmark 与像素 golden regression。

Mermaid 支持每张图声明轻量视觉 Profile：在源码首部加入 `%% codex-diagram:style=technical|minimal|editorial|presentation`。默认 `technical` 保持工程文档密度；`minimal` 更克制紧凑；`editorial` 增强叙事留白和层级；`presentation` 为评审/汇报提高字号与间距。Profile 只改变 Visual Grammar，不把颜色或布局细节硬编码进业务 Mermaid。需要实际看效果时，可运行 `node scripts/render-gallery.mjs --source-dir <目录> --output-dir test-results/visual-gallery`，脚本会在真实 Chrome 中把 Mermaid 与 `.diagram.json` Canvas 同时渲染为 light/dark PNG，并生成可浏览的 `index.html`。

Canvas 关系标签在浏览器中按实际字形宽度测量，最多显示两行，超长部分省略但完整文本保留在源文件及悬停标题中。预览与 SVG/PNG 导出共用换行规则，自动标签先避让人工指定的位置，再沿线路寻找空位；质量检查会报告标签重叠、遮挡节点和超出画布。服务端无浏览器字体时使用全角/半角宽度估算。固定中英文样例可运行 `node scripts/render-gallery.mjs --source-dir tests/fixtures/canvas-labels --output-dir test-results/canvas-labels` 查看。

当前 Diagram Skill 进一步采用渐进式设计合同：每一种 Mermaid 类型显式声明适用的构图原型（例如线性主链、决策树、泳道、汇聚、层级树、定量流向等），并把“视觉论证 / 证据来源 / 密度 / 反模式 / 质量回检”分开。模型不应默认生成等权卡片墙；架构 Canvas 额外支持 backbone、fan-out、convergence、hub-spoke、layered/swimlane 等拓扑选择。直接通过 MCP 对话生成复杂图时，可先调用 `diagram.designGuide` 只读取当前类型的规则，避免把 19 种 Skill 一次性塞入上下文。完成生成或大改后调用 `diagram.inspectQuality` 做一次有界质量回检：Canvas 检查节点重叠、连线穿节点、关系交叉、层级过平和超长标签；Mermaid 检查各类型自己的密度与拆图阈值。若 `needsRevision=true`，只针对报告问题修正并最多再回检一次。

开发回归除 `pnpm test` / `pnpm smoke` 外，还可运行 `pnpm visual:smoke`：它使用本机 Chrome/Chromium 在真实浏览器中按 light/dark 两套 Visual Grammar 渲染全部正式 Mermaid 模板，并检查渲染失败与异常超大 SVG，用于捕获 Node 单测难以发现的 Mermaid lexer、DOMPurify 和浏览器渲染兼容问题。

复杂视觉回归运行 `pnpm visual:benchmark`。该命令使用仓库内 `tests/fixtures/visual-stress/` 压力集，并把“样式/几何回归”和“内容本身应该拆图”区分开：前者直接失败，后者输出 split recommendation 而不是鼓励继续压缩字体。

需要检查“没有越界，但视觉是否被改丑”时运行 `pnpm visual:regression`；只有确认视觉改动是预期行为后才运行 `pnpm visual:regression:update` 更新 golden。日常完整视觉验收直接运行 `pnpm visual:verify`。

当前支持：

- Thread 伴随模式：从当前聊天的“插件和 MCP”打开 Diagram，右侧只保留当前图、预览/源码和高频对话操作
- AI 可直接打开伴随面板：`diagram.thread` 同时对 model/app 可见，因此可以直接在聊天里说“打开右侧画板/Diagram”。该工具只负责首次或用户明确要求打开；同一聊天已经打开后，后续读取、创建、修改、美化都直接调用数据工具，不再重复调用 `diagram.thread`
- 聊天目录优先：模型调用 `diagram.create` 时默认使用当前 thread 绑定的项目目录，不需要传 `workspacePath`；新图统一进入该项目的 `docs/diagrams/`
- 自由画板：让 Codex 调 `diagram.create(type=canvas)` 即可在当前聊天项目中创建 `.diagram.json` 画板，创建后右侧面板自动跟随到新画板
- 对话双向联动：Codex 在同一聊天调用 `diagram.get/create/update/rename/duplicate` 后，右侧面板自动跟随到对应图；用户在面板切图不会再向聊天注入常驻 Model Context
- Thread 右侧会把当前聊天最近涉及的图表收进临时 Tabs；Codex 操作新图时自动加入，用户可手动切换/关闭，最多保留 6 张，避免架构图、时序图、ER 图之间反复使用下拉框
- “跟随”可随时暂停，避免 Codex 为分析临时读取其他图时右侧面板频繁跳转；恢复后会继续跟随当前对话状态
- Thread 空面板会自动发现当前项目中新创建或恢复的图表，不需要关闭重开 Diagram
- `diagram.thread` 是唯一的右侧面板打开入口：模型可直接调用它，Host 以 fullscreen side-tab 打开 `Diagram` 标签；打开后 `diagram.get/create/update/proposal` 只改数据，由现有面板自动跟随，禁止为后续每次操作重新打开标签页
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
- 看板 Kanban
- 需求追踪 Requirement Diagram
- 桑基图 Sankey
- XY Chart 柱线/趋势图
- 饼图 Pie
- 雷达图 Radar
- 矩形树图 Treemap
- 鱼骨图 Ishikawa / Root Cause
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
- Canvas 节点支持默认/强调/成功/警告/危险/弱化语义色，圆角/方形/胶囊形状，以及锁定；节点详情可保存副标题、说明、标签、源码绑定和常用技术栈 stencil；连线支持标签、实线/虚线、智能正交路由、四向锚点和可拖动手工折点
- Canvas 支持右键菜单、前后图层调整和 MiniMap；锁定节点仍可选中查看，但不会被拖动、resize、对齐或 AI 无意重排
- 内置 Architecture Diagram Skill + 确定性架构美化器：系统架构会优先按“外部与参与方 / 体验与入口 / 核心应用 / 处理与异步 / 数据与检索”自动分区，按真实 role/stencil 补单色 SVG 图标和技术标签，并统一语义配色、节点尺寸、正交路由和并行连线 channel；右侧可直接选择企业架构 / 技术文档 / 汇报展示主题并点“美化”
- MCP `diagram.beautifyArchitecture` 可对当前 Canvas 直接执行架构美化，不依赖模型手工重写整张 JSON；会自动补 Software System 外边界、保留 Container/Domain 子边界，并从真实拓扑识别入口→核心→数据的主链路，按 `primary / secondary / muted` 控制节点和关系视觉权重；锁定节点位置始终保持不变
- MCP `diagram.routeArchitectureEdges` 可只整理架构连线，不移动节点/分区：使用轻量 Manhattan obstacle router 避开其他节点，综合路径长度、拐点、线路交叉和通道重叠选择更干净的正交路径
- MCP `diagram.designGuide` 按需返回单一图表类型的构图原型、视觉层级、证据规则、密度限制、反模式和质量循环；复杂新建/整图重构先取对应 Guide，小修改不额外加载
- MCP `diagram.inspectQuality` 对当前图或未落盘候选做只读质量检查；Mermaid 返回类型级 density/split 建议，Canvas 返回 overlap / edge-through-node / crossing / flat hierarchy / long-label 等可定位问题
- 同一节点扇出/汇聚到多个目标时，关系路由会优先形成共享 trunk + 分支的 bundle；画布和 SVG/PNG 导出会额外绘制柔和 bus underlay，让复杂依赖更像专业架构图而不是多条独立折线堆叠
- Canvas 支持 AI 动态绘制回放：Codex 创建/更新/源码同步画板时，右侧会根据前后 Canvas diff 播放虚拟鼠标移动、工具高亮、节点落点、标题逐字输入、节点拖拽重排、连线逐条拉出与镜头自动跟随；绘制会优先按命名容器/泳道拆成区域，没有结构信息时再按空间自动聚类。新增节点先进入区域内的临时粗排位置，随后由 Cursor 框选并整理到最终布局；新增系统边界会播放“框选成员 → 拖出 Boundary → 自动分组”，已有边界变化会模拟 resize。节点属性变化会弹出临时 Inspector，并通过点击/下拉选择展示语义色、形状、角色、技术栈和 C4 等切换；创建连接时显示真实 from/to 锚点吸附。被 AI 删除的旧节点和连线会以 ghost 保留到 Delete 动作后再淡出。Cursor 旁只显示“添加服务层 / 连接缓存 / 整理位置”等可观察动作。区域完成后镜头会轻微 zoom-out 再进入下一块，最后 Fit 全图、高亮本轮修改并完成收尾轨迹。大图会自动加速播放；底层文件仍保持单次原子写入，不为动画制造额外 revision
- Mermaid 预览会把 Mermaid 11 返回的 HTML-label / `foreignObject` SVG 先按浏览器语义解析、清理并规范化，再用于右侧预览和 PNG 导出；不会再因为严格 XML 二次解析误报“Mermaid 返回了无效 SVG”
- Canvas 组合可升级为带名称和语义色的系统/领域容器；支持 `parentId` 嵌套边界，可表达 Software System → Container 的层级；编辑器提供全图与当前选区/容器的局部自动布局，并保留锁定元素位置
- Canvas 节点支持 C4 `Person / Software System / Container / Component` 语义，以及 user/web/api/gateway/service/worker/database/cache/queue/search/vector/cloud/file/auth/ai/mcp/scheduler/external 等架构角色；技术 stencil 覆盖 Spring/React/Vue/Postgres/MySQL/Redis/Kafka/RabbitMQ/Docker/Kubernetes/Qdrant/OpenSearch/Elasticsearch/MongoDB/MinIO/Nginx/gRPC/OIDC/LLM/MCP。角色图标使用内置 SVG 矢量符号，编辑器和 SVG/PNG 导出保持一致
- Canvas 容器支持系统边界、命名、说明、语义色和折叠；折叠后内部节点隐藏，但跨边界依赖会汇聚到容器代理节点并显示数量，SVG/PNG 导出保持同样语义。泳道支持水平/垂直三分区、节点 lane 归属、lane 命名/色调以及按泳道自动布局
- 大型 Canvas 提供“层级”导航面板，可按边界、泳道、节点浏览，并搜索节点标题、副标题、说明、标签和源码路径；点击结果会自动展开折叠祖先、选中并聚焦到目标节点。MiniMap 同时显示折叠边界代理
- 节点 Inspector 默认保持紧凑；“详情”模式再展开职责说明、标签、泳道和源码绑定，避免聊天右侧窄面板长期被高级表单占满
- 画布可直接插入 Web→API→Service、Event-driven、Cache Aside 三种架构骨架，再由 Codex 根据真实代码和配置补全
- Canvas 支持节点组合/取消组合；组内任一节点默认按组选择和移动，Alt 可临时单独操作一个成员；复制组合会生成新的 groupId，不会和原组合串联
- Canvas 连线支持四向锚点和手工折点：选中节点会显示边缘连接点，选中连线可以添加/拖动/双击删除折点；SVG/PNG 导出使用同一套路径数据
- Canvas 节点可绑定一个或多个真实工作区源码文件；Inspector 支持真实源码搜索、绑定、移除和原生打开，Codex 可通过 MCP 按需读取这些绑定信息
- MCP `diagram.findBySource` 可按源码文件反查关联的 Canvas 节点；唯一命中时会同步当前聊天 active diagram + element ids，右侧会自动切图、选中节点并聚焦视口
- Canvas 节点可直接追踪上游 / 下游 / 双向邻域，支持 1～3 跳影响范围高亮；非相关区域自动降噪，距离层级逐级弱化。Codex 可调用 `diagram.trace` 直接触发同样的右侧影响视图
- Canvas 可把当前 Git staged / unstaged / untracked 改动真实映射到 `sourcePaths` 节点，并自动区分直接修改、1 跳、2 跳等影响层级；右侧“代码改动影响”报告列出已映射/未映射文件，可直接定位节点或把报告交给 Codex 做风险与回归分析
- Git 影响分析支持可选 `baseRef`（例如 `origin/main`），把 `baseRef...HEAD` 分支提交差异与当前工作区改动统一映射到架构图；分析结果只作为临时视图状态，不写入 `.diagram.json`
- MCP `diagram.upsertSourceNode` 可在 Codex 阅读真实源码后，只创建/刷新对应架构节点并绑定 sourcePath；不需要为了同步一个类或模块重写整张 Canvas，完成后右侧会自动定位该节点
- MCP `diagram.upsertSourceNodes` 可一次同步最多 80 个真实源码文件，单次读取源码索引、单次写入 Canvas revision，适合 Codex 分析一个模块后批量补齐 Controller / Service / Repository / DB 节点
- 对已有图的对话修改先进入右侧 Proposal Diff，不直接写盘；Mermaid、标题/画布尺寸、Group/Lane 元数据或真正的整图重构使用 `diagram.proposeUpdate`，有限范围的 Canvas 修改优先使用增量 `diagram.proposeSubgraphPatch`
- “调整选中”走 `diagram.proposeSubgraphPatch`：模型只发送变化字段、新增元素和删除 id，不再回传完整 Canvas JSON。服务端保留未声明的人工节点坐标、折点和 Label 位置，自动计算关系重路由/连带删除等影响范围，并在 Proposal 中区分 scope、实际影响和自动影响；旧 `diagram.proposeSubgraphUpdate` 仅保留兼容
- 大型 Canvas 的局部 AI 修改先走 `diagram.getSubgraph`，返回 `scopeNodeIds / directRelationshipIds / contextElementIds`：原始选区是默认可编辑范围，用户意图明确涉及直接关系时才扩到对应 relationship，邻居默认只读；节点与关系数量都有硬上限，避免为了改几个元素把 5000 节点整图塞进模型上下文
- 增量 Canvas Proposal 支持字段级并发 rebase：Proposal 生成后如果用户或另一个 Agent 又改了无关字段/节点，接受时会在最新 revision 上重放 patch 并保留并发修改；同字段冲突、删除目标变化、人工路由冲突会明确拒绝。若 rebase 导致自动布局/路由或新增节点位置与已审查候选不同，会刷新 Proposal 要求再次审查，而不是直接写盘
- 增量 Canvas Proposal 的部分接受使用 element-id 语义并做依赖校验：新增关系必须同时接受缺失的新端点；删除节点会安全清理悬空关系；架构节点几何只应用一部分时，会根据最终节点位置重新计算必要关系路由，避免留下指向旧位置的折点
- Proposal 出现后仍可继续手工编辑 Canvas：接受增量 Proposal 时，插件会先保存本地 dirty 草稿，再通过字段级 rebase 合并；整图 Proposal 无法安全合并本地草稿时会阻止覆盖
- 当用户明确要求多个方案 / A-B 对比时，`diagram.proposeSubgraphPatch` 可通过 `branchLabel` 在同一 base revision 上保留最多 6 个候选；右侧 Proposal 面板会并排显示每个方案的修改/新增/删除、自动影响以及独有/共同影响元素，切换候选不会写文件，接受时只应用当前方案
- 多个未应用候选可以通过 `diagram.composeProposalBranches` 做服务端组合：同一元素的不同字段可以合并，相同字段写入不同值、更新/删除冲突等会直接拒绝，不使用 last-write-wins；组合结果本身仍是新的可审查 Proposal，不会直接写 Canvas
- 已应用的增量 AI Patch 会进入当前图的“历史”时间线，记录修改原因、直接修改、自动影响、部分接受和并发 Rebase 状态；历史数据保存在用户本机的 `~/.codex-diagram/history/`，不会向项目仓库写入额外文件
- AI Patch History 会按字段和结构因果生成 Patch DAG，而不是简单把所有历史串成链；后续 Patch 修改前一 Patch 拥有的字段、引用其新增节点等才建立 dependency，不同子图保持并行根/分支。右侧时间线显示 roots / edges / 上下游关系，Codex 也可通过 `diagram.patchGraph` 读取同一依赖图
- “撤销这次修改”按子图事务做反向三方合并：只恢复该 AI Patch 真正拥有的字段，保留后来对其它字段的人工修改；如果同一字段后来又被编辑、AI 新增节点已被后续关系依赖等，则拒绝危险撤销并明确提示冲突
- 已撤销的 AI Patch 可以安全 Redo；Redo 与 Undo 使用同一套字段所有权和结构依赖检查，后续无关字段修改会保留，同字段修改、新关系依赖或 ID 复用会阻止覆盖。接受 A/B 候选后，Timeline 也会保留实际采用的分支标签
- 存在活跃下游依赖时不允许单独撤销上游 Patch；Timeline 会提供“撤销依赖链”，按逆拓扑顺序安全撤销整个下游闭包，并可按正拓扑顺序“重做依赖链”。链级 Undo/Redo 使用 batch id 审计，不会把多条事务误看成互不相关的单次操作
- AI Patch History 只持久化受影响元素的 before/after 快照，不复制整张 Canvas；5000 节点画布中单元素事务仍保持稀疏历史记录
- 右侧可直接“调整选中”，该操作会显式携带当前 element ids 和选区结构，让 Codex 只修改当前选区，不需要常驻聊天上下文
- Codex / IDE 外部更新图表后会保留修改前快照，可在右侧“查看变更”，并一键恢复旧版
- Canvas 文档默认保存为 `docs/diagrams/*.diagram.json`，可以直接进入 Git diff，也不会被源码选择器误当成业务 JSON
- Codex 生成面板可以直接选择“自由画布”或“架构画布”预设，生成时使用独立 Canvas JSON 协议，不会混入 Mermaid 语法
- 从代码生成内置系统架构、调用链、数据模型、状态流转等快捷预设；系统/软件/模块/服务架构默认生成 Canvas/C4 架构图，只有明确的业务流程、控制流、决策流才使用 Mermaid Flowchart
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
| `diagram.trace` | 从 Canvas 节点追踪上游 / 下游 / 双向关系，并联动右侧影响视图 |
| `diagram.gitChanges` | 读取当前工作区真实 staged / unstaged / untracked Git 改动，可选 `baseRef...HEAD` |
| `diagram.impactFromGit` | 将真实 Git 改动文件映射到 Canvas 节点并生成分层影响报告 |
| `diagram.gitImpact` | UI 内部读取当前聊天最新 Git 影响报告 |
| `diagram.dismissGitImpact` | UI 内部清除当前聊天 Git 影响报告 |
| `diagram.upsertSourceNode` | 将真实源码文件增量创建/同步为当前 Canvas 节点 |
| `diagram.upsertSourceNodes` | 批量将真实源码文件创建/同步为 Canvas 节点，单 revision 写入 |
| `diagram.create` | 在 `docs/diagrams/` 创建图表 |
| `diagram.update` | 更新已有图表源码 |
| `diagram.getSubgraph` | 按 element ids 读取受限 Canvas 邻域，并区分 scope、直接关系和只读上下文，供大图增量分析/修改使用 |
| `diagram.designGuide` | 按图表类型读取渐进式设计 Guide：构图原型、视觉层级、证据规则、密度、反模式与质量循环 |
| `diagram.beautifyArchitecture` | 对 Canvas 架构图执行自动分区、主题配色、角色/技术图标补全、布局和连线整理 |
| `diagram.routeArchitectureEdges` | 仅重新计算 Canvas 架构关系的锚点、避障路径和线路通道，不移动节点 |
| `diagram.inspectQuality` | 对当前图或传入的未落盘候选执行只读质量回检，返回 `needsRevision`、问题列表与度量 |
| `diagram.proposeUpdate` | 提交不落盘的候选图表更新，供右侧 Diff 审查 |
| `diagram.proposeSubgraphPatch` | 提交增量 Canvas 子图 patch；只发送 updates/adds/removeIds，服务端计算候选、影响范围与局部路由 |
| `diagram.proposeSubgraphUpdate` | 兼容旧版完整 Canvas 子图候选修改，不再作为首选 |
| `diagram.proposal` | UI 内部读取当前聊天待审查 Proposal |
| `diagram.selectProposalBranch` | UI 内部切换同一 base revision 上的 AI A/B Patch 候选，不写入图表文件 |
| `diagram.composeProposalBranches` | 将同一基线上的兼容 AI Patch 候选组合成新的可审查候选；字段冲突直接拒绝 |
| `diagram.applyProposal` | UI 内部接受 Proposal；Canvas 可指定 element ids 部分应用，增量 patch 支持字段级并发 rebase 与候选漂移二次审查 |
| `diagram.dismissProposal` | UI 内部拒绝 Proposal，不修改文件 |
| `diagram.patchHistory` | UI 内部读取当前 Canvas 已应用的 AI 增量 Patch 时间线 |
| `diagram.patchGraph` | 读取当前 Canvas AI Patch 依赖 DAG、上下游关系与活跃状态，不加载完整 Canvas |
| `diagram.undoPatchHistory` | UI 内部安全撤销一次 AI Patch；只反转该事务拥有的字段并检测后续冲突 |
| `diagram.undoPatchHistoryChain` | UI 内部按逆拓扑顺序安全撤销一个 Patch 及其活跃下游依赖链 |
| `diagram.redoPatchHistory` | UI 内部安全重做一次已撤销 AI Patch；保留后续无关修改并拒绝覆盖同字段/新依赖 |
| `diagram.redoPatchHistoryChain` | UI 内部按正拓扑顺序安全重做一条已撤销 Patch 依赖链 |
| `diagram.rename` | 重命名图表 |
| `diagram.duplicate` | 复制图表 |
| `diagram.delete` | 删除图表 |
| `diagram.exportAsset` | Host 不支持原生下载时，UI 内部保存 SVG / PNG 导出文件 |

## 当前边界

当前已经支持 Mermaid + 内置自由 Canvas 双模式。Canvas v1 聚焦架构草图需要的节点、备注和连接，暂不追求 Excalidraw 的完整手绘、图片和多人协作能力；文件协议和渲染器已分层，后续可以继续接 Excalidraw adapter。更深的代码图谱索引也放在后续阶段。

当前 Codex MCP App Host 提供 `files.open(path)`，但没有公开“当前活动编辑器文件 / 当前代码选区”的读取接口。因此插件不会伪装成能自动读取 IDE 选区：生成时可以从真实工作区路径选择文件/目录，或者让 Codex 根据当前对话与整个工作区定位实现；后续 Host 提供 active file / selection API 后再直接接入。
