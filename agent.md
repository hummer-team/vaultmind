# Vaultmind — agent.md 说明

本文档面向开发者和维护者，介绍 Vaultmind 项目中与 LLM Agent、DuckDB worker、工具（tools）及相关 hook/service 的架构、运行方式、扩展点与调试建议。

简短 TL;DR
- Vaultmind 是一个以浏览器前端为主的交互式数据分析助手：UI（React）↔ useLLMAgent / AgentExecutor ↔ LLM 客户端（OpenAI）↔ 工具（当前为 DuckDB SQL 工具）↔ DuckDB WASM Worker。
- 主要入口/关注点文件：`src/services/llm/*`, `src/services/tools/*`, `src/workers/duckdb.worker.ts`, `src/hooks/*`, `src/pages/workbench/*`。

更新日志
- 本文档基于当前代码仓库（2026-01-15）自动生成，已阅读并引用了 repository 中的关键文件。

一、目的
- 说明 Agent 的职责、执行流程、关键实现文件与如何在项目中扩展（新增 prompt 或 tool）。
- 目标读者：想理解或扩展 Vaultmind 的开发者。

二、总体架构概览
- 组件（高层次）
  - 前端 UI（React 页面/组件）：`src/pages/workbench` 下的 Workbench、ChatPanel、FileDropzone、ResultsDisplay 等。
  - Hook 层：`src/hooks/useLLMAgent.ts`（对外的 Agent API 层）、`src/hooks/useDuckDB.ts`（与 DuckDB worker 协作）、`src/hooks/useFileParsing.ts`（文件解析与上传）等。
  - LLM 服务层（agent 逻辑）：
    - `src/services/llm/llmClient.ts`：LLM API 客户端（目前使用官方 `openai` npm 包）。
    - `src/services/llm/promptManager.ts`：管理 prompt 模板与构建完整的 prompt 文本。
    - `src/services/llm/agentExecutor.ts`：Agent 的执行器——负责：获取表结构、构建 prompt、调用 LLM、解析 LLM 响应并调用工具。 
  - Tools：`src/services/tools/duckdbTools.ts`（当前仅 `sql_query_tool`，负责执行 SQL 并返回结果）。
  - Worker：`src/workers/duckdb.worker.ts`（DuckDB WASM worker，负责初始化 DuckDB、加载文件缓冲区、执行 SQL）。
  - 其他：`src/services/duckDBService.ts`（在 worker/主线程间封装 DuckDB 操作），`src/services/settingsService.ts`、`src/services/storageService.ts`、`src/status/appStatusManager.ts` 等。

三、关键文件与职责（逐项）
- Hooks
  - `src/hooks/useLLMAgent.ts`：项目中暴露给组件的 Agent hook（目前是占位/封装层，具体逻辑在 `AgentExecutor`）。
  - `src/hooks/useDuckDB.ts`：封装 DuckDB 初始化、表创建、executeQuery、dropTable 等逻辑（Workbench 通过它与 DB 交互）。
  - `src/hooks/useFileParsing.ts`：负责把用户上传的文件读取为 buffer，并通过 sandbox/iframe 把文件注册到 DuckDB（见 `loadFileInDuckDB`）。

- LLM 相关服务
  - `src/services/llm/llmClient.ts`
    - 使用 `openai` 官方客户端构建 LLM 客户端实例。
    - 类型：LLMConfig (provider, apiKey, baseURL, modelName, mockEnabled?)。
    - 注意：构造时会把 apiKey、baseURL 带入；浏览器模式允许 dangerouslyAllowBrowser。
  - `src/services/llm/promptManager.ts`
    - 管理不同角色/场景的 prompt 集合，目前导入了 `src/prompts/ecommerce.ts`。
    - 提供 `getToolSelectionPrompt(role, userInput, tableSchema)` 生成完整 prompt（会将 tableSchema JSON.stringify 后嵌入模板）。
  - `src/services/llm/agentExecutor.ts`
    - Agent 的核心：
      - 通过 `executeQuery`（注入函数，来自 useDuckDB）读取数据库表名与 schema（会尝试查询 `information_schema.tables` 或回退到 `DESCRIBE main_table`）。
      - 通过 PromptManager 构造 LLM 输入（role 固定为 'ecommerce' 在当前实现中）。
      - 调用 LlmClient（若 `llmConfig.mockEnabled` 为 true，则会返回一个 mock 响应用于调试）。
      - 解析 LLM 返回：支持 LLM 的 function/tool 调用（tool_calls / message.content 中嵌入的 JSON），并将对应工具从 `services/tools` 注册表中调用。
      - 对 DuckDB 返回的大整数（BigInt）进行字符串化处理 `_sanitizeBigInts`，以便 JSON 序列化与前端显示。

- Tools
  - `src/services/tools/duckdbTools.ts`
    - 当前实现了 `sql_query_tool`，这是一个通用 SQL 执行器，签名为 `(executeQuery, {query}) => Promise<any>`。
    - `tools` 注册表用于在 AgentExecutor 中根据工具名查找实现。
    - `toolSchemas` 为工具声明 JSON Schema，用于在向 LLM 请求时把工具能力声明给 LLM（在调用 openai.chat.completions.create 时传入）。

- Worker
  - `src/workers/duckdb.worker.ts`
    - 负责接收消息（DUCKDB_INIT, LOAD_FILE, DUCKDB_LOAD_DATA, DUCKDB_EXECUTE_QUERY 等），并通过 `DuckDBService` 执行相应操作。
    - 初始化时会使用 `@duckdb/duckdb-wasm` 的 bundle 选择逻辑，并手动创建 core worker（`new Worker(bundle.mainWorker, { type: 'module' })`），然后把 worker 传给 `DuckDBService.initialize(bundle, coreWorker)`。
    - 在 worker 中对错误与成功会回应 `${type}_ERROR` / `${type}_SUCCESS` 消息，主线程需要按协议处理这些消息。

- 前端页面/组件
  - `src/pages/workbench/index.tsx`（Workbench）
    - 负责：管理 UI 状态（initializing, parsing, fileLoaded, analyzing 等）、初始化 DuckDB/sandbox、文件上传、调度 AgentExecutor（new AgentExecutor(llmConfig, executeQuery)）并展示结果。
    - 从 `import.meta.env` 读取 LLM 相关配置：
      - VITE_LLM_PROVIDER, VITE_LLM_API_KEY, VITE_LLM_API_URL, VITE_LLM_MODEL_NAME, VITE_LLM_MOCK
    - File 上传后会将文件放到 `main_table_{n}`（例如：`main_table_1`）并通过 `PromptManager.getSuggestions('ecommerce')` 获取预设建议。
  - `src/pages/workbench/components/ChatPanel.tsx`
    - UI 层：消息输入、文件上传（通过 antd Upload beforeUpload 调用 Workbench 的 onFileUpload）、显示 suggestions 与 attachments。

四、运行 / 构建（快速开始）
- 前提
  - 本项目使用 Bun 作为首选运行/构建工具（建议使用 Bun LTS）。Bun 与 package.json 脚本兼容，生产/开发脚本名与 `package.json` 保持一致。
- Bun 安装（macOS / zsh）
  - 推荐（官方一行安装脚本）：`curl -fsSL https://bun.sh/install | bash`（安装脚本会把 `~/.bun/bin` 加入 PATH，重启 shell 或 `source ~/.zshrc` 后生效）。  
  - 可选（Homebrew，如可用）：`brew install bun`。
- 依赖与常用命令（与 `package.json` 对应）
  - 安装依赖：`bun install`（与 npm/yarn 等价）。  
  - 开发：`bun run dev`（启动 Vite 开发服务器）。  
  - 构建：`bun run build`（通常会先运行 tsc 再 vite build，参见 package.json）。  
  - 预览：`bun run preview`。  
  - lint：`bun run lint`。
- 示例：在 macOS / zsh 下启动开发（示例）
  - 在 shell 中先设置环境变量（示例）：`export VITE_LLM_MOCK=true`；`export VITE_LLM_API_KEY="<your-key>"`  

- 备注
  - 若环境中同时存在 node/npm，Bun 能兼容大多数 package.json 脚本，但注意原生模块或特定 bundler 插件的兼容性（遇到问题时参考 Bun 官方文档或切换到 npm/yarn 进行回退测试）。

LLM 模型约束与 Skills 声明
- 目的与概览  
  - 该节说明在向 LLM 提示与解析工具调用时的“技能（skills）声明”格式与必需的安全/格式约束，及如何在代码层面（`PromptManager` / `AgentExecutor` / `LlmClient`）落地这些约束，避免数据泄露或危险操作。

- Skills（技能）声明 格式（最小字段）
  - 格式说明（JSON object / 文档化模板）：每个 skill 至少包含：
    - `name`：技能标识（字符串），例如 `sql_query_tool`。  
    - `description`：简短描述（字符串）。  
    - `input_schema`：输入参数 JSON Schema（描述必需字段与类型）。  
    - `output_schema`：输出结果 JSON Schema（便于 LLM 按结构返回）。  
    - `permissions`：权限/约束（例如 `read_only: true` / `allowed_tables: ["main_table_*"]`）。  
    - `callable_tools`：技能可调用的下级工具列表（若适用）。  
    - `example`：简短示例（调用示例 + 期望输出）。
  - 简短示例（文档化，不是代码块）：
    - `name`: "sql_query_tool"  
    - `description`: "在沙箱 DuckDB 中对用户上传的数据执行只读 SQL 查询并返回 rows + schema"  
    - `input_schema`: `{ query: string }`  
    - `output_schema`: `{ data: [{...}], schema: [{column_name:string,column_type:string}], row_count:number }`  
    - `permissions`: `{ read_only: true, allowed_tables: ["main_table_*"], max_rows: 500 }`  
    - `example`: `{"query":"SELECT name, price FROM main_table_1 WHERE price > 100 LIMIT 10"}`

- 强制约束（必读）
  1. 响应格式（必需）  
     - LLM 必须返回可解析的 JSON（或符合指定 `output_schema` 的结构），并包含标准字段，如 `action.tool`、`action.args`、`thought`（用于可审计的决策说明）。例如，最终应包含 `{"action":{"tool":"sql_query_tool","args":{...}},"thought":"...解释...","confidence":0.8}`。  
  2. Token / 长度限制  
     - 在 prompt 中对 LLM 明确约束最大 token 或最大字符长度，且在 `LlmClient` 层设置超时与最大 token（model-level）。文档中建议默认限制（例如：`max_tokens` 设定为模型上限的安全子集，视模型而定）。  
  3. 禁止行为（硬禁）  
     - 严禁尝试进行任意网络访问、外部 API 调用、系统命令执行或未授权的文件读写。LLM 在决策/响应中不得包含任何凭证或明确的密钥。  
  4. SQL 执行安全约束（强制）  
     - 默认只允许只读查询（SELECT）。对任何包含 `INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`/`CREATE`/`ATTACH`/`DETACH` 等关键字的 SQL，Agent 必须拒绝或要求二次确认并记录审计。  
     - 仅允许访问表白名单（例如仅以 `main_table_` 前缀命名的表）。  
     - 强制 `max_rows` 上限（例如 500），如果请求未包含 `LIMIT`，在执行前由 `AgentExecutor` 插入或拒绝。  
     - 建议在执行前做语法/安全预检（如简单关键字黑名单与表名白名单校验）。  
  5. 网络 / 文件系统访问约束  
     - Agent 在任何情况下不得允许 LLM 直接发起网络请求或访问宿主文件系统；所有需要外部数据的操作必须通过明确定义的工具（Tool）并经过审查。  
  6. 错误与确认策略  
     - 若 LLM 返回无法解析或不合规的 action（格式错误 / 非白名单表 / 非只读 SQL），`AgentExecutor` 必须：拒绝执行并返回可读的错误消息；对于模糊或潜在危险的请求，应回问用户二次确认（通过新增 prompt step）并记录原因。  
     - 建议在响应中包含 `thought`（Agent 推理）与 `confidence` 字段以便人工审查。

- 在代码中如何实现这些约束（高优先级建议与位置）
  1. `PromptManager`（文件：`src/services/llm/promptManager.ts`）  
     - 在构造 prompt 时把“强制约束”作为 system message 的一部分传给 LLM（例如：“严格返回 JSON，禁止访问网络或文件系统，SQL 只能为只读 SELECT，表白名单：main_table_*，若需要更高权限必须要求用户确认”）。  
     - 在向 LLM 提供工具能力时（tools / function schemas），确保传入的 `toolSchemas` 包含 `permissions`（如 read_only、allowed_tables、max_rows）以便模型选择时可见。  
     - 在模板中明确要求 LLM 返回 `action`、`args`、`thought` 字段并遵循 `output_schema`。  
  2. `AgentExecutor`（文件：`src/services/llm/agentExecutor.ts`）  
     - 在解析到 LLM 的工具调用前，先做“工具调用白名单”与“参数校验”（验证 `toolName` 在 `tools` 注册表中）。  
     - 对 SQL 类参数执行严格的预检：- 确认只含允许的关键词（通过关键字黑名单检测 DDL/DML）；- 校验所有表名是否匹配白名单模式（例如 /^main_table_/）；- 如果 `SELECT` 未包含 `LIMIT`，自动添加 `LIMIT {max_rows}` 或拒绝并要求说明。  
     - 若检测到高风险操作（非只读、访问非白名单表），不要直接执行，应返回错误或触发“需要用户确认”的流程（返回给前端一个明确的交互提示）。  
     - 在执行工具返回结果后，再做一次输出结构校验，确保符合 `output_schema`（否则视为失败并记录原始 LLM 内容用于审计）。  
     - 使用 `_sanitizeBigInts` 等现有工具对结果进行净化，保障前端序列化安全。  
  3. `LlmClient`（文件：`src/services/llm/llmClient.ts`）  
     - 在创建请求时设置合理的超时与 `max_tokens`（或模型限制参数），并支持 `AbortSignal` 用于用户取消。  
     - 将 `dangerouslyAllowBrowser`、`baseURL` 等敏感配置在文档中明确说明，并通过环境变量管理（`VITE_LLM_API_KEY` / `VITE_LLM_API_URL` / `VITE_LLM_MODEL_NAME` / `VITE_LLM_MOCK`）。  
  4. 额外建议（跨文件）  
     - 在 `src/services/tools/duckdbTools.ts` 的工具 schema 中补充 `permissions` 字段，并在 AgentExecutor 中读取并强制执行。  
     - 增加“预检/审计”钩子：每次 Agent 执行前后，把 LLM 原始响应、解析的 action、执行的 SQL（如有）、返回结果与时间戳写入日志/审计表（或前端可下载的审计文件）。  
     - 使用 `llmConfig.mockEnabled` 做开发环境回归测试与 E2E 测试（文档提示如何启用）。

- 建议的文档更新点（供开发者实际修改代码时参考）
  - `src/services/llm/promptManager.ts`：在 `getToolSelectionPrompt` 中注入“强制约束”system text；把 `tools` schema 权限以参数传入。  
  - `src/services/llm/agentExecutor.ts`：增加 `_preflightValidateToolCall(toolName, args)` helper（检查白名单、关键字、LIMIT、permissions），以及在解析 tool_call 后调用该函数。  
  - `src/services/llm/LlmClient.ts`：把 `chatCompletions` 调用中 `max_tokens`、`timeout` 的推荐位置与示例写在注释中，确保调用方可传 `signal` 取消请求。

五、Agent 执行流（详细）
- 1. 用户在 UI（ChatPanel）输入请求并提交（或选择 suggestion）。
- 2. Workbench 的 `handleStartAnalysis` 收集上下文（已上传的文件名列表、table 名称等），并确保 `AgentExecutor` 已就绪（依赖 isDBReady、executeQuery）。
- 3. `AgentExecutor.execute(userInput)`：
   - 调用 `_getAllTableSchemas()`：先查询 `information_schema.tables`（表名以 `main_table_%` 前缀），若为空则回退到 `DESCRIBE main_table`。
   - 使用 `PromptManager.getToolSelectionPrompt('ecommerce', userInput, allTableSchemas)` 构造 prompt。
   - 若 `llmConfig.mockEnabled` 为 true，则采用内置的 mock response；否则通过 `LlmClient.client.chat.completions.create({...})` 向 LLM 发起请求。
   - 解析 LLM 返回信息：优先读取 `message.tool_calls`（function 调用）；若没有，则尝试把 `message.content` 当做 JSON 来解析 action/tool 调用。
   - 根据解析到的工具调用（例如 `sql_query_tool`），从 `tools` 注册表中找到对应实现并调用（传入 `executeQuery` 与参数）。
   - 对工具返回结果做 BigInt 转字符串处理，最后把 `{ tool, params, result, thought }` 返回给调用方（Workbench）。

六、错误处理与常见问题
- LLM 错误
  - 401/403：检查 `VITE_LLM_API_KEY` 与 `VITE_LLM_API_URL`。
  - 超时/限流：检查 LlmClient 的超时/重试策略（当前客户端直接使用 `openai` 包，超时需在调用方外部管理）。
- Worker/ DuckDB 错误
  - DuckDB 初始化失败：查看 `src/workers/duckdb.worker.ts` 中的初始化日志（worker 会打印详细错误）。常见原因：bundle 资源 URL 不正确或 CORS 问题。
  - "Missing resources for DUCKDB_INIT"：说明前端没有正确传递 bundle 资源给 worker。检查 sandbox/iframe（`src/components/layout/Sandbox.tsx` 或负责注入资源的代码）。
  - 文件加载失败（LOAD_FILE）：确认 `fileName`, `buffer`, `tableName` 都已被发送。
  - BigInt 序列化问题：AgentExecutor 提供了 `_sanitizeBigInts`，会把 BigInt 转为字符串以避免 JSON 序列化错误。
- 类型/构建错误
  - 若遇到 TS 类型错误或编译失败：检查 `tsconfig.json` 与 `vite.config.ts` 中 worker/alias 设置（例如 `apache-arrow` 的别名）。

七、扩展点（如何添加 prompt / tool / worker）
- 添加新的 prompt
  1. 在 `src/prompts/` 下新建文件，例如 `finance.ts`，导出符合 `PromptTemplate` 结构（system_prompt, tool_selection_prompt_template, suggestions）。
  2. 在 `src/services/llm/promptManager.ts` 中把新的 prompt 集合注册到 `promptSets`。
  3. 在 UI 或 AgentExecutor 中以 role 名称调用 `PromptManager.getToolSelectionPrompt('finance', userInput, tableSchema)`。

- 添加新的 tool（示例：CSVImportTool）
  1. 在 `src/services/tools/` 新建 `CSVImportTool.ts`，实现类似 `sql_query_tool` 的函数签名（`(executeQuery, params) => Promise<any>`）。
  2. 在 `src/services/tools/duckdbTools.ts` 中把该工具添加到 `tools` 注册表，并在 `toolSchemas` 中补充 JSON Schema（供 LLM 在构造 prompts 时了解工具参数）。
  3. 若该工具需要在 worker 中处理（例如大文件解析），则实现 `src/workers/csv.worker.ts` 并在前端通过 `useWorker` 或相应的 loader 调用，并在 worker/主线程间定义好消息协议（类似 `LOAD_FILE` / `DUCKDB_EXECUTE_QUERY`）。
  4. 在 `AgentExecutor` 中无需修改主要逻辑（只要工具已在注册表中），LLM 只需返回 action 指定新的 tool 名称。

八、调试建议与排查流程
- 开发时先启用 mock：设置 env VITE_LLM_MOCK=true 可避免频繁调用真实 LLM 并便于调试 tool 调用解析路径。
- Worker 调试：在 `src/workers/duckdb.worker.ts` 中已有 console.log（例如 '[DB Worker] ...'），在浏览器 DevTools -> Workers 中查看日志与消息交互。
- 捕获 Agent 决策点日志：在 `AgentExecutor` 中关键点（构造 prompt、收到 LLM 响应、解析 tool_call、调用工具前后）都有 console.log，可据此定位问题。
- 复现步骤：准备一个小 CSV（含少量行），上传到 UI，使用一个预设问题（见 `src/prompts/ecommerce.ts` 中 suggestions），观察 Workbench、Worker 和 Network 面板的交互。

九、快速示例
- 启动开发环境并开启 mock：
  1. 在 shell 中设置环境变量（macOS / zsh 示例）并运行 dev：
     - export VITE_LLM_MOCK=true
     - export VITE_LLM_API_KEY="<your-key>"
     - npm run dev

- 新增 Prompt（概要）
  - 文件：`src/prompts/finance.ts`
  - 在 `PromptManager` 注册： promptSets['finance'] = financePrompts
  - 使用：AgentExecutor/Workbench 调用 `getToolSelectionPrompt('finance', userInput, tableSchema)`。

十、参考文件列表（仓库中关键文件）
- package.json
- vite.config.ts
- src/hooks/useLLMAgent.ts
- src/hooks/useDuckDB.ts
- src/hooks/useFileParsing.ts
- src/services/llm/LlmClient.ts
- src/services/llm/promptManager.ts
- src/services/llm/agentExecutor.ts
- src/services/tools/duckdbTools.ts
- src/services/duckDBService.ts
- src/workers/duckdb.worker.ts
- src/pages/workbench/index.tsx
- src/pages/workbench/components/ChatPanel.tsx
- src/prompts/ecommerce.ts