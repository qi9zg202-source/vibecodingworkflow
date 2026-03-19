工作目录切到 __PROJECT_ROOT__

本次只做 Session 4。

目标：
- 实现策略包目录、详情和工况匹配
- 至少定义 5 个策略包样例
- 显示适用季节、负荷区间、ROI 范围、风险等级和回退条件

限制：
- 不进入审批下发闭环

测试 Gate：
- 策略包字段完整
- 至少 5 个样例自洽
- 策略与基线段、约束边界可映射

memory 更新：
- `last_completed_session: 4`
- `next_session: 5`
- `next_session_prompt: session-5-prompt.md`
- `session_gate: ready`
