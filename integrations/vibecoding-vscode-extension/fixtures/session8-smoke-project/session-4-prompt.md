工作目录切到 /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project

本次只做 Session 4。
目标：
- 实现核心 UI / API 逻辑 A

限制：
- 不做最终集成

测试 Gate：
- 单元验证
- 最小功能验证

memory 更新：
- `last_completed_session: 4`
- `next_session: 5`
- `next_session_prompt: session-5-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
