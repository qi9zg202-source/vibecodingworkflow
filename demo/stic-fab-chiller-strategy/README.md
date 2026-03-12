# STIC Fab Chiller Strategy Demo

This demo persists a concrete workflow example for:

- STIC 北方创新中心 Fab 厂务机械课
- 高效制冷机房策略优化建议管理功能

The demo is intentionally stored in a mid-stream handoff state:

- `last_completed_session: 3`
- `next_session: 4`
- `session_gate: ready`

This lets readers inspect how:

- `task.md` defines the business objective
- `memory.md` routes the workflow
- `startup-prompt.md` re-enters the workflow
- `artifacts/session-3-summary.md` carries session handoff evidence
- `session-4-prompt.md` picks up from the previous summary
