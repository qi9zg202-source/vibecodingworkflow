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

`session_handoff` 至少包含：
- 上一轮完成内容
- 关键修改文件
- 测试结果
- 已确认决策
- 未解决风险
- 下一轮输入
