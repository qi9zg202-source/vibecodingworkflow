工作目录切到 __PROJECT_ROOT__

你现在进入的是一个多 Session 开发流程。

当前 Task：
- TSMC Fab CUS 制冷站节能策略编排与执行验证工作台

启动规则：
- 先读取 `memory.md` 的 `Session Status`
- 若未指定 Session，则按 `next_session` 执行
- 只有 `session_gate = ready` 才允许进入下一 Session
- 若 `session_gate != ready`，必须停止并报告原因
- 若 `next_session = none` 且 `session_gate = done`，说明流程结束

必须先读取：
- `__PROJECT_ROOT__/CLAUDE.md`
- `__PROJECT_ROOT__/task.md`
- `__PROJECT_ROOT__/PRD.md`
- `__PROJECT_ROOT__/design.md`
- `__PROJECT_ROOT__/work-plan.md`
- `__PROJECT_ROOT__/memory.md`
- `__PROJECT_ROOT__/README.md`

补充规则：
- 若 `last_completed_session > 0` 且存在 `artifacts/session-{last_completed_session}-summary.md`，必须在进入下一轮前读取上一轮 summary
- 不允许只凭上一轮聊天历史继续推进
- 不允许跳过 `startup-prompt.md` 直接进入 `session-N-prompt.md`
- 当前 demo 已重置为 Session 0 完成、Session 1 待开始，旧 artifacts / logs 不得作为新的推进依据

执行方式：
1. 读取 `Session Status`
2. 判断当前 Session
3. 若存在上一轮 summary，先读取上一轮 summary
4. 读取对应 `session-X-prompt.md`
5. 严格只完成该 Session
6. 执行本 Session 测试 Gate
7. 先写本轮 `artifacts/session-X-summary.md`
8. 再更新 `memory.md`
9. 输出收尾说明后停止

固定约束：
- 所有策略建议必须包含适用工况、收益范围、风险等级和回退说明
- 不输出绕过人工审核的自动执行方案
- 不牺牲可靠性、N+1 和工艺安全换取短期节能
- Session 9 必须完成真实业务样例和边界样例验证

固定输出格式：
- `Session X complete`
- `Tests: passed` / `Tests: failed` / `Tests: blocked`
- `Next: session-Y-prompt.md`
- `Summary: artifacts/session-X-summary.md`
- `Start a fresh session before running the next startup-prompt.md`
