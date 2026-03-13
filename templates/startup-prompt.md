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
- `__PROJECT_ROOT__/task.md`
- `__PROJECT_ROOT__/PRD.md`
- `__PROJECT_ROOT__/design.md`
- `__PROJECT_ROOT__/work-plan.md`
- `__PROJECT_ROOT__/memory.md`

补充规则：
- 若 `last_completed_session > 0` 且存在 `artifacts/session-{last_completed_session}-summary.md`，必须在进入下一轮前读取上一轮 summary
- 不允许只凭上一轮聊天历史继续推进

执行方式：
1. 读取 `Session Status`
2. 判断当前 Session
3. 若存在上一轮 summary，先读取上一轮 summary
4. 读取对应 `session-X-prompt.md`
5. 严格只完成该 Session
6. 执行本 Session 测试 Gate
7. 先写本轮 `artifacts/session-X-summary.md`（人类可读）
8. 再写本轮 `artifacts/session-X-manifest.json`（机器可验证）
9. 再更新 `memory.md`
10. 输出收尾说明后停止

每轮循环规则：
- Session 完成后，必须先写本轮 `session summary`（artifacts/session-X-summary.md）
- Session 完成后，必须同步写入本轮 `session manifest`（artifacts/session-X-manifest.json）
- 再更新 `memory.md`
- 更新完成后，结束当前会话
- 推荐做法是启动一个新的 Session / 新上下文，而不是在原会话里自动续跑
- 新会话里再次执行 `startup-prompt.md`
- 不要直接执行 `session-N-prompt.md`
- 下一轮该进入哪个 Session，只能由 `memory.md` 决定

固定输出格式：
- `Session X complete`
- `Tests: passed` 或 `Tests: failed` 或 `Tests: blocked`
- `Summary: artifacts/session-X-summary.md`
- `Manifest: artifacts/session-X-manifest.json`
- `Next: session-Y-prompt.md`
- `Start a fresh session before running the next startup-prompt.md`
