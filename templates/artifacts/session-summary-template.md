# Session N Summary

## Completed
- 本轮完成了什么

## Files Changed
- 修改了哪些文件

## Tests
- 执行了哪些测试
- 结果：`passed` / `failed` / `blocked`

## Decisions
- 本轮确认了哪些关键设计决定

## Risks
- 还有哪些未完成风险或限制

## Next Session Inputs
- 下一轮必须先看哪些文件
- 下一轮从哪里接着做

---

## Manifest Checklist

完成本 Session 后，必须同时产出：

1. `artifacts/session-N-summary.md`（本文件，人类可读）
2. `artifacts/session-N-manifest.json`（机器可验证，格式见下）

```json
{
  "schema_version": "1.0",
  "session": N,
  "status": "completed",
  "timestamp": "ISO8601",
  "produced_artifacts": [
    {
      "path": "相对于 task root 的路径",
      "type": "source_code | type_definition | config | doc",
      "description": "简短描述"
    }
  ],
  "next_session_requirements": {
    "session": N+1,
    "required_artifacts": ["上一条中必须存在的路径"],
    "context_to_read": ["artifacts/session-N-summary.md"]
  },
  "tests": {
    "status": "passed | failed | blocked"
  }
}
```
