工作目录切到 __PROJECT_ROOT__

本次只做 Session 9。

目标：
- 完成真实业务样例和边界样例验证
- 至少覆盖：
  - 冬季低湿球自然冷却样例
  - 过渡季混合模式样例
  - 夏季高负荷 N+1 样例
  - 最小流量风险样例
  - 热回收不可用样例
  - 传感器缺数样例

限制：
- 不做大改版重构

测试 Gate：
- 至少 6 套样例通过
- 高风险边界有清晰结论
- 无遗漏安全约束

memory 更新：
- `last_completed_session: 9`
- `next_session: 10`
- `next_session_prompt: session-10-prompt.md`
- `session_gate: ready`
