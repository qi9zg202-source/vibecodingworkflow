工作目录切到 __PROJECT_ROOT__

本次只做 Session 2。

目标：
- 定义核心指标模型、策略包模型、执行闭环状态模型
- 固定状态流转和关键字段

限制：
- 不实现大段交互
- 不接真实控制系统

测试 Gate：
- 字段定义完整
- 状态流转无冲突

memory 更新：
- `last_completed_session: 2`
- `next_session: 3`
- `next_session_prompt: session-3-prompt.md`
- `session_gate: ready`
