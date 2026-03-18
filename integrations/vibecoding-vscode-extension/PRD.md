# PRD

## Problem
- 历史上的 `run-vibecoding-loop.py` 外部 session driver 曾验证过 workflow UI shell 方向，但它是手写的简化版状态机，本质上重复了 LangGraph 已解决的编排问题（状态路由、暂停恢复、持久化），缺少 checkpoint、interrupt/resume、durable execution 等能力。
- 实际使用时，用户需要在 IDE、终端、`memory.md`、`startup-prompt.md`、`session-N-prompt.md` 之间手动切换，容易出现以下问题：
- 跳过 `startup-prompt.md`，直接进入某个 `session-N-prompt.md`
- 在旧对话上下文里继续推进，而不是结束后重开 fresh session
- 把"聊天窗口记忆"当成状态来源，而不是以 `memory.md` 为准
- 手动执行脚本时不清楚当前 `next_session`、`session_gate`、`last_completed_session_tests`

## Goal
- 提供一个 VS Code 插件作为 workflow 的 IDE 外壳，降低 fresh-session workflow 的操作成本。
- 把"检查当前状态、打开关键文件、触发 LangGraph 执行、展示结果"集中到 IDE 内完成。
- 明确强化以下架构原则：
- 插件不是状态机真相源
- `memory.md` 才是唯一业务状态源
- 插件不能绕过 `startup-prompt.md` 和 `memory.md` 自己决定 next session
- 推荐架构是 `LangGraph Local Server（执行运行时）+ VS Code UI shell`
- 历史 Python driver 已归档，不再作为推荐 fallback 路径继续演进

## Target User
- 已经采用 vibecodingworkflow 的开发者
- 需要在一个项目中持续执行 `startup -> memory -> session` 循环的 AI-assisted developer
- 希望减少流程遗漏，但不希望把 orchestration logic 重写到插件内的用户

## Product Positioning
- 这是一个 workflow control surface，不是新的 workflow engine。
- 这是一个 session launch assistant，不是聊天产品自动驾驶器。
- 这是一个开发辅助插件，执行运行时由 LangGraph Local Server 承担。

## User Value
- 更快看清当前 Session 状态
- 更少流程性错误
- 更低的上下文切换成本
- LangGraph 提供 checkpoint/HITL/durable execution，workflow 可跨天续跑、审批暂停
- 更容易把 workflow 标准化给团队成员复用

## Core Principles
- 所有 session 推进判断都以 `memory.md` 为准。
- 所有 fresh session 启动都必须经过 `startup-prompt.md`。
- 插件只展示和转发 orchestration 结果，不持有独立推进逻辑。
- LangGraph Local Server 作为核心执行运行时，替代 Python 脚本手写调度器。

## Scope Summary
- 插件负责：
- 命令入口
- 状态展示
- 文件打开
- 调用 LangGraph Local Server HTTP API
- 展示执行结果
- LangGraph 离线时，对 approve / reject 保留最小化 `memory.md` 兼容写回

- LangGraph Local Server 负责：
- 读取 `memory.md`
- 判断是否允许推进（`session_gate`）
- 节点编排：load_workflow_state → select_session → build_runner_input → review_gate → run_session_task → collect_outputs → persist_workflow_files → route_next
- checkpoint / interrupt / resume
- 调 Claude Code / Codex CLI（subprocess）
- 写 summary / manifest / 更新 `memory.md`
- 输出稳定的 machine-readable result

## MVP Functional Requirements
- 识别当前 workspace 是否为合法 vibecoding workflow 项目
- 展示当前 `last_completed_session`、`last_completed_session_tests`、`next_session`、`session_gate`
- 一键打开 `memory.md`
- 一键打开 `startup-prompt.md`
- 一键打开 `next_session_prompt`
- 执行 "Refresh Workflow Status"
- 执行 "Prepare Fresh Session"
- 触发 LangGraph 执行（迁移后）/ 在 VS Code integrated terminal 中启动 runner（过渡期）
- 展示 `ready` / `blocked` / `done` 三类状态
- 展示最近一次调用结果和错误信息

## Non-Goals
- 不在插件内重写 `memory.md` 解析规则作为主逻辑
- 不在插件内自行维护 next session 状态机
- 不直接接管聊天客户端或自动操纵第三方 AI UI
- 不在 MVP 内实现自动修改 `memory.md`
- 不做多项目看板、远程协同、云同步
- 不做完整 session transcript 管理

## Acceptance Criteria
- 用户打开工作区后，能在 10 秒内看清当前 `session_gate` 与 `next_session`。
- 当 `session_gate != ready` 时，插件不会给出"继续下一 Session"的误导动作。
- 当 workflow 可推进时，插件引导用户打开 `startup-prompt.md`，而不是直接跳过标准入口。
- 插件展示的状态字段与 LangGraph 基于 `memory.md` 的结果一致。
- 插件本地即使清空缓存，也不会影响 workflow 真正状态。

## Success Metrics
- 用户完成一次 fresh-session handoff 所需手动步骤减少
- 因跳过 `startup-prompt.md` 或误判 `next_session` 造成的流程错误减少
- 新用户能够仅通过插件入口理解当前 workflow 所处阶段
- workflow 支持跨天续跑、审批暂停（由 LangGraph checkpoint/HITL 保障）

## Current Delivery Status

### 已完成（当前基线）
- workflow 项目探测、Dashboard、状态栏、文件打开动作
- LangGraph 执行图实现（8 个核心节点）
- VS Code extension driver 层切换到 LangGraph HTTP API
- LangGraph daemon 探测、Studio deep-link、thread/run 上下文展示
- HITL approve / reject 主路径与 `command.resume` 兼容回退
- Session Runtime Inspector / LangGraph Manager 双面板
- `pythonDriver.ts` 删除，`run-vibecoding-loop.py` 归档
- 2026-03-17 已通过 compile、Session 8 smoke、Session 9 regression、Session 11 real scenario、Session 12 LangGraph HITL、Session 13 cold resume / offline / dashboard 回归

### 尚待补齐
- 真机 VS Code Extension Host 手工回归记录
- 正式 VSIX 打包与发布流程
