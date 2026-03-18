工作目录切到 __PROJECT_ROOT__

本次只做 Session 7。

目标：
- 处理传感器缺数、热回收不可用、N+1 受限、最小流量风险等异常工况
- 定义降级策略和阻断提示

限制：
- 不推进新主功能

测试 Gate：
- 异常路径覆盖完整
- 高风险场景不会误导执行
- 降级逻辑与回退条件一致

memory 更新：
- `last_completed_session: 7`
- `next_session: 8`
- `next_session_prompt: session-8-prompt.md`
- `session_gate: ready`
