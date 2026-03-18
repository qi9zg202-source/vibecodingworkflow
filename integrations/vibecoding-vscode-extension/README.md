# vibecoding-vscode-extension

VS Code 集成目录，用于承载 `VibeCoding workflow + LangGraph Local Server + VS Code UI shell` 的设计、合同、实现与验证资产。

## 当前定位

- 推荐架构：`LangGraph Local Server + VS Code Extension UI shell`
- 业务真相源：`memory.md`
- 规划真相源：`task.md` / `PRD.md` / `design.md` / `work-plan.md` / `session-N-prompt.md`
- 历史兼容资产：`scripts/archived/run-vibecoding-loop.py` 与 `python-driver-contract.md`
- 推荐交互分层：`Dashboard for workflow actions + LangSmith Studio for graph inspection`

插件不能绕过 `memory.md` 或 `startup-prompt.md` 自己决定下一轮 Session，也不能把 runner 完成误当成业务状态已推进。

## 新执行模型

本目录已统一到以下目标模型：

- LangGraph Local Server 本地常驻
- Session 0 生成第一版 `work-plan.md` 与 `session-N-prompt.md`
- 每次 run 只执行一个当前 Session attempt
- runner 完成后必须先经过客户验收
- 验收不通过时，可先更新 `PRD.md` / `design.md` / `task.md`
- 然后修订 `work-plan.md` 与当前/后续 `session-N-prompt.md`
- `memory.md` 只在验收通过后推进

因此，“持续驱动循环直到自动推进多个 Session”不再是推荐语义。

## 目录内关键文档

- `PRD.md`
- `design.md`
- `work-plan.md`
- `session-0-definition.md`
- `interfaces/langgraph-runtime-contract.md`
- `interfaces/python-driver-contract.md`
- `vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md`

阅读顺序建议：

1. `design.md`
2. `interfaces/langgraph-runtime-contract.md`
3. `interfaces/python-driver-contract.md`
4. `work-plan.md`

## 契约分层

### LangGraph 目标主路径

插件最终应直接消费 LangGraph HTTP API：

- `GET /threads/{thread_id}/state`
- `POST /threads/{thread_id}/runs`
- `GET /threads/{thread_id}/runs/{run_id}`
- `POST /threads/{thread_id}/runs/{run_id}/resume`

该路径对应：

- 插件展示 workflow state 与 runtime state
- LangGraph 负责一次 run 的节点编排
- approve 后由 LangGraph 写 summary / manifest / `memory.md`
- LangSmith Studio 作为可选调试面板查看 thread / node / checkpoint

### Dashboard / Studio 职责划分

- VS Code Dashboard:
  - 面向使用者的主控制台
  - 承载 start / approve / reject / open files 这类 workflow 动作
  - 以 `session_gate`、`next_session`、artifact 路径组织信息
- LangSmith Studio:
  - 面向开发者和排障场景的 graph 调试台
  - 查看 thread history、node traversal、checkpoint、state diff
  - 承担 rerun-from-checkpoint / fork / interrupt inspection 这类运行时能力

因此，Studio 是辅助调试面，不是替代 Dashboard 的 Session 管理页。

### 历史 Python Driver 路径

当前仓库仍保留 Python driver 相关设计与验证资产，用于：

- 保留迁移前行为对照
- 为 LangGraph 直连实现提供旧行为对照

这条路径仍然有参考价值，但已经不再是当前实现依赖。

## 现有资产状态

### 已完成的 LangGraph 主路径能力

- LangGraph 8 节点执行图
- Extension LangGraph HTTP driver
- daemon 探测与本地 auto-start
- Session Runtime Inspector / LangGraph Manager
- Studio deep-link、thread/run 上下文展示
- approve / reject 的 LangGraph 主路径与离线兼容写回
- `npm run compile`
- `npm run smoke:session8`
- `npm run regression:session9`
- `npm run smoke:session11`
- `npm run smoke:session12`
- `npm run smoke:session13:cold-resume`
- `npm run smoke:session13:offline`
- `npm run smoke:dashboard`

这些结果说明“LangGraph 主路径已经进入当前基线”，不再只是设计目标。

### 历史资产与当前基线并存的阅读方式

- 设计文档已经切换到 LangGraph 常驻模型
- VS Code 集成边界以 `interfaces/langgraph-runtime-contract.md` 为准
- Python driver 文档只作为归档对照
- 新增实现与维护都应围绕 LangGraph runtime contract 演进

## 当前能力边界

现有插件目录覆盖的能力包括：

- Dashboard / Status Bar / 命令入口
- Dashboard 中展示 LangGraph 服务地址、Studio 链接、thread/run 标识
- workflow 文件检测与文件打开动作
- LangGraph read path / run path / HITL review path
- daemon 探测、auto-start、offline review fallback
- smoke / regression / real-scenario fixture 与报告
- Session Runtime Inspector / LangGraph Manager 双面板

尚未完成或仍处于迁移中的部分：

- VSIX 打包与发布记录
- 真机 Extension Host 手工验证记录

## 联调与测试资产

- `fixtures/session8-smoke-project/`
- `fixtures/mock-html-alpha/`
- `fixtures/mock-html-beta/`
- `vscode-ext/scripts/session8_smoke.js`
- `vscode-ext/scripts/session9_regression.js`
- `vscode-ext/scripts/session11_real_scenario.js`
- `vscode-ext/scripts/session12_langgraph_hitl.js`
- `vscode-ext/scripts/session13_cold_resume.js`
- `vscode-ext/scripts/session13_offline_fallback.js`
- `vscode-ext/scripts/dashboard_state_smoke.js`
- `artifacts/session8-smoke-report.json`
- `artifacts/session9-regression-report.json`
- `artifacts/session11-real-scenario-report.json`
- `artifacts/session12-langgraph-hitl-report.json`
- `artifacts/session13-cold-resume-report.json`
- `artifacts/session13-offline-fallback-report.json`
- `artifacts/session-13-summary.md`

使用这些资产时要区分：

- 它们验证的是当前已有实现
- 不一定覆盖目标 LangGraph 主路径的全部语义

## 维护原则

- 优先维护入口文档和接口合同，避免 UI 文案先于设计漂移
- 新增实现时优先对齐 `langgraph-runtime-contract.md`
- 修改 fallback 逻辑时，不要回写为新的主设计
- 若验收 reject，需要允许用户先修订需求/设计/计划，再重跑当前 Session

## 结论

这个目录现在既包含“LangGraph 当前实现”，也包含“Python driver 历史归档”。阅读和开发时，应以 LangGraph 合同与新执行模型为准，把 Python driver 相关内容视为历史对照而不是终局架构。
