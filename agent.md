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
    - `src/services/llm/LLMClient.ts`：LLM API 客户端（目前使用官方 `openai` npm 包）。
    - `src/services/llm/PromptManager.ts`：管理 prompt 模板与构建完整的 prompt 文本。
    - `src/services/llm/AgentExecutor.ts`：Agent 的执行器——负责：获取表结构、构建 prompt、调用 LLM、解析 LLM 响应并调用工具。 
  - Tools：`src/services/tools/DuckdbTools.ts`（当前仅 `sql_query_tool`，负责执行 SQL 并返回结果）。
  - Worker：`src/workers/duckdb.worker.ts`（DuckDB WASM worker，负责初始化 DuckDB、加载文件缓冲区、执行 SQL）。
  - 其他：`src/services/DuckDBService.ts`（在 worker/主线程间封装 DuckDB 操作），`src/services/SettingsService.ts`、`src/services/StorageService.ts`、`src/status/AppStatusManager.ts` 等。

三、关键文件与职责（逐项）
- Hooks
  - `src/hooks/useLLMAgent.ts`：项目中暴露给组件的 Agent hook（目前是占位/封装层，具体逻辑在 `AgentExecutor`）。
  - `src/hooks/useDuckDB.ts`：封装 DuckDB 初始化、表创建、executeQuery、dropTable 等逻辑（Workbench 通过它与 DB 交互）。
  - `src/hooks/useFileParsing.ts`：负责把用户上传的文件读取为 buffer，并通过 sandbox/iframe 把文件注册到 DuckDB（见 `loadFileInDuckDB`）。

- LLM 相关服务
  - `src/services/llm/LLMClient.ts`
    - 使用 `openai` 官方客户端构建 LLM 客户端实例。
    - 类型：LLMConfig (provider, apiKey, baseURL, modelName, mockEnabled?)。
    - 注意：构造时会把 apiKey、baseURL 带入；浏览器模式允许 dangerouslyAllowBrowser。
  - `src/services/llm/PromptManager.ts`
    - 管理不同角色/场景的 prompt 集合，目前导入了 `src/prompts/ecommerce.ts`。
    - 提供 `getToolSelectionPrompt(role, userInput, tableSchema)` 生成完整 prompt（会将 tableSchema JSON.stringify 后嵌入模板）。
  - `src/services/llm/AgentExecutor.ts`
    - Agent 的核心：
      - 通过 `executeQuery`（注入函数，来自 useDuckDB）读取数据库表名与 schema（会尝试查询 `information_schema.tables` 或回退到 `DESCRIBE main_table`）。
      - 通过 PromptManager 构造 LLM 输入（role 固定为 'ecommerce' 在当前实现中）。
      - 调用 LLMClient（若 `llmConfig.mockEnabled` 为 true，则会返回一个 mock 响应用于调试）。
      - 解析 LLM 返回：支持 LLM 的 function/tool 调用（tool_calls / message.content 中嵌入的 JSON），并将对应工具从 `services/tools` 注册表中调用。
      - 对 DuckDB 返回的大整数（BigInt）进行字符串化处理 `_sanitizeBigInts`，以便 JSON 序列化与前端显示。

- Tools
  - `src/services/tools/DuckdbTools.ts`
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
  - Bun（建议 LTS）。
  - bun（仓库使用 package.json 脚本。
  - 浏览器：支持 Web Worker 与 WebAssembly。

- 常用命令（见 `package.json`）
  - 开发：bun run dev （运行 Vite 开发服务器）
  - 构建：bun run build （先 tsc 再 vite build）
  - 预览：bun run preview
  - lint：bun run lint

- 环境变量（在项目中被读取）
  - VITE_LLM_PROVIDER — LLM 提供者标识（例如 'openai' 等）。
  - VITE_LLM_API_KEY — LLM API Key。
  - VITE_LLM_API_URL — LLM API 基础 URL（如果使用自托管或代理）。
  - VITE_LLM_MODEL_NAME — 要使用的模型名称。
  - VITE_LLM_MOCK — 'true' 启用 AgentExecutor 的 mock 模式（在开发/调试时非常有用）。
  - 备注：Workbench 中有一处 MAX_FILES 的读取使用了 `import.meta.env.VITE_LLM_PROVIDER as number || 1`，这是项目中非直观的实现（应为 VITE_MAX_FILES 或类似环境变量）。当前默认允许 1 个文件。

五、Agent 执行流（详细）
1. 用户在 UI（ChatPanel）输入请求并提交（或选择 suggestion）。
2. Workbench 的 `handleStartAnalysis` 收集上下文（已上传的文件名列表、table 名称等），并确保 `AgentExecutor` 已就绪（依赖 isDBReady、executeQuery）。
3. `AgentExecutor.execute(userInput)`：
   - 调用 `_getAllTableSchemas()`：先查询 `information_schema.tables`（表名以 `main_table_%` 前缀），若为空则回退到 `DESCRIBE main_table`。
   - 使用 `PromptManager.getToolSelectionPrompt('ecommerce', userInput, allTableSchemas)` 构造 prompt。
   - 若 `llmConfig.mockEnabled` 为 true，则采用内置的 mock response；否则通过 `LLMClient.client.chat.completions.create({...})` 向 LLM 发起请求。
   - 解析 LLM 返回信息：优先读取 `message.tool_calls`（function 调用）；若没有，则尝试把 `message.content` 当做 JSON 来解析 action/tool 调用。
   - 根据解析到的工具调用（例如 `sql_query_tool`），从 `tools` 注册表中找到对应实现并调用（传入 `executeQuery` 与参数）。
   - 对工具返回结果做 BigInt 转字符串处理，最后把 `{ tool, params, result, thought }` 返回给调用方（Workbench）。

六、错误处理与常见问题
- LLM 错误
  - 401/403：检查 `VITE_LLM_API_KEY` 与 `VITE_LLM_API_URL`。
  - 超时/限流：检查 LLMClient 的超时/重试策略（当前客户端直接使用 `openai` 包，超时需在调用方外部管理）。
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
  2. 在 `src/services/llm/PromptManager.ts` 中把新的 prompt 集合注册到 `promptSets`。
  3. 在 UI 或 AgentExecutor 中以 role 名称调用 `PromptManager.getToolSelectionPrompt('finance', userInput, tableSchema)`。

- 添加新的 tool（示例：CSVImportTool）
  1. 在 `src/services/tools/` 新建 `CSVImportTool.ts`，实现类似 `sql_query_tool` 的函数签名（`(executeQuery, params) => Promise<any>`）。
  2. 在 `src/services/tools/DuckdbTools.ts` 中把该工具添加到 `tools` 注册表，并在 `toolSchemas` 中补充 JSON Schema（供 LLM 在构造 prompts 时了解工具参数）。
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
  2. 打开 http://localhost:5173，进入 Workbench，上传示例 CSV，输入示例建议并提交。

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
- src/services/llm/LLMClient.ts
- src/services/llm/PromptManager.ts
- src/services/llm/AgentExecutor.ts
- src/services/tools/DuckdbTools.ts
- src/services/DuckDBService.ts
- src/workers/duckdb.worker.ts
- src/pages/workbench/index.tsx
- src/pages/workbench/components/ChatPanel.tsx
- src/prompts/ecommerce.ts

十一、下一步建议（可选）
- 把 `useLLMAgent` 填充为对外稳定的 API：start/stop/streaming 支持、事件回调、类型定义。
- 为 AgentExecutor 添加更完善的工具注册机制（可热插拔工具插件）。
- 增加单元/集成测试：模拟 LLMClient（mockEnabled）与 DuckDB worker（stub executeQuery）做端到端测试。