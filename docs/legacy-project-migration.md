# Legacy Project Migration

The current workflow contract is intentionally strict:

- `task.md` is required
- `artifacts/session-N-summary.md` is the session handoff evidence
- `outputs/session-specs/session-N-spec.json` is the machine-readable fresh-session handoff

This is a breaking change for older workflow projects that were created before
`task.md` and session summaries became first-class.

## Recommended Strategy

Use explicit migration, not runtime fallback.

Why:

- keeps one routing model instead of two
- prevents silent drift between legacy and current projects
- lets the driver stay strict and machine-checkable
- avoids guessing task-level intent from prompt files

```mermaid
graph TD
    L["旧项目\n(prompt-only\n无 task.md)"]
    N["新项目\n(task-centered\n完整 contract)"]
    M["migrate-vibecoding-project.sh"]

    L --> M
    M --> A1["✅ 补充 task.md"]
    M --> A2["✅ 补充 artifacts/"]
    M --> A3["✅ 补充 outputs/session-specs/"]
    M --> A4["✅ 补充 outputs/session-logs/"]
    M --> A5["🚫 不覆盖已有文件\nmemory.md / startup-prompt.md\nsession prompts / product docs"]
    A1 & A2 & A3 & A4 --> N
    A5 -.->|"保留原内容"| N
```

## Migration Command

From this repository root:

```bash
./scripts/migrate-vibecoding-project.sh /path/to/legacy-project
```

Optional:

```bash
./scripts/migrate-vibecoding-project.sh /path/to/legacy-project --title "Task Title"
```

## What The Migration Script Does

Non-destructively adds missing assets only:

- `task.md`
- `artifacts/`
- `artifacts/session-summary-template.md`
- `outputs/session-specs/`
- `outputs/session-logs/`

It does not overwrite existing `startup-prompt.md`, `memory.md`, session prompts,
or product docs.

## Post-Migration Review

After migration:

1. run the driver in inspect mode
2. verify `task.title` and generated spec paths
3. review older `startup-prompt.md`, `memory.md`, and session prompts if the project still follows the pre-task wording

Recommended verification:

```bash
python3 ./scripts/run-vibecoding-loop.py /path/to/legacy-project --action inspect --json
```

```mermaid
flowchart LR
    MIG["迁移完成"] --> V1["运行 driver inspect\n验证 task.title"]
    V1 --> V2["检查 spec 路径\noutputs/session-specs/"]
    V2 --> V3{"旧 startup/memory\n措辞是否过时?"}
    V3 -->|"是"| FIX["手动更新\nstartup-prompt.md\nmemory.md"]
    V3 -->|"否"| OK["✅ 迁移验证通过\n可继续 Session 循环"]
    FIX --> OK
```

## Why No Fallback

The driver intentionally does not treat missing `task.md` as optional.
If fallback were added, the repository would again have:

- a task-centered path
- a prompt-only legacy path

That would weaken the contract the rest of the documentation now depends on.
