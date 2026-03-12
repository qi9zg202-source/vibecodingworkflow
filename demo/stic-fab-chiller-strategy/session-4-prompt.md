工作目录切到 __PROJECT_ROOT__

本次只做 Session 4。

开始前必须先读取：
- `artifacts/session-3-summary.md`

目标：
- 实现优化策略包列表和详情
- 展示策略包适用工况、收益区间、风险等级和回退条件

至少包含：
- 策略名称
- 目标对象
- 适用工况
- ROI / 节能收益区间
- 风险等级
- 控制建议
- 回退条件

限制：
- 不做自动下发
- 不忽略 N+1、温度、流量和稳定性边界

测试 Gate：
- 策略包详情字段完整
- 工况条件、收益和风险说明自洽
- 能从监控分析结果自然衔接到策略包层

memory 更新：
- `last_completed_session: 4`
- `next_session: 5`
- `next_session_prompt: session-5-prompt.md`
- `session_gate: ready`
