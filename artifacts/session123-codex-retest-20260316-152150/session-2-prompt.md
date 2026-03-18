工作目录切到 __PROJECT_ROOT__

本次只做 Session 2。

目标：
- 定义 `Baseline Segment`、`Constraint Profile`、`Strategy Package`、`Approval Ticket`、`Execution Record`、`Audit Log`
- 固定状态流转、约束字段和关键校验规则

限制：
- 不实现大段交互
- 不接真实控制系统

测试 Gate：
- 字段定义完整
- 状态流转无冲突
- 覆盖供回水温、最小流量、N+1 和热回收可用性边界

memory 更新：
- `last_completed_session: 2`
- `next_session: 3`
- `next_session_prompt: session-3-prompt.md`
- `session_gate: ready`
