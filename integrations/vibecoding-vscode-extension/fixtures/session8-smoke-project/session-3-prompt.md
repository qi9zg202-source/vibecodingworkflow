工作目录切到 /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project

本次只做 Session 3。
目标：
- 实现配置、上下文、数据加载

限制：
- 不做真实网络路径和质量统计

测试 Gate：
- 语法检查
- 最小输入运行
- 结构校验

memory 更新：
- `last_completed_session: 3`
- `next_session: 4`
- `next_session_prompt: session-4-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
