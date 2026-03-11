# memory.md

## Session Status
- current_phase: planning
- last_completed_session: 0
- last_completed_session_tests: passed
- next_session: 1
- next_session_prompt: `session-1-prompt.md`
- session_gate: ready

## Session Update Rule
- 必须更新：
  - `last_completed_session`
  - `last_completed_session_tests`
  - `next_session`
  - `next_session_prompt`
  - `session_gate`

字段约定：
- `last_completed_session_tests`: `passed` / `failed` / `blocked`
- `session_gate`: `ready` / `blocked` / `in_progress` / `done`

## Current Decisions
- 记录跨 Session 的稳定结论
- 不写未验证结论

## Known Risks
- 记录会影响后续判断的风险

## Session Artifacts
- session_0_outputs:
- session_1_outputs:
- session_2_outputs:
- session_3_outputs:

## Next Session Entry
- 先读 `Session Status`
- 再读 `design.md`
- 再读 `work-plan.md`
- 然后只做 `next_session` 指定内容
