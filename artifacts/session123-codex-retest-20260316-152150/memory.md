# memory.md

## Session Status
- current_phase: development
- last_completed_session: 3
- last_completed_session_tests: passed
- next_session: 4
- next_session_prompt: `session-4-prompt.md`
- session_gate: ready

## Session Update Rule
- 必须更新：
  - `last_completed_session`
  - `last_completed_session_tests`
  - `next_session`
  - `next_session_prompt`
  - `session_gate`

字段约定：
- `last_completed_session_tests`: `passed` / `failed` / `blocked`
- `session_gate`: `ready` / `blocked` / `in_progress` / `done`

## Current Decisions
- demo 项目改造为“完整工作流测试底座”，不再保留旧中途 handoff 状态
- 业务对象提升为 Fab CUS 制冷站整体，而非单纯高效制冷机房展示
- 策略建议必须同时显示工况匹配、ROI 范围、风险和回退方案
- 下一次完整测试从 Session 1 开始，目标是从骨架搭建一直推进到 Session 10 收口
- Session 2 仅负责对象模型、边界校验与审批/执行状态 gate；Session 3 的运行概览快照只允许停留在渲染层，不得回写到 `core-models.js`
- Session 2 已将核心对象模型收敛到 `core-models.js`，后续 Session 只能消费这些模型，不得在 UI 层私自重定义状态机
- Session 3 已把“现在能不能动”的值班结论落到 UI，但该结论仍属于渲染层提示，不能替代审批 / 执行 gate

## Known Risks
- 真实 historian、BMS、SSO 和审批系统仍以 mock 数据 / 模拟流程替代
- ROI 计算依赖电价、运行小时和环境条件假设，后续 Session 需要显式化
- 热回收可用性、最小流量和 N+1 校验逻辑在集成阶段容易出现边界遗漏
- 若继续复用旧 artifacts 或 loop log，会污染下一轮完整测试结论
- Session 4 之后若再次补运行概览字段，必须继续通过 `app.js` 推导，不得再次污染 Session 2 边界
- 当前执行记录只停留在 `planned`，稳态验证、回退封存和关闭结论仍待 Session 6 补齐
- Session 4 若开始补策略推荐展示，必须继续保持 `memory.md` 业务真相与运行时状态分离，不能把值班结论回写成流程 gate

## Session Artifacts
- session_0_outputs: `CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`, `README.md`
- session_1_outputs: `index.html`, `app.js`, `styles.css`, `artifacts/session-1-summary.md`, `outputs/session-specs/session-1-spec.json`
- session_2_outputs: `core-models.js`, `artifacts/session-2-summary.md`, `outputs/session-specs/session-2-spec.json`
- session_3_outputs: `index.html`, `app.js`, `styles.css`, `artifacts/session-3-summary.md`, `outputs/session-specs/session-3-spec.json`

## Session Progress Record
- 2026-03-16 Session 0:
  - 完成内容：将 demo 重构为更贴近真实 Fab CUS 业务的测试项目，重写项目背景、业务范围、设计边界、Session 计划和下一轮完整测试要求，并清理旧运行产物
  - 执行测试：文档完整性检查、workflow 状态检查、旧 artifacts / logs 重置检查
  - 测试结果：`passed`
  - 下一 Session 依赖：读取 `design.md`、`work-plan.md`，然后进入 `session-1-prompt.md`
- 2026-03-16 Session 1:
  - 完成内容：确认并交付四大业务区域骨架、最小业务导航入口、模块边界说明与响应式页面布局
  - 执行测试：页面骨架结构检查、导航结构检索、`app.js` / `core-models.js` 语法检查
  - 测试结果：`passed`
  - 下一 Session 依赖：先读 `artifacts/session-1-summary.md`，再进入 `session-2-prompt.md`
- 2026-03-16 Session 2:
  - 完成内容：确认 6 类核心对象模型、状态流转约束、边界校验规则与审批/执行 gate，统一收敛到 `core-models.js`
  - 执行测试：`core-models.js` / `app.js` 语法检查、Session 2 gate 汇总检查、边界字段与状态历史校验
  - 测试结果：`passed`
  - 下一 Session 依赖：先读 `artifacts/session-2-summary.md`，再进入 `session-3-prompt.md`
- 2026-03-16 Session 3:
  - 完成内容：补齐运行概览 KPI、约束快照、异常提示和值班结论面板，并通过 `app.js` 基于 `core-models.js` 推导 `overviewState`
  - 执行测试：`app.js` / `core-models.js` 语法检查、`overviewState` 指标/告警/值班结论推导检查
  - 测试结果：`passed`
  - 下一 Session 依赖：先读 `artifacts/session-3-summary.md`，再进入 `session-4-prompt.md`

## Next Session Entry
- 先读 `Session Status`
- 若存在上一轮 summary，先读 `artifacts/session-3-summary.md`
- 再读 `design.md`
- 再读 `work-plan.md`
- 然后只做 `next_session` 指定内容（`session-4-prompt.md`）
