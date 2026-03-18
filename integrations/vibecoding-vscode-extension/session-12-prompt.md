# Session 12 Prompt

> 2026-03-17 归档说明：本文件保留的是一版 LangGraph 接入草稿。其中关于 `pending_review` 的描述不再代表当前基线契约；当前实现以 `ready / blocked / in_progress / done` 为准。
>
> 2026-03-17 真实运行时补充：
> - 本机 `langgraph-api 0.7.71` 没有 `POST /threads/{thread_id}/runs/{run_id}/resume`
> - 当前兼容 resume 真实路径是 `POST /threads/{thread_id}/runs` + `command.resume`，且请求体需要显式 `assistant_id: "vibecoding_workflow"`
> - review wait 不能只看 `runs.status=interrupted`，应优先看 `GET /threads/{thread_id}/state` 中 `tasks[*].interrupts`
> - 单次 `POST /runs` / 单次 resumed run 只推进一个 session，不自动连续跑下一 session

工作目录：/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow

本次是 Session 12，目标是将 VSCode Extension 的 driver 层从调 Python CLI 切换到调 LangGraph Local Server HTTP API。

---

## 必须先读的上下文文件（按顺序）

1. `plans/langgraph-integration-plan.md` — 架构决策（重点看十一、十二节）
2. `integrations/vibecoding-vscode-extension/design.md` — 系统设计（重点看 Driver Layer、Flow D）
3. `integrations/vibecoding-vscode-extension/interfaces/langgraph-runtime-contract.md` — LangGraph HTTP API 合约
4. `integrations/vibecoding-vscode-extension/interfaces/python-driver-contract.md` — 现有 Python driver 合约（参考，不修改）
5. `src/vibecoding_langgraph/graph.py` — Session 11 实现的 8 节点图（了解 state 结构）
6. `integrations/vibecoding-vscode-extension/vscode-ext/src/driver/` — 现有 driver 层代码（需改造）
7. `artifacts/session-11-summary.md` — Session 11 完成内容（上下文）

---

## 本 Session 目标

将 VSCode Extension driver 层从 Python CLI wrapper 迁移到 LangGraph HTTP API wrapper，实现完整的状态读取、执行触发、HITL resume 流程。

---

## 执行范围（In Scope）

1. **新增 LangGraph driver 模块**
   - `vscode-ext/src/driver/langgraph-driver.ts`
   - 实现 `GET /threads/{thread_id}/state` — 读取 workflow 状态
   - 实现 `POST /threads/{thread_id}/runs` — 触发执行
   - 实现 `POST /threads/{thread_id}/runs/{run_id}/resume` — HITL resume
   - `thread_id = sha1(project_root + ":" + task_identifier)`

2. **新增 LangGraph server 存活检查**
   - Extension 激活时检查 `GET http://localhost:2024/ok`（或 health endpoint）
   - 若 server 不在线，显示提示并引导用户运行 `langgraph dev`
   - 过渡期：server 不在线时降级到 Python driver fallback

3. **新增命令**
   - `VibeCoding: Configure LangGraph Server URL`
   - 配置项：`vibecoding.langgraphServerUrl`（默认 `http://localhost:2024`）

4. **新增 `pending_review` 状态展示**
   - 状态栏显示 `Vibe: SN | pending_review`
   - 展示审批动作：approve / reject
   - 调用 resume API 传递决策

5. **driver 层切换逻辑**
   - 优先使用 LangGraph driver（server 在线时）
   - fallback 到 Python driver（server 不在线时）
   - 切换逻辑在 `vscode-ext/src/driver/index.ts` 或等价入口

6. **状态映射**
   - LangGraph `WorkflowRuntimeState` → Extension 现有 `WorkflowStatus` 结构
   - `session_gate: ready/blocked/done/in_progress` 映射不变
   - 新增 `pending_review` 映射（来自 LangGraph interrupt 状态）

---

## 执行范围（Out of Scope）

- 不修改 `src/vibecoding_langgraph/graph.py`（Session 11 产出，不动）
- 不修改 `memory.md` schema
- 不修改 Python driver（冻结，仅作 fallback）
- 不实现 LangGraph server 自动启动（只提示，不管理生命周期）
- 不做 VSIX 打包（Session 13 的工作）

---

## 关键设计约束

1. **thread_id 计算**：`sha1(project_root + ":" + task_identifier)`，与 `langgraph-runtime-contract.md` 一致
2. **降级策略**：LangGraph server 不在线时，静默降级到 Python driver，不报错阻断用户
3. **状态字段优先级**：优先消费 LangGraph API 返回的状态，不自行解析 markdown
4. **HITL 流程**：`pending_review` 状态下，插件必须展示 approve/reject 动作，不能自动推进

---

## 验证 Gate（本 Session 必须通过）

1. `npm run compile`（或等价构建命令）成功，无 TypeScript 错误
2. LangGraph server 在线时，`Refresh Workflow Status` 调用 LangGraph API 而非 Python CLI
3. LangGraph server 不在线时，自动降级到 Python driver，状态栏正常显示
4. `VibeCoding: Configure LangGraph Server URL` 命令可用，能修改 server URL
5. `pending_review` 状态在状态栏正确显示，approve/reject 动作可触发

---

## 产出要求

- 改造后的 `vscode-ext/src/driver/langgraph-driver.ts`（新文件）
- 更新的 `vscode-ext/src/driver/index.ts`（切换逻辑）
- 更新的 `vscode-ext/package.json`（新增配置项和命令）
- 写 `artifacts/session-12-summary.md`（人类可读）
- 写 `artifacts/session-12-manifest.json`（机器可验证）

## memory 更新

Session 完成后更新 `work-plan.md`：
- Session 12 状态改为 `completed`
- Current Summary 更新 `last_completed_session: 12`、`next_session: 13`、`session_gate: ready`

## 完成策略

- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新进入
