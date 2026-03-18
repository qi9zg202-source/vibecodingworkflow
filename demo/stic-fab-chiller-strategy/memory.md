# memory.md

## Session Status
- current_phase: development
- last_completed_session: 1
- last_completed_session_tests: passed
- next_session: 2
- next_session_prompt: `session-2-prompt.md`
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
- 当前完整测试已正式完成 Session 1，下一轮从 Session 2 的对象模型与边界校验开始
- Session 2 仅负责对象模型、边界校验与审批/执行状态 gate；Session 3 的运行概览快照只允许停留在渲染层，不得回写到 `core-models.js`
- 当前工作树虽包含 `core-models.js` 设计资产，但官方 workflow 仍需在 Session 2 内重新完成 summary / gate 收口

## Known Risks
- 真实 historian、BMS、SSO 和审批系统仍以 mock 数据 / 模拟流程替代
- ROI 计算依赖电价、运行小时和环境条件假设，后续 Session 需要显式化
- 热回收可用性、最小流量和 N+1 校验逻辑在集成阶段容易出现边界遗漏
- 若继续复用旧 artifacts 或 loop log，会污染下一轮完整测试结论
- Session 4 之后若再次补运行概览字段，必须继续通过 `app.js` 推导，不得再次污染 Session 2 边界
- 当前执行记录只停留在 `planned`，稳态验证、回退封存和关闭结论仍待 Session 6 补齐

## Session Artifacts
- session_0_outputs: `CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`, `README.md`
- session_1_outputs: `index.html`, `app.js`, `styles.css`, `artifacts/session-1-summary.md`

## Session Progress Record
- 2026-03-16 Session 0:
  - 完成内容：将 demo 重构为更贴近真实 Fab CUS 业务的测试项目，重写项目背景、业务范围、设计边界、Session 计划和下一轮完整测试要求，并清理旧运行产物
  - 执行测试：文档完整性检查、workflow 状态检查、旧 artifacts / logs 重置检查
  - 测试结果：`passed`
  - 下一 Session 依赖：读取 `design.md`、`work-plan.md`，然后进入 `session-1-prompt.md`
- 2026-03-18 Session 1:
  - 完成内容：按 startup 规则重新校验并正式收口四大业务区域骨架、顶部业务导航、workspace map 与 boundary ledger，形成可审查的最小工作台入口
  - 执行测试：`node --check app.js`、关键文案与结构 `rg` 校验、导航 / section / 边界结构静态校验、`PRD.md` / `work-plan.md` 对齐检查
  - 测试结果：`passed`
  - 下一 Session 依赖：先读取 `artifacts/session-1-summary.md`，再进入 `session-2-prompt.md`

## Next Session Entry
- 先读 `Session Status`
- 若存在上一轮 summary，先读 `artifacts/session-1-summary.md`
- 再读 `design.md`
- 再读 `work-plan.md`
- 然后只做 `next_session` 指定内容（`session-2-prompt.md`）
