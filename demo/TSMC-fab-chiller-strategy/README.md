# TSMC Fab CUS Strategy Demo

本 demo 是 `vibecodingworkflow` 仓库内专门用于完整流程测试的业务样板项目。

## 业务场景

- 客户对象：TSMC 北方创新中心 Fab 厂务机械课
- 测试主题：Fab CUS 制冷站节能策略编排与执行验证工作台
- 业务边界：中温环路、低温环路、热回收协同、审批执行闭环

与旧版本不同，本 demo 不再用于展示”中途 handoff 状态”，而是作为下一轮完整 workflow 联调的起始底座。

## 当前基线状态

- 基线重置日期：2026-03-16
- `last_completed_session: 0`
- `next_session: 1`
- `next_session_prompt: session-1-prompt.md`
- `session_gate: ready`

说明：

- Session 0 文档已完成
- Session 1-10 尚未开始
- 旧 `artifacts/`、`outputs/session-logs/`、`outputs/session-specs/` 历史产物已清理

补充说明：

- 上述状态仍以 `memory.md` 为准，表示“官方 workflow 尚未推进出 Session 0”。
- 当前工作树已经加入一批预演型设计资产：
  - `index.html` + `styles.css` + `app.js`：Session 1 对应的四大业务区域骨架与最小导航
  - `core-models.js`：Session 2 对应的核心对象模型、约束对象与状态机草案
- 这些文件用于回写设计与联调，不等同于正式完成 Session 1 / 2；正式推进仍需要 summary / memory 收口。

## 下一次完整测试要求

下一轮完整测试必须遵守以下要求：

1. 开始前先执行标准 reset：

   ```bash
   ./scripts/reset-demo-TSMC-fab-cus.sh
   ```

2. 必须从 `startup-prompt.md` 进入，不得直接跳 `session-N-prompt.md`
3. 必须先读取：
   - `CLAUDE.md`
   - `task.md`
   - `PRD.md`
   - `design.md`
   - `work-plan.md`
   - `memory.md`
4. 每个 Session 必须只完成当轮 deliverable，并执行 prompt 中定义的 Test Gate
5. 每轮结束必须先写 `artifacts/session-N-summary.md`，再更新 `memory.md`
6. Session 之间必须 fresh session 切换，不得在同一上下文里直接连跑
7. Session 9 必须覆盖：
   - 冬季低湿球自然冷却样例
   - 过渡季混合模式样例
   - 夏季高负荷 N+1 样例
   - 最小流量风险样例
   - 热回收不可用样例
   - 传感器缺数样例
8. Session 10 必须完成文档收尾，并将 `memory.md` 收口到 `done`

## 推荐验证路径

```bash
./scripts/reset-demo-TSMC-fab-cus.sh
```

其中：

- `./scripts/reset-demo-TSMC-fab-cus.sh` 负责把本 demo 收回到 Session 0 干净基线

如需查看旧外部 driver 行为，只能使用归档脚本：

```bash
python3 ./scripts/archived/run-vibecoding-loop.py demo/TSMC-fab-chiller-strategy --action inspect --json
```

## 期望输出

下一次完整测试完成后，至少应新增：

- `artifacts/session-1-summary.md` 到 `artifacts/session-10-summary.md`
- 对应的 `outputs/session-specs/session-N-spec.json`
- `outputs/session-logs/vibecoding-loop.jsonl`

当前仓库中的这些目录已经保留为干净起点，不应把历史文件继续当作新基线。
