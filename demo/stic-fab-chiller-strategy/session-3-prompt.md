工作目录切到 __PROJECT_ROOT__

本次只做 Session 3。

目标：
- 实现高效制冷机房核心指标曲线监控分析
- 固定 KPI、趋势图、异常预警摘要和筛选结构

至少覆盖：
- EER
- COP
- 冷量负荷
- 电量
- 供回水温
- 预警状态

限制：
- 不实现策略包闭环

测试 Gate：
- 监控分析结构完整
- 指标对象和趋势分析口径一致

memory 更新：
- `last_completed_session: 3`
- `next_session: 4`
- `next_session_prompt: session-4-prompt.md`
- `session_gate: ready`
