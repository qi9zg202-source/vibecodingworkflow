# design.md

## Goal
- 定义一个更贴近真实 Fab CUS 业务的策略工作台设计基线
- 明确运行监控、策略建议、审批执行和审计追踪的模块边界
- 为下一次完整 workflow 测试提供可执行的 Session 切分和验证标准

## Standard Workflow

开发前必须完成两步对齐：

1. **对齐项目背景**
   - Fab CUS 边界：中温环路、低温环路、热回收协同
   - 核心负荷：PCW、MAU、一般 HVAC、工艺侧特殊负荷
   - 运行边界：供回水温、最小流量、N+1、稳态观察窗口
   - 结果写入 `CLAUDE.md`

2. **对齐功能需求**
   - 目标用户、业务场景、闭环目标、验收标准、测试基线
   - 结果写入 `task.md` + `PRD.md`

完成 Session 0 文档后，进入 Session 循环：

- 每轮从 `startup-prompt.md` 重新进入
- `memory.md` 决定当前 Session
- 每个 Session 只完成一个可测试 deliverable
- 每轮通过测试后写 `artifacts/session-N-summary.md`
- 再更新 `memory.md` 并切换 fresh session

## Execution Model

```text
Project
└── CLAUDE.md
    └── Task
        ├── task.md
        ├── PRD.md
        ├── design.md
        ├── work-plan.md
        ├── memory.md
        ├── startup-prompt.md
        ├── session-N-prompt.md
        ├── artifacts/session-N-summary.md
        └── outputs/session-logs + outputs/session-specs
```

## Business Architecture

### 1. Operations Overview
- 当前负荷、台数、供回水温、湿球条件、能效指标
- 当前边界占用情况：N+1、最小流量、热回收可用性、告警摘要
- 值班视角入口：现在能不能动、哪里有风险、有哪些待审批动作

### 2. Baseline & Constraints
- 按时间窗口划分基线段：白天高负荷、夜间低负荷、周末低负荷、季节切换时段
- 每个基线段记录：
  - 负荷范围
  - 功率范围
  - 湿球 / 环境条件
  - 约束与备注
- 约束对象至少包括：
  - 供回水温边界
  - 最小流量
  - 机组最少运行台数
  - N+1 冗余
  - 热回收回路可用性

### 3. Strategy Workbench
- 策略包列表
- 策略包详情
- 工况匹配结果
- ROI 范围、节能区间、风险等级、回退条件
- 推荐策略包示例：
  - 冬季自然冷却优先
  - 过渡季混合模式
  - 夏季高负荷机组排序优化
  - 热回收协同
  - 温差恢复 / 流量优化

### 4. Approval & Execution
- 审批单
- 下发记录
- 执行反馈
- 稳态观察窗口
- 回退记录
- 关闭结论

### 5. Audit & Evidence
- 角色权限
- 审计日志
- 风险检查结果
- 业务验证样例
- Session summary / session spec / loop log

## Domain Objects

### Baseline Segment
- `segment_id`
- `time_window`
- `season_tag`
- `baseline_cooling_load_kwh`
- `baseline_power_kwh`
- `wet_bulb_range`
- `constraints`
- `notes`

### Constraint Profile
- `supply_temp_min/max`
- `return_temp_min/max`
- `min_flow`
- `reserve_mode`
- `heat_recovery_available`
- `process_side_risk`

### Strategy Package
- `package_id`
- `package_name`
- `target_loop`
- `season_window`
- `load_window`
- `applicable_conditions`
- `expected_roi_range`
- `expected_kwh_saving_range`
- `risk_level`
- `fallback_plan`

### Approval Ticket
- `ticket_id`
- `strategy_package_id`
- `requested_by`
- `approver`
- `risk_summary`
- `decision`
- `decision_time`

### Execution Record
- `execution_id`
- `strategy_package_id`
- `dispatch_window`
- `operator`
- `actual_actions`
- `feedback`
- `stabilization_window`
- `stabilization_result`
- `rollback_flag`
- `rollback_reason`

### Audit Log
- `log_id`
- `entity_type`
- `entity_id`
- `action`
- `actor`
- `before_state`
- `after_state`
- `timestamp`
- `comment`

## Validation Strategy

### Workflow Validation
- startup 入口必须固定
- session handoff 必须来自 `memory.md`
- 任何 session 未通过测试不得推进

### Business Validation
- 至少覆盖冬季 / 过渡季 / 夏季三类业务样例
- 至少覆盖三类高风险边界：
  - N+1 不足
  - 最小流量风险
  - 传感器缺数 / 热回收不可用

### Delivery Validation
- 每个 Session 交付物必须可审查
- 任何策略建议都必须包含适用工况、收益范围、风险和回退方案
- 任何执行闭环都必须有审批、反馈、稳态验证和审计痕迹

## Rules
- 不输出不可回退的自动控制方案
- 不绕过人工审批
- 不牺牲可靠性换取表面节能
- 每轮 Session 只完成一个明确 deliverable
- 不允许沿用旧 artifacts / logs 作为新一轮完整测试的起始状态
