# Work Plan

> 每个 Session = 一个可测试的具体交付物。Session 0 只产文档，不写业务代码。

## Session 0 — 规划与控制文档
- **Deliverable**: `CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`
- **Test Gate**: 关键文档存在且内容完整，`memory.md` 状态有效

## Session 1 — 页面骨架与最小入口
- **Deliverable**: 三大模块导航骨架（指标监控、策略包、执行闭环）、最小可运行入口
- **Test Gate**: 页面可启动，三大模块导航结构可验证

## Session 2 — 核心数据模型与状态流转
- **Deliverable**: KPI Metric、Strategy Package、Strategy Execution 数据模型，策略状态流转定义
- **Test Gate**: 类型定义无错误，状态机与 PRD 对齐

## Session 3 — 高效制冷机房核心指标曲线监控分析
- **Deliverable**: EER/COP/负荷/电量/温差趋势图、预警摘要、筛选控件
- **Test Gate**: KPI 结构完整，趋势图字段与数据模型一致，预警逻辑可验证

## Session 4 — 优化策略包列表、详情、收益和风险展示
- **Deliverable**: 策略包列表、详情页、收益区间、风险等级、适用工况展示
- **Test Gate**: 策略包字段完整，收益区间和风险说明显示正确

## Session 5 — 策略包下发、反馈与稳态验证闭环
- **Deliverable**: 下发入口、执行反馈记录、稳态观察窗口、回退操作
- **Test Gate**: 完整状态流转可操作（待评审→下发→反馈→稳态验证→完成/回退）

## Session 6 — 权限、日志与操作记录
- **Deliverable**: 人工审核入口、操作记录、审计日志
- **Test Gate**: 审核流程不可绕过，操作记录持久化

## Session 7 — 异常工况、缺数与降级路径
- **Deliverable**: 数据缺失容错、异常工况提示、回退降级处理
- **Test Gate**: 缺数场景有明确提示，降级路径可触发

## Session 8 — 集成与联调
- **Deliverable**: 三大模块端到端完整联通
- **Test Gate**: 主流程端到端测试通过

## Session 9 — 真实业务验证与边界样例
- **Deliverable**: 真实制冷机房业务数据验证，N+1/温边界/最小流量等边界样例
- **Test Gate**: 业务边界样例通过，无遗漏安全约束

## Session 10 — 文档收尾与流程结束
- **Deliverable**: 最终文档更新，`session_gate: done`
- **Test Gate**: 所有文档完整，`memory.md` 标记为 `done`
