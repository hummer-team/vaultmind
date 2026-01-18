# Vaultmind

Vaultmind is an **agent‑driven analytics workbench** for business users and data teams.  
It connects to your structured data (e.g. Excel / CSV, data warehouses), lets you describe *what you want* in natural language, and delegates the work to specialized AI agents that understand your role, your data and your metrics.

---

## Business Value

- **For business users**  
  Ask questions like “Compare Q4 revenue vs. Q3 by region and highlight outliers” and get:
  - A clear narrative answer
  - Supporting tables / charts
  - Reproducible analysis steps

- **For data teams**  
  Encode domain know‑how (metrics, dimensions, guardrails) into **personas / agents** so analytics stays:
  - Correct and consistent
  - Auditable and observable
  - Easy to reuse across teams

- **For organizations**
  - Reduce ad‑hoc dashboard requests
  - Standardize metrics & semantics
  - Speed up decision‑making with trustworthy AI copilots

---

## Key Features

### 1. Agent & Persona System

- **Role‑aware personas** (e.g. *Business Analyst*, *Finance Manager*, *Growth PM*).
- Each persona has:
  - Domain expertise and vocabulary
  - Preferred analysis patterns and frameworks
  - Configurable risk / safety constraints
- Persona selection surfaces as a **persona badge** in the chat panel and drives how queries are interpreted and answered.

### 2. Natural‑Language Analytics

- Ask questions in plain English or Chinese; Vaultmind:
  - Parses intent and constraints
  - Plans multi‑step analysis
  - Executes queries / transformations on top of your data
  - Returns **reasoned, step‑by‑step answers**

- Support for:
  - Exploratory analysis (“What changed last month?”)
  - Hypothesis‑driven analysis (“Is churn correlated with price increases?”)
  - Explanation and QA on top of existing reports.

### 3. File‑Based Data Ingestion

- Upload **Excel / CSV** files directly from the chat UI:
  - Multiple sheets per workbook
  - Up to large file sizes (logical limit: ~1 GB per file, depending on backend settings)
- Automatic grouping of attachments:
  - Each file can contain multiple sheet loads
  - Clear visual status: *uploading / success / error*
  - Per‑sheet metadata and errors surfaced as tags & tooltips in the chat panel.

### 4. Guided Prompts & Suggestions

- **Prompt suggestions** based on:
  - Recent history
  - Selected persona
  - Dataset characteristics
- One‑click tags in the chat panel to quickly start common analyses.
- Inline persona hint text to remind users what kind of questions are best suited for the current role.

### 5. Execution Engine & Tools (Conceptual)

> This section is a high‑level summary of the agent engine described in `agent.md`.

- **Multi‑tool agent architecture**:
  - SQL / dataframe query tools
  - Data transformation & cleaning tools
  - Chart / visualization tools
  - Explanation / documentation tools
- **Planning & refinement** loop:
  - Draft a plan
  - Execute tool calls
  - Inspect intermediate results
  - Refine until a satisfactory answer is produced
- **Observability**:
  - Structured traces for each conversation turn
  - Tool call logs, parameters and results
  - Easy debugging for mis‑analysis.

### 6. Guardrails & Safety

- Configurable guardrails per persona:
  - What data sources can be accessed
  - Which tools are allowed
  - Sensitivity levels and redaction rules
- Optional review or approval flows for sensitive actions.

---

## Architecture & Tech Stack

### Frontend

- **React + TypeScript**
- **Ant Design (antd)** UI components:
  - `Form`, `Input.TextArea`, `Upload`, `Tag`, `Tooltip`, `Spin`, etc.
- Custom persona UX components:
  - Persona badge with pulse animation when unset
  - Inline persona hints
  - File attachment grouping & error display

The `ChatPanel` is the main user entry point:
- Binds the text input form to external state (`initialMessage`, `setInitialMessage`)
- Handles:
  - Message submission
  - Keyboard shortcuts (Ctrl / Cmd + Enter)
  - File uploads and attachment management
  - Error display
  - Scroll‑to‑bottom floating button
  - Persona badge click to open persona setup

### Backend (Conceptual)

Depending on your deployment, Vaultmind can be backed by:

- A **model‑orchestration layer** (e.g. LangChain, custom agent framework)
- One or more **LLM providers**
- **Data connectors** for:
  - Local file storage
  - Data warehouses (Snowflake, BigQuery, etc.)
  - Internal APIs
- A **task / tool routing** layer that:
  - Maps natural language requests to tools
  - Tracks intermediate state
  - Controls retries, timeouts and safety rules

Implementation details may vary, but the `agent.md` design expects:
- A central **Agent Orchestrator**
- Pluggable **tools** with strongly typed interfaces
- Unified **logging & tracing** for all agent runs.

---

## Getting Started

### Prerequisites

- bun (LTS version recommended)
- bun run build
- Access to a configured backend agent service and model provider

### Install Dependencies

## License

Vaultmind is licensed under the **Apache License 2.0**.

You may use this project in commercial and non‑commercial products under the terms of the Apache‑2.0 license.  
See the [`LICENSE`](./LICENSE) file for the full text.

