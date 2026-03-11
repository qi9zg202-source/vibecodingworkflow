工作目录切到 __PROJECT_ROOT__

你现在进入的是一个多 Session webcoding 开发流程。

启动规则：
- 先读取 `memory.md` 的 `Session Status`
- 若未指定 Session，则按 `next_session` 执行
- 只有 `session_gate = ready` 才允许进入下一 Session
- 若 `session_gate != ready`，必须停止并报告原因
- 若 `next_session = none` 且 `session_gate = done`，说明流程结束
- 若 `memory.md` 无有效状态，默认从 Session 1 开始

必须先读取：
- `__PROJECT_ROOT__/CLAUDE.md`
- `__PROJECT_ROOT__/PRD.md`
- `__PROJECT_ROOT__/design.md`
- `__PROJECT_ROOT__/work-plan.md`
- `__PROJECT_ROOT__/memory.md`

执行方式：
1. 读取 `Session Status`
2. 判断当前 Session
3. 读取对应 `session-X-prompt.md`
4. 严格只完成该 Session
5. 执行本 Session 测试 Gate
6. 测试通过后更新 `memory.md`
7. 输出收尾说明后停止

固定输出格式：
- `Session X complete`
- `Tests: passed` 或 `Tests: failed` 或 `Tests: blocked`
- `Next: session-Y-prompt.md`
- `Run /clear before starting the next session`
