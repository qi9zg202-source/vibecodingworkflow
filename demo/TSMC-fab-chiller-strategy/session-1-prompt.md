工作目录切到 __PROJECT_ROOT__

本次只做 Session 1。

目标：
- 搭建四大业务区域骨架：
  - Operations Overview
  - Strategy Workbench
  - Approval & Execution
  - Audit & Evidence
- 提供最小可运行入口和业务导航结构

限制：
- 不实现复杂收益算法
- 不接真实 BMS / historian / 审批系统

测试 Gate：
- 页面骨架存在
- 四大工作区导航结构可验证
- 模块边界与 `PRD.md` / `work-plan.md` 对齐

memory 更新：
- `last_completed_session: 1`
- `next_session: 2`
- `next_session_prompt: session-2-prompt.md`
- `session_gate: ready`
