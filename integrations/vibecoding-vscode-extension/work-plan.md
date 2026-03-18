# work-plan

# work-plan

> 2026-03-17 当前说明：本文件前半段对 Session 0-10 的记录保留了早期 “Python core + VS Code UI shell” 的历史叙事；自 Session 11 起，当前实现基线已经切换为 LangGraph Local Server。阅读本文件时，请以 Session 11+、`design.md`、`README.md` 与 `interfaces/langgraph-runtime-contract.md` 为当前设计口径。

## Session 0
- 落 `PRD.md`
- 落 `design.md`
- 落 `work-plan.md`
- 落 Session 0 方案稿
- 明确 Python core + VS Code UI shell 架构
- 明确 `memory.md` 是唯一状态源
- 状态：completed

## Session 1
- 创建 VS Code extension skeleton
- 定义 `package.json` 基础命令与配置项
- 不接入复杂 UI
- 状态：completed

## Session 2
- 为 `run-vibecoding-loop.py` 增加稳定 JSON 输出模式
- 定义 driver result schema
- 定义错误码与异常输出策略
- 状态：completed

## Session 3
- 实现 workflow project detection
- 实现 `Refresh Workflow Status`
- 打通插件到 Python inspect mode 的调用链
- 状态：completed

## Session 4
- 实现 `Open Memory`
- 实现 `Open Startup Prompt`
- 实现 `Open Next Session Prompt`
- 规范文件缺失时的提示
- 状态：completed

## Session 5
- 实现 `Prepare Fresh Session`
- 实现 `Start Runner In Terminal`
- 支持 runner command template 配置
- 状态：completed

## Session 6
- 实现状态栏展示
- 实现 output channel 结果回显
- 补充 `ready` / `blocked` / `done` 视觉状态
- 状态：completed

## Session 7
- 补齐异常路径
- 处理 Python 不存在、脚本失败、JSON 不合法、workflow 文件缺失
- 确保插件不会在异常状态下误导推进
- 状态：completed

## Session 8
- 使用真实 vibecoding workflow 项目做联调
- 验证 fresh-session handoff 路径
- 验证 loop log 可追踪
- 状态：completed
- 证据：
- `fixtures/session8-smoke-project/`
- `artifacts/session8-smoke-report.json`

## Session 9
- 真实环境验证
- 覆盖不同 Python 路径、不同 runner 模板、不同 workflow 状态
- 补回归检查清单
- 状态：completed
- 证据：
- `vscode-ext/scripts/session9_regression.js`
- `artifacts/session9-regression-report.json`

## Session 10
- 完成 README 与使用说明
- 补发布前检查
- 收尾文档与后续演进建议
- 状态：completed
- 证据：
- `README.md`
- `vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md`
- `vscode-ext/package.json`
- `npm run compile`
- `npm run smoke:session8`
- `npm run regression:session9`
- `artifacts/session10-closeout-report.md`

---

## 架构决策（2026-03-16）

Session 0–10 基于 Python driver 架构已完成。

**决策**：以 LangGraph Local Server 替代 `run-vibecoding-loop.py` 作为执行运行时。

原因：
- `run-vibecoding-loop.py` 是手写的简化版状态机，重复了 LangGraph 已解决的问题
- LangGraph 提供 checkpoint / HITL interrupt / durable execution，覆盖本项目核心需求
- session 状态机可 1:1 映射为 LangGraph 节点图
- 现有 driver 逻辑可直接移植为节点函数，无需从零重写

参见：`plans/langgraph-direct-integration-evaluation.md`

---

## Session 11（LangGraph 迁移 Phase 1）
- 实现 LangGraph 执行图 8 个核心节点：
  - `load_workflow_state`
  - `select_session`
  - `build_runner_input`
  - `review_gate` + `interrupt()`
  - `run_session_task`（subprocess，幂等）
  - `collect_outputs`
  - `persist_workflow_files`（幂等写 memory.md）
  - `route_next`
- 补充 `pyproject.toml` LangGraph 依赖
- 与 Python driver 并行验证结果一致性
- 状态：completed（2026-03-16）

## Session 12（LangGraph 迁移 Phase 2：Extension 接入）
- VSCode Extension driver 层切换到 LangGraph HTTP API
- 实现 `GET /threads/{thread_id}/state` 状态读取
- 实现 `POST /threads/{thread_id}/runs` 触发执行
- 实现 HITL resume 流程（approve / reject）
- 保持 `ready / blocked / in_progress / done` 业务 gate，不新增 `pending_review` 持久态
- 新增 `VibeCoding: Configure LangGraph Server URL` 命令
- 新增 LangGraph server 存活检查与提示
- 状态：completed（2026-03-17）
- 2026-03-17 已确认的真实运行时约束：
- `langgraph-api 0.7.71` 无 `POST /threads/{thread_id}/runs/{run_id}/resume`
- 当前本机兼容路径为 `POST /threads/{thread_id}/runs` + `command.resume`，且请求体需要显式 `assistant_id`
- review wait 不能只看 `GET /threads/{thread_id}/runs/{run_id}` 的 `status`，也不能只看裸 `state.next`
- 当前可靠判据是 `GET /threads/{thread_id}/state` 中 `tasks[*].interrupts` 非空
- approve 后单次 resumed run 只收口当前 session，不自动继续下一 session
- 证据：
- `vscode-ext/src/driver/langgraphDriver.ts`
- `interfaces/langgraph-runtime-contract.md`
- `scripts/test_langgraph_hitl_http.py`
- `vscode-ext/scripts/session12_langgraph_hitl.js`
- `artifacts/session-12-summary.md`
- `artifacts/session-12-manifest.json`

## Session 13（LangGraph 迁移 Phase 3：回归与收尾）
- 执行完整回归矩阵（基于 LangGraph 后端）
- 验证边界场景：blocked / server 不在线 / checkpoint 恢复
- 真机 VS Code Extension Host 手工验证记录（后续 Session 完成）
- 下线 `run-vibecoding-loop.py`（或标记为 archived）（后续 Session 完成）
- 正式 VSIX 打包与发布流程（后续 Session 完成）
- 状态：completed（2026-03-17）
- 证据：
- `vscode-ext/scripts/session13_cold_resume.js`
- `vscode-ext/scripts/session13_offline_fallback.js`
- `artifacts/session13-cold-resume-report.json`
- `artifacts/session13-offline-fallback-report.json`
- `artifacts/session-13-summary.md`
- `artifacts/session-13-manifest.json`

---

## Archived Components

### Python Driver (archived 2026-03-17)
- `scripts/archived/run-vibecoding-loop.py` - 原 Python 驱动脚本，已被 LangGraph 运行时替代
- `vscode-ext/src/driver/pythonDriver.ts` - 已删除，Extension 现在只使用 LangGraph HTTP API
- Session 0-10 基于 Python driver 完成，Session 11+ 全面切换到 LangGraph 架构

---

## Cross-Session Constraints
- 任何 Session 都不能把插件改造成新的状态机真相源
- 任何 Session 都不能允许绕过 `startup-prompt.md`
- 任何 Session 都不能把 next session 决策从 `memory.md` 挪到插件状态
- Session 11 前，Python driver contract 冻结，不得新增功能
- Session 11 起，新功能只在 LangGraph 图中实现

## Current Summary
- Session 0–10 已完成 MVP 主链路、smoke 联调与边界回归（基于 Python driver）。
- 2026-03-16 确认架构决策：LangGraph Local Server 替代 Python driver 作为执行运行时。
- Session 11 已完成：LangGraph 8 节点执行图实现、pyproject.toml 依赖补全、fixture smoke 验证通过。
- Session 12 已完成：Extension LangGraph HTTP 主路径、真实 HITL approve/reject 联调、单次 run 收口语义与扩展侧 scenario 验证通过。
- Session 13 已完成：cold-start resume + offline fallback 两条边界路径验证通过，交付物归档完毕。
- 2026-03-17 Python driver 彻底下线：pythonDriver.ts 已删除，run-vibecoding-loop.py 已归档至 scripts/archived/，Extension 现在只使用 LangGraph HTTP API。
- last_completed_session: 13
- next_session: 14
- next_session_prompt: session-14-prompt.md
- session_gate: ready

- 落 `design.md`
- 落 `work-plan.md`
- 落 Session 0 方案稿
- 明确 Python core + VS Code UI shell 架构
- 明确 `memory.md` 是唯一状态源
- 状态：completed

## Session 1
- 创建 VS Code extension skeleton
- 定义 `package.json` 基础命令与配置项
- 不接入复杂 UI
- 状态：completed

## Session 2
- 为 `run-vibecoding-loop.py` 增加稳定 JSON 输出模式
- 定义 driver result schema
- 定义错误码与异常输出策略
- 状态：completed

## Session 3
- 实现 workflow project detection
- 实现 `Refresh Workflow Status`
- 打通插件到 Python inspect mode 的调用链
- 状态：completed

## Session 4
- 实现 `Open Memory`
- 实现 `Open Startup Prompt`
- 实现 `Open Next Session Prompt`
- 规范文件缺失时的提示
- 状态：completed

## Session 5
- 实现 `Prepare Fresh Session`
- 实现 `Start Runner In Terminal`
- 支持 runner command template 配置
- 状态：completed

## Session 6
- 实现状态栏展示
- 实现 output channel 结果回显
- 补充 `ready` / `blocked` / `done` 视觉状态
- 状态：completed

## Session 7
- 补齐异常路径
- 处理 Python 不存在、脚本失败、JSON 不合法、workflow 文件缺失
- 确保插件不会在异常状态下误导推进
- 状态：completed

## Session 8
- 使用真实 vibecoding workflow 项目做联调
- 验证 fresh-session handoff 路径
- 验证 loop log 可追踪
- 状态：completed
- 证据：
- `fixtures/session8-smoke-project/`
- `artifacts/session8-smoke-report.json`

## Session 9
- 真实环境验证
- 覆盖不同 Python 路径、不同 runner 模板、不同 workflow 状态
- 补回归检查清单
- 状态：completed
- 证据：
- `vscode-ext/scripts/session9_regression.js`
- `artifacts/session9-regression-report.json`

## Session 10
- 完成 README 与使用说明
- 补发布前检查
- 收尾文档与后续演进建议
- 状态：completed
- 证据：
- `README.md`
- `vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md`
- `vscode-ext/package.json`
- `npm run compile`
- `npm run smoke:session8`
- `npm run regression:session9`
- `artifacts/session10-closeout-report.md`

## Cross-Session Constraints
- 任何 Session 都不能把插件改造成新的状态机真相源
- 任何 Session 都不能允许绕过 `startup-prompt.md`
- 任何 Session 都不能把 next session 决策从 `memory.md` 挪到插件状态
- Python driver contract 在 Session 2 后应冻结到可消费版本

## Current Summary
- 当前已完成 MVP 主链路、smoke 联调与边界回归。
- 当前已完成 Session 10 文档收尾。
- 2026-03-17 已重新执行 `compile`、`smoke:session8`、`regression:session9`、`smoke:session11`，结果均为 passed。
- 已补齐 3 个集成脚本的测试宿主 teardown；当前不会再出现“报告已写出但 Node 进程未退出”的残留问题。
- 当前未完成 VSIX 打包发布与真机 Extension Host 手工验证记录。
