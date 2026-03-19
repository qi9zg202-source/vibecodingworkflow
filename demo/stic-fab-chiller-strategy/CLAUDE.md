# CLAUDE.md

## Project Background
- 本项目服务对象为 STIC 北方创新中心 Fab 厂务机械课与节能专项工程师。
- 业务对象不是单台设备，而是 Fab CUS 制冷站整体运行，包括中温环路、低温环路、热回收协同和相关公辅负荷。
- 本项目用于承载“策略建议 -> 审批 -> 下发 -> 稳态验证 -> 回退/关闭”的业务闭环，不直接替代 BMS / DCS / PLC 控制系统。

## Product Intent
- 让工程师能在一个工作台内查看制冷站负荷、能效、约束边界与策略机会，而不是在 Excel、报表和聊天记录中分散判断。
- 让策略建议以“策略包”的形式沉淀，明确适用季节、工况、收益区间、风险和回退条件。
- 让策略执行结果可追踪、可审计、可复盘，为后续真实项目联调提供高可信样板。

## Domain Guardrails
- 任何策略建议都必须标注适用边界：负荷区间、湿球/室外条件、供回水温边界、最小流量和 N+1 冗余要求。
- 不承诺固定节能值，只能输出带假设条件的收益区间和不确定性说明。
- 不允许绕过人工审批、人工确认和回退入口。
- 不允许为了短期节能牺牲工艺可靠性、洁净环境稳定性或机台供冷安全。
- 所有控制建议都必须带 fallback / recovery notes，禁止输出不可逆自动控制指令。

## Workflow Guardrails
- `memory.md` 是 workflow 真相源。
- 每轮必须从 `startup-prompt.md` 重新进入。
- 不允许跨 Session 混合推进多个未完成 deliverable。
- 若存在上一轮 `session summary`，下一轮必须先读取。
- 测试没过不得进入下一 Session。

## Demo Guardrails
- 本 demo 用于“完整工作流测试”，不是历史中途 handoff 展示样本。
- 当前基线已经重置到 Session 0 完成、Session 1 待开始，旧 artifacts / logs 不得继续复用为新一轮测试依据。
- 后续完整测试必须以 `README.md` 中的 next full-test requirements 为执行约束。
