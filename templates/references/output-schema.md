# Output Schema

## Driver Result

统一输出建议：
- `task`
- `status`
- `inputs`
- `artifacts`
- `checks`
- `risks`
- `next_action`

推荐补充字段：
- `task_path`
- `previous_session_summary_path`
- `next_session_spec_path`
- `expected_session_summary_path`

## `next_session_spec` Schema

文件路径：

- `outputs/session-specs/session-N-spec.json`

建议字段：

- `schema_version`
- `project_root`
- `task`
- `session_status`
- `paths`
- `instructions`

当前 driver 写出的结构：

```json
{
  "schema_version": "1.0",
  "project_root": "/abs/path/to/task-root",
  "task": {
    "path": "/abs/path/to/task-root/task.md",
    "title": "task title"
  },
  "session_status": {
    "current_phase": "planning",
    "last_completed_session": "0",
    "last_completed_session_tests": "passed",
    "next_session": "1",
    "next_session_prompt": "session-1-prompt.md",
    "session_gate": "ready"
  },
  "paths": {
    "task_path": "/abs/path/to/task-root/task.md",
    "startup_prompt_path": "/abs/path/to/task-root/startup-prompt.md",
    "memory_path": "/abs/path/to/task-root/memory.md",
    "next_session_prompt_path": "/abs/path/to/task-root/session-1-prompt.md",
    "previous_session_summary_path": null,
    "expected_session_summary_path": "/abs/path/to/task-root/artifacts/session-1-summary.md"
  },
  "instructions": {
    "must_read": [
      "/abs/path/to/task-root/task.md",
      "/abs/path/to/task-root/startup-prompt.md",
      "/abs/path/to/task-root/memory.md"
    ],
    "read_previous_summary_first": false,
    "write_summary_before_memory_update": true
  }
}
```

字段约定：

- `task.title`: 从 `task.md` 的 `## Title` 提取
- `session_status`: 直接镜像 `memory.md` 的 `Session Status`
- `paths.previous_session_summary_path`: 若上一轮 summary 不存在，则为 `null`
- `paths.expected_session_summary_path`: 当前待执行 session 完成后必须写入的位置
- `instructions.must_read`: fresh session 的最小必读文件集合
- `instructions.write_summary_before_memory_update`: 固定为 `true`
