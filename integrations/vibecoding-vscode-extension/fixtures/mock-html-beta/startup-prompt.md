工作目录切到 /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/mock-html-beta

你现在进入的是一个最小化 HTML 模拟 workflow。

启动规则：
- 先读取 `memory.md` 的 `Session Status`
- 若未指定 Session，则按 `next_session` 执行
- 只有 `session_gate = ready` 才允许进入下一 Session
- 若 `session_gate != ready`，必须停止并报告原因

必须先读取：
- `/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/mock-html-beta/CLAUDE.md`
- `/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/mock-html-beta/PRD.md`
- `/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/mock-html-beta/design.md`
- `/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/mock-html-beta/work-plan.md`
- `/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/mock-html-beta/memory.md`

执行方式：
1. 读取 `Session Status`
2. 判断当前 Session
3. 读取对应 `session-X-prompt.md`
4. 只完成当前 Session
5. 完成后更新 `memory.md`
