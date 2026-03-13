# Evidence Model

固定证据层：
1. business_context
2. config_intent
3. runtime_state
4. path_evidence
5. quality
6. final_verdict

推荐额外固化：
7. session_handoff
8. session_manifest

## Session Handoff（人类可读）

`session_handoff` 至少包含：
- 上一轮完成内容
- 关键修改文件
- 测试结果
- 已确认决策
- 未解决风险
- 下一轮输入

产出形式：`artifacts/session-N-summary.md`

## Session Manifest（机器可验证）

`session_manifest` 至少包含：
- session 编号和状态
- 产出的 artifacts 清单（路径、类型、描述）
- 下一 session 的前置要求
- 测试状态

产出形式：`artifacts/session-N-manifest.json`

## 双轨制原则

- **Summary**: 描述性，人类可读，用于理解上下文
- **Manifest**: 结构化，机器可验证，用于自动化检查
- 两者并行生成，不是转换关系
- Driver 可通过 manifest 验证 session 完整性
