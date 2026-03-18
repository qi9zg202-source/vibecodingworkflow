# Session 13 Prompt

工作目录：/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow

本次是 Session 13，目标是完成 LangGraph 迁移 Phase 3：回归与收尾。

---

## 必须先读的上下文文件（按顺序）

1. `integrations/vibecoding-vscode-extension/work-plan.md` — Session 0–12 完成内容
2. `integrations/vibecoding-vscode-extension/design.md` — 系统设计
3. `integrations/vibecoding-vscode-extension/interfaces/langgraph-runtime-contract.md` — LangGraph HTTP API 合约
4. `integrations/vibecoding-vscode-extension/vscode-ext/src/driver/langgraphDriver.ts` — Session 12 实现的 LangGraph driver
5. `artifacts/session-12-summary.md` — Session 12 完成内容（上下文）
6. `artifacts/session-12-manifest.json` — Session 12 交付物清单

---

## 本 Session 目标

完成 LangGraph 迁移后的边界验证与收尾工作，确保扩展在各种边界场景下稳定运行。

---

## 执行范围（In Scope）

1. **边界验证点 A：cold-start resume 路径**
   - 验证冷启动后 refresh 正确识别 interrupted 状态
   - 验证冷启动后 approve/reject（无事先 activateWorkflowRunner）正常完成
   - 脚本：`vscode-ext/scripts/session13_cold_resume.js`
   - 报告：`artifacts/session13-cold-resume-report.json`

2. **边界验证点 B：server offline / Python fallback 路径**
   - 验证 LangGraph server 不在线时，refresh/start/approve/reject 全部正确降级到 Python driver 或 memory.md 直写
   - 脚本：`vscode-ext/scripts/session13_offline_fallback.js`
   - 报告：`artifacts/session13-offline-fallback-report.json`

3. **package.json 新增 smoke 脚本**
   - `npm run smoke:session13` — 运行 session13_cold_resume.js
   - `npm run smoke:session13:offline` — 运行 session13_offline_fallback.js

4. **Session 13 交付物归档**
   - `session-13-prompt.md`（本文件）
   - `artifacts/session-13-summary.md`（人类可读）
   - `artifacts/session-13-manifest.json`（机器可验证）

---

## 执行范围（Out of Scope）

- 不修改 `src/vibecoding_langgraph/graph.py`
- 不修改 `memory.md` schema
- 不修改 Python driver（冻结，仅作 fallback）
- 不做 VSIX 打包（后续 Session 的工作）
- 不下线 `run-vibecoding-loop.py`（后续 Session 的工作）

---

## 关键设计约束

1. **降级策略**：LangGraph server 不在线时，静默降级到 Python driver 或 memory.md 直写，不报错阻断用户
2. **冷启动 resume**：无事先 activateWorkflowRunner 的情况下，approve/reject 必须正常完成
3. **验证覆盖**：cold-start resume + offline fallback 两条边界路径必须通过

---

## 验证 Gate（本 Session 必须通过）

1. `npm run compile` 成功，无 TypeScript 错误
2. `npm run smoke:session13` 通过（cold-start resume 路径）
3. `npm run smoke:session13:offline` 通过（offline fallback 路径）
4. `npm run smoke:session12` 仍然通过（回归检查）

---

## 产出要求

- `vscode-ext/scripts/session13_cold_resume.js`（新文件）
- `vscode-ext/scripts/session13_offline_fallback.js`（新文件）
- `artifacts/session13-cold-resume-report.json`（新文件）
- `artifacts/session13-offline-fallback-report.json`（新文件）
- `vscode-ext/package.json`（新增 smoke:session13 / smoke:session13:offline）
- `session-13-prompt.md`（本文件）
- `artifacts/session-13-summary.md`（人类可读）
- `artifacts/session-13-manifest.json`（机器可验证）

## memory 更新

Session 完成后更新 `work-plan.md`：
- Session 13 状态改为 `completed`
- Current Summary 更新 `last_completed_session: 13`、`next_session: 14`、`session_gate: ready`

## 完成策略

- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新进入
