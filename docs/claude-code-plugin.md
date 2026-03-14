# VibeCoding Workflow Claude Code Plugin

This plugin provides commands and skills for the VibeCoding workflow.

## Installation

The plugin is installed at:
```
~/.claude/plugins/marketplaces/claude-plugins-official/plugins/vibecoding-workflow/
```

## Commands

### `/nss` — New Session Summary

Generate a session handoff summary for switching to a fresh context.

**Trigger**: Type `/nss` or `nss))` in Claude Code

**Purpose**: Creates a structured summary of the current session's work to enable seamless context transfer when switching to a new session window.

**When to use**:
- At the end of any Session (0-10) before closing the current session
- When you need to switch to a new session window
- Before updating `memory.md` with `next_session`

**What it generates**:
- Session identification (number, phase, task name)
- Work completed (deliverables, files changed, key decisions)
- Test results (passed/failed/blocked)
- Next session context (what to read, what to do)
- Handoff artifacts status (summary.md, manifest.json, memory.md)
- Risks and blockers
- Fresh session prompt

**Example output**:
```markdown
# Session 3 Handoff Summary

## Session Info
- Session: 3
- Phase: development
- Task: chiller-strategy
- Status: passed

## Work Completed
- Implemented data loading layer
- Created DataContext provider
- Added API client for fetching chiller metrics

## Files Changed
- src/contexts/DataContext.tsx (+85 lines)
- src/lib/api-client.ts (+120 lines)
- src/types/chiller.ts (+45 lines)

## Next Session
- Update memory.md:
  - current_phase: development
  - next_session: 4
  - session_gate: ready
- Next session must read:
  - memory.md
  - task.md
  - design.md
  - work-plan.md
  - artifacts/session-3-summary.md
- Next session should: Implement first core feature module

## Fresh Session Prompt
工作目录切到 /Users/beckliu/projects/chiller-strategy
请执行 startup-prompt.md 中的启动流程。
```

**Note**: This command generates the summary but does NOT automatically write files. You should:
1. Review the generated summary
2. Write `artifacts/session-N-summary.md` with this content
3. Write `artifacts/session-N-manifest.json`
4. Update `memory.md`
5. Close the current session
6. Open a fresh session with the provided prompt

## Plugin Structure

```
vibecoding-workflow/
├── plugin.json          # Plugin metadata
└── commands/
    └── nss.md          # New Session Summary command
```

## Development

To modify the command:
1. Edit `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/vibecoding-workflow/commands/nss.md`
2. Restart Claude Code or reload plugins
3. Test with `/nss` or `nss))`

## Integration with VibeCoding Workflow

This plugin is designed to work with the VibeCoding workflow architecture:
- **Two-phase structure**: Design phase (Session 0) → Development phase (Sessions 1-10)
- **Fresh context per session**: Each session runs in a new window
- **File-based state**: `memory.md` is the single source of truth
- **Handoff artifacts**: `session-N-summary.md` + `session-N-manifest.json`

See [`docs/two-phase-architecture.md`](../docs/two-phase-architecture.md) for complete workflow details.
