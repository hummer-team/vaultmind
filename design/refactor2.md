# refactor2.md — 对 refactor.md 的评审与补充（Review & Additions）

> 目标：检查 `refactor.md` 的 TO-BE 设计是否存在不合理之处、是否缺少关键设计细节；并回答你补充的第 8/9/10 个问题，给出更可落地的技术方案选型建议。
>
> 背景输入（来自你在 refactor.md 的补充回答）：
> - 已支持多表同会话：`main_table_1`, `main_table_2`, ...
> - 第一次失败主要是 “SQL 生成不正确 / SQL 语法错误”
> - 允许交互式澄清：Rewrite 阶段可 `assumptions` 乐观执行，必要时 `needClarification: true` 保守暂停
> - Prompt 三层结构：系统属性 / 行业属性（ecommerce）/ 目标
> - 当前核心功能：统计分析 + 导出 CSV；长期规划：可视化、数据清洗

---

## 1. 总体评价：主线正确，但需要补齐“落地约束 + 状态机 + 资源预算”

`refactor.md` 的主线（Rewrite → Intent → Skill → Plan/Execute → Tool Runtime → Observability）是合理的，并且与你们现状高度匹配。

为了让这个方案 **能稳定上线且可持续迭代**，建议重点补齐 3 类工程化细节：

1) **SQL Tool Runtime 的 policy 需要更精确**（黑名单不足，需加结构校验/多语句禁止/表名提取/强制 LIMIT 等）。

2) **Agent Loop 需要状态机 + 预算（Budget）机制**（避免无限重试、token 爆炸、工具调用过多导致 UX 变差）。

3) **多表与 schema 注入策略**（schema snapshot 如何收敛成“可喂给模型但不爆 prompt”的 digest，并支持按需 discovery）。

---

## 2. 设计合理性检查：当前方案可能的风险点

### 2.1 “Phase 5 只靠关键字黑名单”存在绕过风险

仅做关键字黑名单（例如禁止 `DROP/UPDATE`）很容易出现绕过：

- 注释穿插：`DR/**/OP`
- 大小写混写
- 多语句拼接：`SELECT ...; DROP ...`

**建议**：把 SQL policy 设计成“允许形态 + 结构化验证 + 兜底黑名单”。

### 2.2 “Phase 4 Plan-and-Execute”若无预算，复杂问题会失控

复杂任务若没有明确 `maxSteps/maxToolCalls/maxDuration`，以及 `stopReason`，实际运行会出现：

- LLM 连续生成 5 次不同 SQL（用户体感像抽奖）
- 每次把大量 observation 回灌 prompt，token 直线上升

**建议**：Executor 设计必须自带预算、重试策略和停止条件。

### 2.3 多表场景如果不定义 join 策略，会显著拉低首次成功率

你确认支持多表同会话后，Agent 将很自然地产生跨表查询需求。

**风险**：Join 容易成为 NL2SQL 最大的不确定性来源。

**建议（结合你最终决定：默认自动 join）**：

- 默认允许 Agent 自动 join，但必须加“护栏”条件：
  - join key 高置信度（列名/类型/唯一性启发式）才自动 join
  - 失败（空结果/行数爆炸/重复严重）立刻进入 NEED_CLARIFICATION

---

## 3. 需要补充/强化的内容（已回填到 refactor.md）

（略，已在 `design/refactor.md` 中写入：可回放日志字段、SchemaDiscovery、预算/stopReason、SQL Policy Contract、Skill 版本等）

---

## 4. 与现有“三层提示词结构”的对齐建议

你们当前 prompt 三层结构：系统属性 / 行业属性（ecommerce）/ 目标。

建议映射为：

1) **Global System Policy**（系统属性）
- 安全规则、工具调用格式、禁止编造、输出格式

2) **Domain Pack**（行业属性）
- ecommerce 术语、指标定义、同义词映射、常见分析范式

3) **Skill Body**（目标）
- profiling/nl2sql/sql-debug/workflow 的步骤与自检

---

## 4.5 为什么当前重构没有显式体现 Skill？（现状解释）

你说得对：从“TO-BE 架构设计”的角度，Skill 是一个显式层（e.g. `nl2sql`, `sql-debug`, `profiling`, `visualize`, `cleaning`），但我们在当前这轮重构里“没有把 Skill 作为独立模块落地”，主要原因是**有意识的工程取舍**（符合最小干预原则）：

1) **先把失败率最高的链路打稳**
- 现状问题集中在：NL2SQL 首次失败、DuckDB 兼容性、错误展示/耗时缺失、澄清交互。
- 这些属于“Runtime 与 Guardrail”层问题，即使没有显式 Skill 层也必须先解决。

2) **当前 executor 已包含 skill 的雏形，但被内联在执行流里**
- `rewriteQuery()` 相当于 `rewrite` skill
- `debugSqlOnce()` 相当于 `sql-debug` skill
- `sqlPolicy` 相当于 `sql-runtime-guard`（不是 LLM skill，但属于工具侧能力）
- 只是它们目前是以“函数/阶段”形式存在，而非以“可注册、可版本化、可路由”的 Skill 模块呈现。

3) **Skill 层落地会牵动更大的结构改造（需要明确边界/契约/版本策略）**
- 一旦引入 Skill Registry/Router，会涉及：
  - prompt 分层与版本化
  - tool contract
  - run record 的 schema
  - 回放与评测（M8/M9 对应能力）
- 在你确认 M8/M9 暂缓的情况下，Skill 落地必须更“轻量”，否则会变成高风险重构。

结论：**当前重构是用“阶段化函数组合”实现了 Skill 的功能，但尚未把 Skill 作为独立可插拔架构层抽出来**。M10 将是把这些阶段升级为可版本化、可灰度、可回滚的 Skill/Domain Pack 体系。

---

# 5. 详细执行计划（Implementation Plan, v1）

> 输出目标：给出一个你可以直接拿去排期、拆任务、分 PR 的实施路线。
>
> 约束：遵循“最小干预原则”，优先做低风险高收益改动；任何较大方案先做 feature flag；默认不引入大体积 SQL AST 解析库（除非后续验证确有必要）。

## 5.1 总体里程碑（按风险从低到高）

- [x] M0：基线与诊断（只读）
- [x] M1：Observability（可回放日志 + error category）
- [x] M2：SQL Tool Runtime Policy（强约束 + LIMIT 注入 + 表白名单）
- [x] M3：SchemaDiscovery + Rewrite（减少猜字段）
- [x] M4：SQLDebug loop（自动修复一次 + 归因）
- [x] M5：Agent Loop（Budget/stopReason + 多步骤执行）
- [x] M6：导出 CSV（基于结果集）与 UI 步骤可视化（可选增强）
- [x] M7：回归回放（无历史样本时先做最小自建 case 集）
- ~~[ ] M8：评测自动化（Eval Harness + 指标看板 + 回归门禁）~~
  - 暂缓，优先级降低
- ~~[ ] M9：性能与资源预算（大文件/大表/Worker 压力下的稳定性）~~
  - 暂缓，优先级降低
- [x] M10：可扩展能力（Skill/Domain Pack 版本化 + 可视化/清洗与发布流程）

> 建议排期：M1 + M2 优先，会直接提升“首次成功率”和安全性（符合你们当前痛点）。

---

## 5.10 M7：回归与评测（无历史样本时的最小方案）

### 目标

- 建立最小 case 集（10~20 条）做回归
- 每次改 prompt/skill/策略后可快速验证

### 建议改动点（文件级）

- 新增：`src/services/llm/eval/cases.ts`（本地静态 cases）
- 新增：`src/services/llm/eval/runEval.ts`（可在 bun 环境下跑，或在浏览器中跑）

### 验收标准

- case 集通过率可追踪
- 每次 PR 输出 eval 结果摘要

---

## 5.11 M8：评测自动化（Eval Harness + 指标看板 + 回归门禁）

> M7 解决“有用例”，M8 解决“可规模化、可对比、可卡门禁”。
>
> 你的新要求（所有场景都显示 LLM/SQL 耗时）也应纳入 M8 的评测断言：
> - 只要发生 LLM 调用就必须有 `llmDurationMs`
> - 只要发生 SQL 执行就必须有 `queryDurationMs`

### 目标

1) **Eval 自动化**：把 M7 的手工 case 集升级为可自动运行的 eval runner。
2) **指标对比**：同一批 case，输出可对比指标（通过率、stopReason 分布、耗时统计）。
3) **回归门禁**：为关键路径设置“不得退化”的质量门槛（例如通过率、耗时 P95）。

### 设计约束（你们当前栈的最小可行做法）

- 不引入大型 e2e 框架（先用 Bun 脚本 + 可选浏览器内 runner）。
- 对于 LLM 相关 case，优先通过 **Mock LLM** / **Record-Replay** 达成稳定回归；真实 LLM 作为 nightly。

### 建议改动点（文件级）

- 新增：`src/services/llm/eval/types.ts`
  - `EvalCase`：输入、前置、期望 stopReason、期望 toolName、断言规则
  - `EvalResult`：pass/fail、耗时、错误归因

- 新增：`src/services/llm/eval/assertions.ts`
  - 断言库（不依赖 vitest）：
    - `assertStopReason()`
    - `assertHasTiming()`（你的新硬要求）
    - `assertRowCountRange()`
    - `assertContainsColumns()`

- 新增：`src/services/llm/eval/runEval.ts`
  - 支持两种模式：
    1) `mock`：稳定回归
    2) `live`：真实 LLM（可选 nightly）

- 新增：`design/eval-metrics.md`
  - 约定输出字段与阈值（例如通过率 >= 90%，P95 LLM < 6s）

- `package.json` 增加脚本（若你同意）：
  - `bun run eval:mock`
  - `bun run eval:live`

### 验收标准

- `eval:mock` 可在本地稳定重复运行，输出：
  - 总用例数/通过数/失败数
  - stopReason 分布
  - LLM/SQL 耗时统计（avg/p95/max）

- 回归门禁（建议阈值可配置）：
  - `passRate >= X%`
  - `timingVisibleRate == 100%`（你的硬要求）

### 风险与回滚

- 风险：真实 LLM 波动导致不稳定
- 缓解：nightly 运行 live；PR 默认跑 mock

---

## 5.12 M9：性能与资源预算（大文件/大表/Worker 压力下的稳定性）

### 目标

- 处理“大文件/大表/多表”时保持 UI 流畅且不崩溃。
- 明确性能预算：
  - 首屏交互
  - SQL 执行耗时
  - Worker 内存/CPU
  - 导出耗时

### 关键策略（最小干预版本）

1) **Result 限制**：强制 LIMIT + UI 分页（已在 M2/M6 具备基础）。
2) **Worker 负载保护**：
   - 大查询自动提示缩小范围
   - 超时中止（Budget.maxDurationMs）
3) **表级元数据缓存**：
   - schemaDigest / rowCount / min-max 时间范围（可选）

### 建议改动点（文件级）

- `src/services/duckDBService.ts` / `src/workers/duckdb.worker.ts`
  - 增加轻量 metrics：queryStart/queryEnd/bytesReturned（可选）

- `src/pages/workbench/index.tsx`
  - 当 queryDurationMs 超过阈值时给用户提示（例如“建议加筛选条件”）

### 验收标准

- 200MB CSV：上传 + 查询 + 导出不崩溃
- 典型查询在阈值内可取消（Cancel 可用）

---

## 5.13 M10：可扩展能力（Skill/Domain Pack 版本化 + 可视化/清洗与发布流程）— 详细规划（v2）

> 约束：M8/M9 暂缓时，M10 必须做到“可扩展但不引入大型评测/指标系统”，采用更轻量的 feature flag + M7 手工回归门禁。

### 5.13.1 目标（M10 Scope）

1) 把现有“内联阶段”（rewrite/sql-debug/nl2sql）抽象成 **Skill 模块**，可被注册与路由。
2) 引入 **Domain Pack**（行业包）版本化机制：ecommerce v1/v2 可并存。
3) 引入 **Skill 版本化 + 灰度/回滚**：`nl2sql.v1`、`sql-debug.v1`……
4) 为长期规划准备入口：
   - `chart`（可视化输出 chartSpec，不让 LLM 画图）
   - `cleaning`（数据清洗先建议/预览，默认不落库）

### 5.13.2 设计原则

- **最小侵入**：优先“包一层壳”（registry/router），不改现有工具实现细节。
- **强契约**：Skill 输入/输出必须结构化（zod），禁止 any。
- **可回滚**：所有新 skill 都必须可通过 flag 回退到旧路径。
- **安全优先**：涉及写库/建表能力必须走 policy 升级与用户确认。

### 5.13.3 目录结构（建议）

- `src/services/llm/skills/`
  - `types.ts`（SkillContract、SkillContext、SkillResult、StopReason 扩展）
  - `registry.ts`（注册表：skillId → handler）
  - `router.ts`（根据 intent/role/flag 做 skill 路由）
  - `builtin/`
    - `rewrite.v1.ts`
    - `nl2sql.v1.ts`
    - `sqlDebug.v1.ts`
    - `chart.v1.ts`（新增）
    - `cleaning.v1.ts`（新增，先只输出建议与预览 SQL）

- `src/prompts/domain/`
  - `ecommerce.v1.ts`
  - `ecommerce.v2.ts`（未来迭代）

- `src/services/flags/`
  - `featureFlags.ts`（本地/设置中可控）

### 5.13.4 Skill Contract（接口契约）

#### SkillContext（输入）
- `userInput: string`
- `attachments: Attachment[]`
- `schemaDigest: string`
- `personaId: string`
- `budgets: { maxSteps; maxToolCalls; maxDurationMs }`
- `runtime: { executeQuery; llmConfig; signal }`

#### SkillResult（输出）
- `stopReason: 'SUCCESS' | 'NEED_CLARIFICATION' | 'POLICY_DENIED' | 'TOOL_ERROR' | ...`
- `message?: string`（用户可读）
- `tool?: string`
- `params?: unknown`
- `result?: unknown`
- `schema?: unknown[]`
- `thought?: string`
- `llmDurationMs?: number`
- `queryDurationMs?: number`

> 说明：这与当前 `runAgent()`/`AgentExecutor.execute()` 已有结构对齐，M10 的关键是把“职责边界”拉直。

### 5.13.5 M10 分步骤实施（可拆 PR）

#### Step 1：引入 Skill Registry（不改变现有行为）
- 新增 `skills/types.ts`、`skills/registry.ts`
- 把现有 executor 调用路径包成一个 `nl2sql.v1` skill（内部仍调用 `AgentExecutor.execute()`）
- 验收：功能不变，M7 全通过

#### Step 2：Router（按 persona/domain/flag 路由）
- 新增 `skills/router.ts`
- 默认路由仍指向 `nl2sql.v1`
- 新增 feature flag：`enableSkillRouter`
- 验收：flag off 时 100% 走旧路径；flag on 时行为一致

#### Step 3：Domain Pack v1（ecommerce）抽取与注入
- 新增 `prompts/domain/ecommerce.v1.ts`
- `promptManager` 改为：domain pack 可选注入（不改输出格式）
- 新增 flag：`domainPackVersion = 'ecommerce.v1' | 'none'`
- 验收：同一输入在 v1 与 none 下语义不退化（用 M7 抽样验证）

#### Step 4：sql-debug skill 版本化
- 把 `debugSqlOnce()` 的 prompt 迁移为 `sqlDebug.v1`
- 由 `nl2sql.v1` 内部调用“sqlDebug skill”，而不是直接调用函数
- 验收：SQL 修复成功率不下降（手工回归）

#### Step 5：Chart Skill（只出 chartSpec，不执行图表渲染）
- 定义 `ChartSpec`（zod）：type、x、y、series、title、notes
- Router 条件：当用户输入包含 “图表/趋势/可视化/plot/chart” → 转 chart skill
- chart skill 输出：
  - 不直接画图
  - 产出 chartSpec + 简短解释
- 前端渲染：后续可在 ResultsDisplay 增加 chart renderer（可选）
- 验收：不影响现有查询；chartSpec JSON 合法

#### Step 6：Cleaning Skill（建议/预览模式）
- 首期只输出：
  - `previewSql`（SELECT 预览）
  - `recommendedSteps[]`（用户可理解的清洗建议）
- 明确禁止：默认不允许 CREATE/INSERT（仍受 sqlPolicy 拦截）
- 若未来要落库：必须新增“用户确认 UI + policy 升级 + 审计日志”
- 验收：不会产生写操作；只做建议与预览

#### Step 7：发布与回滚策略
- 所有 skill 通过 `featureFlags` 控制启用
- 任一新 skill 出现问题：
  - 关闭对应 flag
  - Router 回退到 `nl2sql.v1` 旧路径
- 验收：回滚路径 1 分钟内可恢复（不发新版也可通过 settings 生效）

### 5.13.6 验收标准（M10）

- **兼容性**：M7 回归用例全通过
- **可控性**：skill/router/domain pack 都可通过 flag 关闭回退
- **类型安全**：skill contract 全部显式类型，无 any
- **安全性**：cleaning skill 不产生写操作；chart skill 不执行 SQL 写入

### 5.13.7 风险与缓解

- 风险：Router 引入导致行为分叉难以排查
  - 缓解：Observability 增加字段：`skillId`, `skillVersion`, `domainPackVersion`
- 风险：Domain Pack prompt 变更导致 SQL 生成偏移
  - 缓解：保持 v1 与 none 并存，灰度切换

---

## 5.13.8 Skill 是否能提升 LLM 回答质量？（针对当前架构的增益分析）

结论：**Skill 能提升整体回答质量**，但它的增益不是“让模型变聪明”，而是：

1) **降低自由度 → 提升稳定性（First-pass success）**
- 当前系统主要靠 LLM 自由生成 SQL，再用 policy/debug 兜底。
- Skill 会把问题拆成固定阶段（指标选择/维度选择/时间窗口/输出格式），并导向有限的 SQL 模板空间。
- 结果：同类问题更一致、可复现、波动更小。

2) **把高质量分析套路固化 → 解释更“像数据分析”**
- 很多“质量差”的回答不是 SQL 错，而是缺少：
  - 指标定义（count vs count distinct）
  - 边界解释（时间范围/过滤条件）
  - 结果解读（趋势/分布/异常）
- Skill 可强制产出：`analysisPlan` + `assumptions` + `resultSummary`。

3) **可版本化/可灰度/可回滚 → 可持续优化质量**
- 质量提升需要迭代（prompt、模板、规则），Skill 版本化让每次迭代可控。
- 即使 M8 暂缓，依旧可以用 M7 手工回归作为门禁。

4) **把“不该由 LLM 做的事”下沉为确定性逻辑**
- 例如：字段候选选择、中文列名 quoting、时间范围解析、LIMIT 注入、TIMESTAMPTZ 兼容转换。
- 这类任务确定性很强，交给 skill/工具层做能显著减少首答失败。

一句话：Skill 的核心价值是把“数据分析方法论”工程化，从而提升一致性与可维护性。

---

## 5.13.9 是否需要通用数据分析专用 Skill？（建议：需要）

结论：**建议增加一个通用的 `analysis.v1` 数据分析 Skill**，作为 Router 的默认路径之一（或作为 `nl2sql.v1` 的上层 orchestrator）。

原因：
- 你们当前用户需求在多数情况下并不是“写 SQL”，而是“获得可解释的分析结论”。
- 通用分析问题高度可模板化（统计/分组/趋势/分布/对比），非常适合 Skill 化。
- 相比 chart/cleaning，`analysis.v1` 的投入更小、风险更低、收益更直接。

---

## 5.13.10 通用数据分析 Skill（analysis.v1）详细规划（最小干预版本）

> 目标：在不引入 M8/M9 的前提下，用最小模块化改造把“通用数据分析套路”固化，提升首答质量与解释一致性。

### A. 定位与边界

- SkillId：`analysis.v1`
- 输入：自然语言问题 + schemaDigest + attachments
- 输出：
  - 若可直接回答：执行 1~N 条只读 SQL（默认 1 条，必要时最多 2 条）
  - 给出结构化结论（summary + assumptions + nextQuestions）
  - 永远附带 `llmDurationMs/queryDurationMs`
- 严禁：写操作（CREATE/INSERT/UPDATE/DELETE/DROP）

### B. 与现有链路的结合方式（低侵入）

有两种落地方式，建议从 **B1** 开始：

**B1：analysis.v1 作为 `nl2sql.v1` 的“上层 plan”**
- analysis.v1 负责：分类问题 → 选择 SQL 模板 → 生成 SQL
- sql 执行仍走现有 `sql_query_tool` + `sqlPolicy` + `sqlDebugOnce`
- 优点：几乎不动底层执行器

**B2：analysis.v1 作为 Router 的默认 skill（替换 nl2sql.v1）**
- 优点：从入口开始就更“数据分析导向”
- 风险：改动面稍大

### C. analysis.v1 的阶段划分（可映射为 prompt 结构）

#### Stage 1：问题分类（QueryType）
输出枚举（zod）：
- `kpi_single`：单指标（总数、总金额、均值等）
- `kpi_grouped`：分组指标（按渠道/地区/类目）
- `trend_time`：趋势（按天/周/月）
- `distribution`：分布（分位数、直方图桶、离群）
- `comparison`：对比（分组差异、A/B）
- `topn`：TopN 列表
- `clarification_needed`

#### Stage 2：字段映射（FieldMapping + Assumptions）
- 从 schemaDigest 提取候选字段：
  - 金额字段候选（amount/price/实付/支付）
  - 时间字段候选（下单时间/创建时间/支付时间）
  - 类别字段候选（渠道/地区/类目/商品）
- 若不确定：返回 `clarification_needed`，并给出 1~3 个可选字段让用户选。

#### Stage 3：SQL 模板选择（Template）
模板必须是有限集合（降低自由度），每个模板都有：
- 必需字段
- 可选过滤
- 默认 LIMIT/maxRows
- DuckDB 兼容写法（尤其时间/类型转换）

示例模板（v1 最小集）：
- KPI：`SELECT COUNT(*) ...` / `COUNT(DISTINCT ...)` / `SUM(...)` / `AVG(...)`
- GroupBy：`SELECT dim, COUNT(*) ... GROUP BY dim ORDER BY ... LIMIT ...`
- Trend（按天）：
  - `SELECT DATE_TRUNC('day', CAST(ts AS TIMESTAMP)) AS day, COUNT(*) ... GROUP BY day ORDER BY day`
- Distribution：
  - `SELECT AVG(x), MEDIAN(x), STDDEV_POP(x), MIN(x), MAX(x) ...`
  - 或分桶：`WIDTH_BUCKET`/自定义 CASE（根据 DuckDB 支持情况选择）

#### Stage 4：结果解释（ResultSummary）
输出结构（zod）：
- `summary`: string（结论）
- `assumptions`: string[]（本次假设：用哪个时间字段、过滤范围）
- `nextQuestions`: string[]（下一步建议）

> 注意：即使用户只问“多少”，也建议 summary 中把过滤条件说清楚（避免误解）。

### D. 代码落地步骤（可拆 PR，贴合最小干预）

#### D1：新增 skill 文件与 zod 契约
- `src/services/llm/skills/builtin/analysis.v1.ts`
- `src/services/llm/skills/builtin/analysisSchemas.v1.ts`（zod schemas）

#### D2：Router 增加路由规则（feature flag）
- 新增 flag：`enableAnalysisSkillV1`
- 路由策略：
  - 默认仍 `nl2sql.v1`
  - 当输入命中（统计/趋势/分布/对比/TopN）且 enable flag 开启 → 走 `analysis.v1`

#### D3：analysis.v1 内部复用现有执行与兜底能力
- SQL 执行：仍调用 `sql_query_tool`（或直接复用 `executeQuery`）
- SQL policy：仍走 `sqlPolicy`
- SQL debug：复用现有一次修复

#### D4：UI 侧展示保持不变
- ResultsDisplay 不需要新组件即可展示（仍是表格 + summary text）
- 若后续引入 chartSpec，再扩展 UI

#### D5：最小回归（M7）新增用例
- 覆盖每个 QueryType 至少 1 条
- 覆盖 NEED_CLARIFICATION 一条（字段/时间范围不确定时）

### E. 验收标准（analysis.v1）

- 首答成功率：同一批 M7 用例不低于现状
- 解释质量：summary 必须包含“指标 + 过滤条件/时间范围”
- 稳定性：同一输入多次运行 SQL 形态基本一致（模板化效果）
- 安全：绝不产生写 SQL
- 可回滚：关闭 flag 即回到 `nl2sql.v1`

---

## 5.13.11 M10（v3）：System Skill Prompt Pack + User Skill(L0)（按会话）

> 本节是基于你最终确认的决策回填的“可直接开工”的详细规划。
>
> 你的确认（约束与选择）：
> 1) 行业来源：**A. 用户设置（Profile里选）**
> 2) 用户自定义 skill：**L0（仅指标/字段映射/默认过滤，不允许用户写JS，不允许直接写任意SQL）**
> 3) 系统 skill 指令：**A（prompt 以配置/文件形式存在）**，并预留未来 **C（导入/导出）**
> 4) 用户 skill 可覆盖系统同名指标：**允许**，并要求可回退
> 5) 多表/多会话：用户 skill **按会话（attachments snapshot）** 生效

---

### 5.13.11.1 核心目标

- 将系统 skill（按行业）从“散落在代码/PromptManager”升级为可维护的 Prompt Pack（文件化、可版本化、可 review）。
- 引入 User Skill L0：让用户用最低成本定义“指标/字段映射/默认过滤”，显著提升首答质量与一致性。
- 保持最小干预：不改变既有 NL2SQL 基础能力，User Skill 作为“约束与增强层”注入。

---

### 5.13.11.2 概念拆分

#### A) System Skill Prompt Pack（按行业）

- 形式：Markdown 文件（可版本化）
- 作用：作为 prompt 的系统/行业层内容
- 命名建议：
  - `src/prompts/skills/ecommerce_basic_skill.md`
  - `src/prompts/skills/finance_basic_skill.md`
  - 未来版本：`ecommerce_basic_skill.v2.md`

内容建议包含：
- 行业术语与常见字段映射提示（但不依赖具体表）
- 常见分析范式与 SQL 模板建议
- 明确的输出结构（summary/assumptions）

#### B) User Skill L0（用户自定义）

User Skill L0 只允许用户提供“必要且安全”的内容：

1) **字段映射（Field Mapping）**
- orderIdColumn / userIdColumn / timeColumn / amountColumn（可选）

2) **指标定义（Metric Definitions）**
- 最小支持：
  - `count_orders`
  - `count_distinct_users`
  - `sum_amount`
  - `avg_amount`
- 每个 metric 只能由“受限表达式”组成（见后文 DSL）

3) **默认过滤（Default Filters）**
- 如：只统计 `订单状态 in ('已完成')`
- 强约束：只能是列名 + 受限运算符 + 常量列表（不允许子查询）

---

### 5.13.11.3 数据结构（L0 DSL，强约束，避免任意SQL）

> 不允许 any；用 zod 校验；存储在 settings / chrome storage。

#### UserSkillConfig（会话级）

- `industryId: 'ecommerce' | 'finance' | ...`（来自 Profile）
- `version: 'v1'`
- `tables: Record<tableName, TableSkillConfig>`
  - 以 `attachmentsSnapshot` 中的 `tableName` 为 key（按会话）

#### TableSkillConfig

- `fieldMapping`：
  - `orderIdColumn?: string`
  - `userIdColumn?: string`
  - `timeColumn?: string`
  - `amountColumn?: string`

- `defaultFilters?: FilterExpr[]`

- `metrics?: Record<string, MetricDefinition>`
  - 支持覆盖系统同名 metric（override）

#### FilterExpr（受限）

- `column: string`
- `op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'contains'`
- `value: string | number | boolean | Array<string | number>`

#### MetricDefinition（受限）

- `label: string`
- `aggregation: 'count' | 'count_distinct' | 'sum' | 'avg'`
- `column?: string`（count 可不填，其他需要列名）
- `where?: FilterExpr[]`（可选，额外过滤）

> 为什么不用任意 SQL：
> - L0 的收益主要来自“字段/指标定义+默认过滤”而非表达力
> - 安全可控，避免注入与绕过 SQL policy

---

### 5.13.11.4 注入点与执行流（最小改动方式）

#### 注入点 1：PromptManager（系统 skill pack + 用户 skill digest）

- Prompt 组成：
  1) Global System Policy（已有）
  2) Industry System Skill Pack（新增：从 md 文件加载）
  3) User Skill Digest（新增：把用户配置摘要成短文本）
  4) schemaDigest（已有/已实现）
  5) 用户问题

User Skill Digest 示例（给 LLM 看）：
- Active table: main_table_1
- Field mapping:
  - orderId: 订单编号
  - time: 下单时间
  - amount: 实付金额
- Default filters:
  - 订单状态 in ['已完成']
- Metrics overrides:
  - gmv = sum(实付金额) where 订单状态 in ['已完成']

#### 注入点 2：analysis.v1（模板SQL拼装时应用 L0 配置）

- `analysis.v1` 在生成模板 SQL 时：
  - 优先使用 user fieldMapping（time/amount/dimension）
  - 拼 SQL 时自动附带 defaultFilters（WHERE 子句）
  - 对 KPI/GroupBy/Trend/Distribution 模板统一生效

#### 注入点 3：nl2sql.v1（非模板路径）

- 当回退到 nl2sql 执行器时：
  - 仍在 prompt 中注入 user skill digest
  - 让模型更偏向使用正确字段与过滤条件

---

### 5.13.11.5 存储与 UI（最小可用）

#### 存储（先实现 A，预留 C）

- A：存入 `storageService/settingsService`（与你们现有一致）
- C 预留：导入/导出 JSON

#### UI（ProfilePage 扩展）

- 行业选择（你已确认：Profile内配置）
- User Skill L0 编辑器：
  - 选择 table（来自当前会话 attachmentsSnapshot）
  - fieldMapping 下拉选择列（从 schemaDigest 提取列名）
  - defaultFilters：列 + op + value
  - metrics：增删改（仅受限聚合）

---

### 5.13.11.6 回滚与兼容

- 不配置 user skill：行为与现状一致。
- user skill 配置错误：
  - zod 校验失败直接阻止保存
  - runtime 使用空配置并提示用户
- override 可回退：
  - UI 提供“一键恢复系统默认指标”

---

### 5.13.11.7 测试用例（最小回归集，补充到 M7）

> 目标：验证“L0 注入”确实改变 SQL/结果，并且不破坏既有路径。

#### Case U1：字段映射生效（KPI）
- 前置：user skill 配置 amountColumn=实付金额，defaultFilters=订单状态 in ['已完成']
- 输入：`总共有多少订单`
- 期望：
  - SQL 含 WHERE 订单状态 in ('已完成')（模板或 nl2sql 结果均可）
  - skillTag 显示：analysis.v1 或 nl2sql.v1（允许两种，但结果必须应用过滤）

#### Case U2：趋势字段映射生效
- 前置：timeColumn=下单时间
- 输入：`按天统计订单数趋势`
- 期望：
  - 不再触发 NEED_CLARIFICATION
  - 生成 SQL 使用 `下单时间`

#### Case U3：指标 override 生效（GMV）
- 前置：定义 metric `gmv = sum(实付金额) where 订单状态 in ['已完成']`
- 输入：`计算GMV`
- 期望：
  - SQL 使用 SUM(实付金额) 且包含过滤

#### Case U4：禁用任意 SQL（安全性）
- 前置：尝试在 UI 的 filter value 输入 `a'); DROP TABLE main_table_1; --`
- 期望：
  - zod 校验/保存拦截（或 runtime 执行前拒绝）
  - 不执行写 SQL

#### Case U5：多表按会话隔离
- 前置：会话包含 main_table_1/main_table_2；仅为 main_table_1 配置 filters
- 输入：`分别统计两个表的订单数`
- 期望：
  - 对应表应用各自配置（或无法 join 时进入澄清）

#### Case U6：Digest 裁剪稳定
  - 前置：创建 30 个 metrics + 20 个 filters
  - 期望：
    - prompt 注入的 digest 仍 <= 1200 chars
    - FieldMapping 必须存在
    - filters/metrics 只保留 Top-N/Top-K + 折叠提示

#### Case U7：透明度标签
  - 前置：配置 user skill（有 filters）
  - 输入：`总共有多少订单`
  - 期望：
    - thought 顶部出现 `[Skill] ...`、`[Industry] ...`、`[UserSkill] applied: yes`
    - ThinkingSteps 展开能看到 effective filters

#### Case U8：相对时间 filter 生效
  - 前置：fieldMapping.timeColumn=下单时间，defaultFilters 增加 最近30天
  - 输入：`统计订单数`
  - 期望：SQL WHERE 子句包含：
    - `CAST(下单时间 AS TIMESTAMP) >= CURRENT_TIMESTAMP - INTERVAL '30 days'`

---

### 5.13.11.8 验收标准

- 功能：
  - 用户能配置 L0（字段映射/默认过滤/指标）并影响分析结果
- 安全：
  - 不存在任意 SQL 注入入口
  - 写操作仍被 policy 拦截
- 稳定：
  - M7 原有用例不回归
  - U1~U8 通过
- 可解释：
  - Chat/结果卡片能看到 `[Skill] ...`，并且 SQL 可审计

---

## 5.13.12 Review 补充：Digest 长度管理 / 可发现性 / 相对时间 FilterExpr / 通用化抽象

> 本节用于回答你 review 后的 4 个问题，并把要求落到“可实现的工程约束 + 数据结构 + 验收用例”。

---

### 5.13.12.1 User Skill Digest 的上下文长度管理

#### 背景
- User Skill Digest 会随用户配置增长（filters/metrics 变多），如果不控长会挤占 LLM 的上下文窗口。
- 我们的目标是：**Digest 可读、可审计、但必须可控**。

#### 建议的预算（以你们当前应用为基线）

> 你们现在还没有做 M8 token 级评测，所以先用“字符预算”做硬限制，并预留后续替换为 token 预算。

- `schemaDigestBudgetChars = 4000`（你们现有实现已经在 4000 左右截断）
- `userSkillDigestBudgetChars = 1200`（推荐）
- `systemSkillPackBudgetChars = 2000`（按行业 pack 的 md 做「精简版」注入）

理由：
- 最关键的是 schemaDigest（列名/类型），其次是用户的字段映射与默认过滤；
- 用户 metrics 很多时，不应该全部塞进 prompt，而应做“Top-K + summary”。

#### Digest 裁剪策略（必须 deterministic，避免波动）

1) **FieldMapping 永远保留（最高优先级）**
- orderId/userId/time/amount 等 4~6 行，基本不会超预算。

2) **defaultFilters 保留 Top-N（建议 N=5）**
- 超过 N：保留最常用（按 UI 排序或最近编辑顺序），其余折叠成 `+X more filters`。

3) **metrics 保留 Top-K（建议 K=8）**
- 规则：
  - 优先保留系统预置/用户 override 的常用指标（count_orders, gmv, aov, refund_rate...）
  - 其余折叠成 `+X more metrics`

4) **最终统一 `slice(0, budgetChars)`**
- 作为最后防线。

#### 失败/超限时的 UX
- 保存时不禁止（因为配置可用于 UI 与本地执行），但 prompt 注入时会裁剪。
- 在“Skill 配置页”给出提示：
  - `Prompt injection size: 1034/1200 chars`
  - 超限时显示 `Truncated in prompt`。

#### 测试用例（新增）

- Case U6：Digest 裁剪稳定
  - 前置：创建 30 个 metrics + 20 个 filters
  - 期望：
    - prompt 注入的 digest 仍 <= 1200 chars
    - FieldMapping 必须存在
    - filters/metrics 只保留 Top-N/Top-K + 折叠提示

---

### 5.13.12.2 增强 Skill 的“可发现性与透明度”

#### 目标
- 新手知道：系统有哪些行业指标（system metrics）
- 用户知道：自己的 L0 配置是否生效（是否被注入、是否被使用）
- 每次运行可审计：本次使用了哪个 skill/行业 pack/用户配置摘要

#### 建议实现（最小干预，分三层）

1) **ProfilePage：提供“内置指标库”与“用户覆盖状态”**
- 在行业选择下方增加：
  - System Metrics（只读列表）
  - User Overrides（显示哪些 metric 覆盖了系统）
  - 一键回退到系统默认

2) **Workbench：在每条结果卡片展示“运行配置标签”**
- 你们已经有 `[Skill] ...` 标签（已实现）
- 建议新增两行（仍放在 thought 最上方，最小改动）：
  - `[Industry] ecommerce`（来自 Profile）
  - `[UserSkill] applied: yes/no, digestChars: 534/1200`

3) **ThinkingSteps 面板补充 “Effective Settings”**
- 展开后显示：
  - 本次 tableName
  - fieldMapping
  - defaultFilters（Top-N）
  - metrics（Top-K）
- 让用户能看懂“为什么这么算”。

#### 验收用例（新增）

- Case U7：透明度标签
  - 前置：配置 user skill（有 filters）
  - 输入：`总共有多少订单`
  - 期望：
    - thought 顶部出现 `[Skill] ...`、`[Industry] ...`、`[UserSkill] applied: yes`
    - ThinkingSteps 展开能看到 effective filters

---

### 5.13.12.3 为 FilterExpr 增加“相对时间”支持（UI Quick Pick + 运行时编译）

#### 目标
- 保持你们已有的“最近7天/30天/90天”交互习惯
- 用户不需要写日期，选择即可生效
- 仍然保持 L0：不允许任意 SQL

#### 数据结构扩展（向后兼容）

在 `FilterExpr` 的 `value` 增加一种对象形式（RelativeTime）：

- `value: { kind: 'relative_time'; unit: 'day' | 'week' | 'month'; amount: number; direction: 'past' | 'future' }`

并新增一个可选字段：
- `valueType?: 'literal' | 'relative_time'`（可选，用于 UI 简化，不强依赖）

#### 运行时编译规则（SQL 编译层）

当 `FilterExpr.column` 对应时间字段（来自 fieldMapping.timeColumn 或用户手选）且 value 为 relative_time：

- `past`：
  - `col >= CURRENT_TIMESTAMP - INTERVAL '<amount> <unit>'`
- `future`：
  - `col <= CURRENT_TIMESTAMP + INTERVAL '<amount> <unit>'`

并强制加 CAST 兼容：
- `CAST(col AS TIMESTAMP)`（避免 TIMESTAMPTZ - INTERVAL 的 binder error 回归）

示例：
- 最近 30 天：
  - `CAST(下单时间 AS TIMESTAMP) >= CURRENT_TIMESTAMP - INTERVAL '30 days'`

#### UI 交互（ProfilePage 的 filter editor）

- 当用户选择的列是 timeColumn（或类型包含 timestamp/date）时，显示 Quick Pick：
  - 最近7天 / 最近30天 / 最近90天
  - 自定义：输入数字 + 单位（天/周/月）

#### 验收用例（新增）

- Case U8：相对时间 filter 生效
  - 前置：fieldMapping.timeColumn=下单时间，defaultFilters 增加 最近30天
  - 输入：`统计订单数`
  - 期望：SQL WHERE 子句包含：
    - `CAST(下单时间 AS TIMESTAMP) >= CURRENT_TIMESTAMP - INTERVAL '30 days'`

---

### 5.13.12.4 技术实现：Skill Core 模块高度抽象、通用化（便于不同行业扩展）

#### 目标
- skill 核心逻辑与“行业内容（prompt/指标）”解耦
- 新增行业时：只需要新增行业 pack 与系统指标定义，不改 core

#### 建议的模块分层

1) **Core（纯通用，不含行业内容）**
- `src/services/llm/skills/`：registry/router/types
- `src/services/llm/skills/core/`（建议新增）
  - `digestBuilder.ts`（schemaDigest/userSkillDigest 统一裁剪）
  - `filterCompiler.ts`（FilterExpr -> SQL WHERE 片段，含 relative_time）
  - `metricCompiler.ts`（MetricDefinition -> SQL select expression）

2) **Industry Packs（内容层，可配置化）**
- `src/prompts/skills/`：`ecommerce_basic_skill.md` 等
- `src/services/llm/industry/`
  - `ecommerce/metrics.v1.ts`（system metrics 列表）
  - `finance/metrics.v1.ts`

3) **User Skill（数据层，按会话）**
- `src/services/userSkill/`
  - `userSkillSchema.ts`（zod）
  - `userSkillService.ts`（storage/settings + per-session binding）

#### Router 规则保持通用
- Router 仅决定调用哪个 skill（analysis/nl2sql/...）
- 行业差异通过 pack 注入，不在 router 里 hardcode

#### 验收（新增）

- Case U9：新增行业 pack 的最小改动
  - 期望：新增 `finance_basic_skill.md` + `finance/metrics.v1.ts` 后
    - Profile 可选择 finance
    - prompt 注入 finance pack
    - core 不需要改动

---

## 5.13.13 M10 实施里程碑规划（Implementation Milestones）

> 本节定义 M10（System Skill Prompt Pack + User Skill L0）的分阶段交付计划，包含依赖关系、验收标准与工期估算。

---

### 5.13.13.1 总体目标与约束

#### 目标
- 将行业知识从代码迁移到可版本化的 Prompt Pack（Markdown 文件）
- 引入 User Skill L0，让用户低成本定义字段映射/指标/过滤规则
- 首答成功率从 70% 提升至 95%（SQL 执行通过，不报错）

#### 技术约束
- 最小干预原则：聚焦 Skill 注入层，不重构底层 Agent 架构
- 安全优先：User Skill L0 必须使用受限 DSL，禁止任意 SQL/JS
- 扩展性：Core 与 Industry Pack 解耦，新增行业无需改 Core

#### 总工期
9-14 天（5 个里程碑串行/部分并行）

---

### 5.13.13.2 里程碑 M10.1：Core 基础设施层（通用能力抽象）

#### 工期
2-3 天

#### 目标
构建 Skill 系统的通用核心，与行业内容解耦。

#### 交付物

**1. 数据结构定义**（`src/services/llm/skills/types.ts`）
- `UserSkillConfig`（全局，zod schema）
- `TableSkillConfig`
- `FilterExpr`（含 relative_time 支持）
- `MetricDefinition`

**2. Core 工具模块**（`src/services/llm/skills/core/`）
- `digestBuilder.ts`：统一裁剪逻辑（schemaDigest + userSkillDigest，预算管理）
- `filterCompiler.ts`：`FilterExpr → SQL WHERE`（含相对时间编译）
- `metricCompiler.ts`：`MetricDefinition → SQL SELECT`

**3. 存储服务**（`src/services/userSkill/`）
- `userSkillSchema.ts`：zod 校验（拦截非法输入）
- `userSkillService.ts`：全局 settings 读写（Chrome storage）

#### 验收标准
- [ ] TypeScript 编译通过，无 `any` 类型
- [ ] zod schema 能拦截非法输入（Case U4：SQL 注入攻击被拒绝）
- [ ] `filterCompiler` 能正确编译相对时间（Case U8：生成 `CAST(col AS TIMESTAMP) >= CURRENT_TIMESTAMP - INTERVAL '30 days'`）
- [ ] 单元测试覆盖：
  - `FilterExpr` 编译（含相对时间、时区 UTC）
  - `MetricDefinition` 编译（含 where 嵌套）
  - Digest 裁剪（Top-N/Top-K 规则，deterministic）
- [ ] Digest 预算控制：userSkillDigest <= 1200 chars（Case U6）

#### 依赖
无（基础层）

---

### 5.13.13.3 里程碑 M10.2：System Skill Prompt Pack（行业知识层）

#### 工期
1-2 天

#### 目标
将行业知识从代码迁移到 Markdown 文件，可版本化、可 review、可远程加载。

#### 交付物

**1. Prompt Pack 文件**（`src/prompts/skills/`）
- `ecommerce_basic_skill.v1.md`（电商领域）
  - 行业术语与常见字段映射提示（不依赖具体表）
  - 常见分析范式与 SQL 模板建议
  - 明确的输出结构（summary/assumptions）
- `_template.md`（新行业扩展模板）

**2. System Metrics 定义**（`src/services/llm/industry/`）
- `ecommerce/metrics.v1.ts`：
  - `count_orders`, `count_distinct_users`, `sum_amount`, `avg_amount`
  - `gmv`, `aov`, `refund_rate` 等电商指标
- `_shared/baseMetrics.ts`：通用指标（count/sum/avg）

**3. Prompt Pack Loader**（`src/services/llm/promptPackLoader.ts`）
- 从 md 文件加载行业 pack
- 支持版本选择（v1/v2）
- **预留远程服务端获取接口**：`loadFromRemote(industryId, version): Promise<PromptPack>`（当前返回 mock，不实际调用）

#### 验收标准
- [ ] `ecommerce_basic_skill.v1.md` 内容完整（术语映射 + 分析范式 + 输出结构）
- [ ] `PromptManager` 能正确注入 System Pack
- [ ] Prompt Pack 长度 <= 2000 chars（systemSkillPackBudgetChars）
- [ ] 预留远程加载接口（返回 mock 数据即可）
- [ ] 新增行业只需添加 md + metrics.ts，core 不改动（Case U9）

#### 依赖
无（与 M10.1 并行）

---

### 5.13.13.4 里程碑 M10.3：User Skill L0 UI 与存储集成

#### 工期
3-4 天

#### 目标
实现用户可视化配置 Skill，并持久化到全局 settings。

#### 交付物

**1. ProfilePage 扩展**（`src/pages/settings/ProfilePage.tsx`）
- **行业选择**（dropdown：ecommerce/finance/...）
- **User Skill L0 编辑器**：
  - 表选择（从当前会话 attachmentsSnapshot 获取）
  - Field Mapping（dropdown，列名从 schemaDigest 提取）
    - orderIdColumn / userIdColumn / timeColumn / amountColumn
  - Default Filters（列 + op + value）
    - 时间列显示快捷按钮："最近7天" / "最近30天" / "最近90天"
  - Metrics（增删改，受限聚合：count/count_distinct/sum/avg）
- **System Metrics 展示**（只读列表 + override 状态标识）
- **一键回退到系统默认**

**2. ChatPanel 提示文案**（`src/pages/workbench/components/ChatPanel.tsx`）
- 上传附件右侧显示浅黄色文案：
  - `✓ User Skill 已应用`（当有配置时）
  - `未配置 Skill，使用系统默认`（无配置时）

**3. 存储服务集成**（`src/services/userSkill/userSkillService.ts`）
- `saveUserSkill(config: UserSkillConfig): Promise<void>`
- `loadUserSkill(): Promise<UserSkillConfig | null>`
- `resetToDefault(tableName?: string): Promise<void>`

#### 验收标准
- [ ] UI 能正确加载/保存配置（刷新页面后配置仍在）
- [ ] Field Mapping 的列名列表与当前表 schema 一致
- [ ] 时间列显示"最近30天"等快捷按钮（Case U8）
- [ ] 非法输入被 zod 拦截（Case U4：SQL 注入被阻止）
- [ ] ChatPanel 文案正确显示（浅黄色，位置在附件右侧）
- [ ] 一键回退能清空用户配置并恢复系统默认
- [ ] 存储使用全局 settings（Chrome storage），跨会话共享

#### 依赖
M10.1（需要 userSkillService + zod schema）

---

### 5.13.13.5 里程碑 M10.4：Skill 注入与执行流集成

#### 工期
2-3 天

#### 目标
将 System Pack + User Skill Digest 注入到 prompt，并在 analysis.v1/nl2sql.v1 中生效。

#### 交付物

**1. PromptManager 改造**（`src/services/llm/promptManager.ts`）
- `buildPrompt(role, userInput, tableSchema, userSkill)` 新增 userSkill 参数
- Prompt 组装顺序：
  1. Global System Policy
  2. Industry System Skill Pack（从 promptPackLoader 加载）
  3. **User Skill Digest**（新增，调用 digestBuilder）
  4. schemaDigest
  5. 用户问题

**2. analysis.v1 模板 SQL 增强**（`src/services/llm/executors/analysisExecutor.ts`）
- KPI/Trend/Distribution 模板生成时：
  - 优先使用 `userSkill.fieldMapping.timeColumn/amountColumn`
  - 自动附加 `userSkill.defaultFilters` 到 WHERE 子句
  - 对用户 override 的 metrics 优先使用用户定义

**3. nl2sql.v1 兜底路径**（`src/services/llm/agentExecutor.ts`）
- 在 prompt 中注入 User Skill Digest（即使不走模板）

**4. Query Type Router**（`src/services/llm/skills/queryTypeRouter.ts`）
- **混合策略**（关键词 + LLM 分类兜底）：
  - Phase 1：快速关键词匹配（覆盖 70%+ 常见 case）
  - Phase 2：LLM 分类（关键词未命中或置信度 < 0.7）
- **关键词规则**：
  - 统计：`总共/多少/有几/数量/count/total/统计`
  - 聚合：`平均/最大/最小/总和/sum/avg/max/min`
  - 趋势：`趋势/变化/增长/下降/按天/按月/trend/走势`
  - 分布：`分布/占比/比例/distribution/percentage`
  - TopN：`排名/前N/top/最多/最少/排行`
  - 对比：`对比/比较/compare/vs/差异`
- **置信度判断**：
  - 单关键词 → 0.6（触发 LLM 二次确认）
  - 多关键词 → 0.9（直接走模板）
  - 关键词 + 领域词 → 1.0（高置信走模板）

#### 验收标准
- [ ] User Skill Digest 长度 <= 1200 chars（Case U6）
- [ ] 字段映射生效（Case U1：SQL 包含 defaultFilters）
- [ ] 趋势字段映射生效（Case U2：不再触发 NEED_CLARIFICATION）
- [ ] 指标 override 生效（Case U3：SQL 使用用户定义的 GMV）
- [ ] 多表按会话隔离（Case U5：各表应用各自配置）
- [ ] 关键词匹配准确率 >= 70%（手动测试 20 条 case）
- [ ] 用户 skill 优先级高于系统 skill（完全覆盖，不 merge）

#### 依赖
M10.1（digestBuilder）+ M10.2（promptPackLoader）+ M10.3（userSkillService）

---

### 5.13.13.6 里程碑 M10.5：透明度与可解释性增强

#### 工期
1-2 天

#### 目标
让用户看懂"系统用了哪些 Skill、我的配置是否生效、为什么这么算"。

#### 交付物

**1. 结果卡片标签增强**（`src/pages/workbench/components/ResultsDisplay.tsx`）
- 在 `thought` 顶部新增三行标签：
  ```
  [Skill] analysis.v1
  [Industry] ecommerce
  [UserSkill] applied: yes, digestChars: 534/1200
  ```

**2. ThinkingSteps 面板扩展**（`src/pages/workbench/components/ThinkingSteps.tsx`）
- 新增 "Effective Settings" 折叠面板：
  - 本次 tableName
  - fieldMapping（4 行）
  - defaultFilters（Top-5 + 折叠提示 `+X more filters`）
  - metrics（Top-8 + 折叠提示 `+X more metrics`）

**3. ProfilePage System Metrics 展示**（`src/pages/settings/ProfilePage.tsx`）
- System Metrics 只读列表（展开/折叠）
- User Override 状态标识（如 `gmv (用户覆盖)`）

#### 验收标准
- [ ] 结果卡片能看到三行标签（Case U7）
- [ ] ThinkingSteps 能展开查看 Effective Settings
- [ ] ProfilePage 能看到系统内置指标列表
- [ ] Override 状态明确标识（用户知道哪些是自己定义的）
- [ ] 所有文案使用英文（代码注释、Console 日志）
- [ ] 交互提示使用中文（UI 文案）

#### 依赖
M10.4（需要执行流已集成 Skill）

---

### 5.13.13.7 里程碑依赖关系图

```
M10.1 (Core)         M10.2 (System Pack)
    ↓                      ↓
    └──────────┬───────────┘
               ↓
           M10.3 (UI)
               ↓
           M10.4 (Integration)
               ↓
           M10.5 (Transparency)
```

**并行路径**：
- M10.1 与 M10.2 可并行开发（无依赖）
- M10.3 依赖 M10.1 完成
- M10.4 依赖 M10.1 + M10.2 + M10.3 全部完成
- M10.5 依赖 M10.4 完成

---

### 5.13.13.8 整体验收标准（M10 完成）

#### 功能验收（测试用例 U1~U9 全部通过）
- [ ] 用户能配置 L0 Skill 并影响分析结果（U1：字段映射生效）
- [ ] 趋势分析不再触发 NEED_CLARIFICATION（U2：timeColumn 生效）
- [ ] 指标 override 生效（U3：GMV 使用用户定义）
- [ ] 安全性：SQL 注入被拦截（U4：zod 校验拒绝）
- [ ] 多表隔离（U5：按会话应用各自配置）
- [ ] Digest 长度可控（U6：30 个 metrics 仍 <= 1200 chars）
- [ ] 透明度可审计（U7：能看到三行标签 + ThinkingSteps）
- [ ] 相对时间生效（U8：SQL 包含 `CURRENT_TIMESTAMP - INTERVAL`）
- [ ] 扩展性验证（U9：新增 finance pack 无需改 core）

#### 质量指标
- [ ] **首答成功率：70% → 95%**（SQL 执行通过，不报错）
- [ ] 关键词匹配准确率 >= 70%（Query Type Router）
- [ ] Digest 注入不超预算：
  - schemaDigest <= 4000 chars
  - userSkillDigest <= 1200 chars
  - systemSkillPack <= 2000 chars
- [ ] TypeScript 编译通过，无 `any` 类型
- [ ] `bun run build` 通过
- [ ] 已有 M7 用例不回归（最小干预原则）

#### 安全与稳定性
- [ ] User Skill L0 不允许任意 SQL/JS（仅受限 DSL）
- [ ] zod 校验能拦截所有非法输入
- [ ] SQL policy 仍强制只读（写操作被拒绝）
- [ ] 相对时间使用 UTC（时区统一）
- [ ] 用户 skill 优先级高于系统 skill（完全覆盖）

#### 可维护性
- [ ] Core 与 Industry Pack 解耦（新增行业无需改 core）
- [ ] Prompt Pack 可版本化（v1/v2）
- [ ] 预留远程服务端获取接口（loadFromRemote）
- [ ] 代码注释使用英文，UI 文案使用中文

---

### 5.13.13.9 风险与缓解措施

#### 风险 1：Digest 长度管理复杂度高
**缓解**：
- 使用 deterministic 裁剪策略（Top-N/Top-K）
- 单元测试覆盖边界 case（30 个 metrics）
- UI 实时显示 `digestChars: 534/1200`

#### 风险 2：关键词匹配准确率不达标
**缓解**：
- 先实现 LLM 分类兜底（置信度 < 0.7 时触发）
- 收集 badcase 持续优化关键词库
- M10.4 验收时手动测试 20 条 case

#### 风险 3：多表场景配置复杂度高
**缓解**：
- UI 提供表选择 + 配置复制功能
- 默认配置（空配置时使用系统默认）
- 透明度标签明确显示"本次使用哪张表的配置"

#### 风险 4：用户 override 导致结果不符合预期
**缓解**：
- ProfilePage 明确标识哪些 metric 被用户覆盖
- 一键回退到系统默认
- ThinkingSteps 展示 Effective Settings（可审计）

---

### 5.13.13.10 后续优化方向（M11+）

#### 短期（M11）
- 远程服务端获取 Skill Pack（实际调用 API）
- 导入/导出 User Skill 配置（JSON 文件）
- 更多行业 Pack（finance/healthcare/...）

#### 中期（M12）
- User Skill L1：允许更复杂的指标定义（窗口函数/子查询，仍需安全校验）
- Skill 自动推荐（基于用户历史查询）
- A/B 测试框架（对比 System Skill vs User Skill 效果）

#### 长期（M13+）
- 协同编辑 Skill（团队共享配置）
- Skill Marketplace（社区贡献 Industry Pack）
- 自适应 Skill（根据数据特征自动优化）

---

