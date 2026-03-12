# CLAUDE.md

## Project Background
- 本项目服务对象为 STIC 北方创新中心 Fab 厂务部门机械课。
- 业务场景聚焦高效制冷机房策略优化建议管理。
- 本项目不是 DCS / PLC 自动控制系统，不直接下发底层控制指令。

## Product Intent
- 为机械课工程师提供高效制冷机房核心指标监控分析能力。
- 为工程师提供可评审、可下发、可回退的策略包管理能力。
- 为策略执行提供反馈、稳态验证和闭环追踪能力。

## Domain Guardrails
- 任何策略建议都必须包含适用工况、预期收益区间、风险提示和回退说明。
- 不承诺固定节能值，只输出带假设条件的范围估算。
- 不得跳过人工审核和厂务操作边界。
- 可靠性、冗余和工艺安全优先于短期节能收益。

## Workflow Guardrails
- `memory.md` 是 workflow 真相源。
- 每轮必须从 `startup-prompt.md` 重新进入。
- 不允许跨 Session 混合推进多个未完成 deliverable。
- 若存在上一轮 `session summary`，下一轮必须先读取。
