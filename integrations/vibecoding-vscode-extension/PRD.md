# PRD

## Problem
- 现有 `run-vibecoding-loop.py` 已能作为外部 session driver 读取 `memory.md`、检查 `session_gate`、准备 fresh session handoff，但使用入口仍偏脚本化。
- 实际使用时，用户需要在 IDE、终端、`memory.md`、`startup-prompt.md`、`session-N-prompt.md` 之间手动切换，容易出现以下问题：
- 跳过 `startup-prompt.md`，直接进入某个 `session-N-prompt.md`
- 在旧对话上下文里继续推进，而不是结束后重开 fresh session
- 把“聊天窗口记忆”当成状态来源，而不是以 `memory.md` 为准
- 手动执行脚本时不清楚当前 `next_session`、`session_gate`、`last_completed_session_tests`

## Goal
- 提供一个 VS Code 插件作为 workflow 的 IDE 外壳，降低 fresh-session workflow 的操作成本。
- 把“检查当前状态、打开关键文件、调用 Python driver、展示结果”集中到 IDE 内完成。
- 明确强化以下架构原则：
- 插件不是状态机真相源
- `memory.md` 才是唯一状态源
- 插件不能绕过 `startup-prompt.md` 和 `memory.md` 自己决定 next session
- 推荐架构是 `Python core + VS Code UI shell`

## Target User
- 已经采用 vibecodingworkflow 的开发者
- 需要在一个项目中持续执行 `startup -> memory -> session` 循环的 AI-assisted developer
- 希望减少流程遗漏，但不希望把 orchestration logic 重写到插件内的用户

## Product Positioning
- 这是一个 workflow control surface，不是新的 workflow engine。
- 这是一个 session launch assistant，不是聊天产品自动驾驶器。
- 这是一个开发辅助插件，不替代 Python 调度器本体。

## User Value
- 更快看清当前 Session 状态
- 更少流程性错误
- 更低的上下文切换成本
- 更容易把 workflow 标准化给团队成员复用

## Core Principles
- 所有 session 推进判断都以 `memory.md` 为准。
- 所有 fresh session 启动都必须经过 `startup-prompt.md`。
- 插件只展示和转发 orchestration 结果，不持有独立推进逻辑。
- Python 脚本继续作为核心 orchestration engine。

## Scope Summary
- 插件负责：
- 命令入口
- 状态展示
- 文件打开
- 调用 Python 脚本
- 展示 Python 结果

- Python 负责：
- 读取 `memory.md`
- 判断是否允许推进
- 给出 `next_session` 和 `next_session_prompt`
- 记录 loop log
- 输出稳定的 machine-readable result

## MVP Functional Requirements
- 识别当前 workspace 是否为合法 vibecoding workflow 项目
- 展示当前 `last_completed_session`、`last_completed_session_tests`、`next_session`、`session_gate`
- 一键打开 `memory.md`
- 一键打开 `startup-prompt.md`
- 一键打开 `next_session_prompt`
- 执行 “Refresh Workflow Status”
- 执行 “Prepare Fresh Session”
- 在 VS Code integrated terminal 中启动 Python driver 或 runner command
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
- 当 `session_gate != ready` 时，插件不会给出“继续下一 Session”的误导动作。
- 当 workflow 可推进时，插件引导用户打开 `startup-prompt.md`，而不是直接跳过标准入口。
- 插件展示的状态字段与 Python driver 基于 `memory.md` 的结果一致。
- 插件本地即使清空缓存，也不会影响 workflow 真正状态。

## Success Metrics
- 用户完成一次 fresh-session handoff 所需手动步骤减少
- 因跳过 `startup-prompt.md` 或误判 `next_session` 造成的流程错误减少
- 新用户能够仅通过插件入口理解当前 workflow 所处阶段

## Current Delivery Status
- Session 0 到 Session 10 已完成。
- 当前源码已具备：
- workflow 项目探测
- `inspect --json` 状态刷新
- `prepare --json` fresh-session 准备
- 打开 `memory.md`、`startup-prompt.md`、`next_session_prompt`
- integrated terminal 启动 runner
- loop log 打开
- 状态栏摘要
- 统一错误态 UX
- Session 8 smoke 联调报告
- Session 9 回归报告
- Session 11 真实场景联调报告
- Session 10 文档收尾报告
- 2026-03-12 compile + smoke + regression + real scenario 通过记录
- 2026-03-12 三个 Node 集成脚本 teardown 已补齐，脚本在写出报告后可自行退出

- 当前仍未完成：
- 真机 VS Code Extension Host 回归记录
- 多种异常样例的系统回归矩阵
- 正式 VSIX 打包与发布流程
