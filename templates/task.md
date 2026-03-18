# task.md

## 文件职责说明

`task.md` 是 **Task 级**上下文，对应一个二级功能点，每个 Task 独立维护。
`CLAUDE.md` 是项目级背景，跨所有 Task 共享，只读不改。

粒度：一个完整的用户可见功能或主要技术能力（3-15 个 Session）。

---

## Title
__FEATURE_NAME__

## Goal
- 当前 Task 要解决的业务目标（一句话描述）

## In Scope
- 本 Task 明确覆盖的内容

## Out Of Scope
- 本 Task 明确不覆盖的内容

## Constraints
- 业务、技术、流程约束

## Acceptance Criteria
- 可验证的通过条件

## Related Files
- `CLAUDE.md`（项目级背景，只读）
- `PRD.md`
- `design.md`
- `work-plan.md`
- `memory.md`

## Allowed Tools
- LangGraph Local Server（执行运行时）
- Claude Code / Codex CLI（session 执行器，由 LangGraph subprocess 调用）
- 编辑器 / 终端
- `scripts/archived/run-vibecoding-loop.py`（历史归档参考，不属于当前主路径）
