工作目录切到 __PROJECT_ROOT__

本次只做 Session 2。
开始前若存在上一轮 summary，先读：
- `artifacts/session-1-summary.md`

目标：
- 定义页面地图、数据结构、接口契约

限制：
- 不做运行态和网络验证

测试 Gate：
- 结构校验
- 最小样例验证

summary：
- 写 `artifacts/session-2-summary.md`

memory 更新：
- `last_completed_session: 2`
- `next_session: 3`
- `next_session_prompt: session-3-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
