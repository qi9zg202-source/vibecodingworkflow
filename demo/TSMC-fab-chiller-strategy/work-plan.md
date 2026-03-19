# Work Plan

> 每个 Session = 一个可测试、可评审、可 handoff 的具体交付物。
> 当前 demo 已完成 Session 0 文档准备，下一轮完整测试从 Session 1 开始。

## Session 0 — 业务基线与 workflow 文档
- **Deliverable**: `CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`, `README.md`
- **Test Gate**: 文档存在；业务边界完整；`memory.md` 状态有效；README 记录下一次完整测试要求

## Session 1 — 工作台骨架与业务导航
- **Deliverable**: Operations Overview / Strategy Workbench / Approval & Execution / Audit & Evidence 四大业务区域的页面骨架与最小入口
- **Test Gate**: 页面骨架可验证；业务导航结构与 PRD 对齐；四大工作区边界清晰

## Session 2 — 负荷基线、约束边界与核心对象模型
- **Deliverable**: `Baseline Segment`、`Constraint Profile`、`Strategy Package`、`Approval Ticket`、`Execution Record`、`Audit Log` 数据模型与状态约束
- **Test Gate**: 字段完整；状态流转无冲突；约束边界覆盖供回水温、最小流量与 N+1

## Session 3 — 制冷站运行概览与异常提示
- **Deliverable**: 供回水温、流量、负荷、机组台数、EER/COP、湿球条件、告警摘要看板
- **Test Gate**: 指标结构完整；异常提示与约束对象可对应；值班视角可解释

## Session 4 — 策略包目录与工况匹配
- **Deliverable**: 策略包列表、详情、适用季节 / 负荷 / 湿球条件匹配与风险分级
- **Test Gate**: 至少 5 个策略包样例；工况、收益、风险和回退信息完整；策略与基线段可映射

## Session 5 — ROI 测算与推荐编排
- **Deliverable**: ROI / kWh 节约范围展示、假设条件说明、策略推荐面板
- **Test Gate**: 收益表达为范围；假设条件清晰；推荐逻辑与业务约束不冲突

## Session 6 — 审批、下发、反馈与稳态验证
- **Deliverable**: 审批流、下发记录、执行反馈、稳态观察窗口、回退闭环
- **Test Gate**: 状态流转完整；审批不可绕过；回退路径清晰；稳态结论可追踪

## Session 7 — 异常工况与降级策略
- **Deliverable**: 传感器缺数、热回收不可用、N+1 受限、最小流量风险等异常场景处理
- **Test Gate**: 降级路径可触发；高风险告警与回退逻辑一致；不会误导执行

## Session 8 — 模块集成与端到端联调
- **Deliverable**: 运行概览、策略工作台、审批执行、审计证据四大模块联通
- **Test Gate**: 主流程联调通过； summary / spec / loop log 可产出；关键对象串联无断点

## Session 9 — 真实业务样例与边界验证
- **Deliverable**: 冬季、过渡季、夏季 3 套样例；N+1、最小流量、缺数 3 类边界样例
- **Test Gate**: 至少 6 套样例通过；未遗漏安全约束；风险结论可解释

## Session 10 — 文档收尾与测试闭环
- **Deliverable**: 最终 summary、交付说明、测试回顾、`memory.md` 收口为 `done`
- **Test Gate**: 文档齐全；状态闭环；下一轮测试输入明确
