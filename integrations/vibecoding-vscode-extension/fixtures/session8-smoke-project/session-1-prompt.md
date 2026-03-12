工作目录切到 /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project

本次只做 Session 1。
目标：
- 搭 web 项目骨架与最小入口

限制：
- 不实现复杂业务逻辑

测试 Gate：
- 语法检查
- 最小启动验证

memory 更新：
- `last_completed_session: 1`
- `next_session: 2`
- `next_session_prompt: session-2-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
