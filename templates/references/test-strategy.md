# Test Strategy

每个 Session 至少包含：
- 语法检查
- 最小样例验证
- 结构校验
- summary 写入检查
- `memory.md` 更新检查

关键 Session 再补：
- 集成验证
- 真实环境验证
- 回归验证

若 Session 完成：
- 先写 `artifacts/session-N-summary.md`
- 再更新 `memory.md`
- 再进入下一轮 fresh session
