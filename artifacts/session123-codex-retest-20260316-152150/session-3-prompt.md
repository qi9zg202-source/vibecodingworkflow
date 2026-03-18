工作目录切到 __PROJECT_ROOT__

本次只做 Session 3。

目标：
- 实现制冷站运行概览：
  - 负荷
  - 供回水温
  - 流量
  - 机组台数
  - EER / COP
  - 湿球条件
  - 告警摘要

限制：
- 不推进策略推荐逻辑

测试 Gate：
- 关键指标结构完整
- 异常提示与约束对象一致
- 值班视角可解释“现在能不能动”

memory 更新：
- `last_completed_session: 3`
- `next_session: 4`
- `next_session_prompt: session-4-prompt.md`
- `session_gate: ready`
