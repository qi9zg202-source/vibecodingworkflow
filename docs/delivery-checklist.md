# VibeCoding Workflow 客户交付清单

> 版本：v2.7 | 交付日期：2026-03-20

---

## 客户交付入口

| 文件 | 类型 | 用途 | 客户操作 |
|------|------|------|----------|
| **1paperprdasprompt.md** | 必需 | 工作流完整规范，大模型的"操作手册"，也是唯一必需交付物 | 放入项目目录，让 Codex/Claude 读取 |
| **docs/user-guide.md** | 可选参考 | 用户手册，含完整示例和常见问题 | 需要示例或 FAQ 时阅读 |

**客户真正开始使用只需 `1paperprdasprompt.md` 这一个文件。**
`docs/user-guide.md` 仅作为培训、示例和 FAQ 参考，不属于运行或初始化依赖。

---

## 质量保证

### 回归测试覆盖

- 测试用例总数：**64 个**
- 覆盖率：**100%**
- 失败项：**0**
- 阻断项：**0**

### 测试范围

| Session | 覆盖能力 | 用例数 | 状态 |
|---------|----------|--------|------|
| R1 | 入口协议与终态分流 | 7 | ✅ passed |
| R2 | Session 0a 需求问卷、背景校核与文档产出 | 11 | ✅ passed |
| R3 | Session 0b 规划文档与 tasksubsession 生成 | 13 | ✅ passed |
| R4 | 执行阶段行为、上下文缺失处理、验收流程 | 18 | ✅ passed |
| R5 | HTML 交付规范与修订规则 | 16 | ✅ passed |
| R6 | 总验收与归档 | 1 | ✅ passed |

详细测试报告：[artifacts/1paperprdasprompt-regression/final-regression-report.md](../artifacts/1paperprdasprompt-regression/final-regression-report.md)

---

## v2.2 核心能力

### 1. 需求大改处理流程

**场景：** Session 执行中发现 PRD.md 需要大幅调整（In Scope 模块增减、核心流程根本变化）

**能力：**
- 自动重新执行 Session 0b，产出新规划
- 输出复用评估表，逐条评估已完成 Session 的兼容性
- 用户逐条确认后，只重做标记为"重做"的 Session，其余复用

**测试覆盖：** TC-MOD-05 ~ TC-MOD-08

---

### 2. CLAUDE.md 修改确认机制

**场景：** 用户提出修改 CLAUDE.md

**能力：**
- Agent 先提醒"CLAUDE.md 通常不改，只有项目级约束发生根本变化时才需要更新"
- 明确确认"是否真的需要修改 CLAUDE.md？"
- 只有用户确认"需要"且确属项目级约束根本变化时，才进入大改流程
- 如果只是局部需求或实现细节变化，按小改/中改处理，不修改 CLAUDE.md

**测试覆盖：** 1paperprdasprompt.md line 922–927

---

### 3. 项目完成终态识别

**场景：** memory.md 中包含"项目状态: 全部完成"

**能力：**
- Agent 读取 memory.md 后识别终态，输出项目完成提示
- 不再建议执行不存在的后续 tasksubsession
- 提示用户"如需迭代新功能，请更新 task.md / PRD.md 后告知我，我将重新规划"

**测试覆盖：** TC-E-06

---

## 关键修复点（相比 v2.1）

| 缺口 | 修复内容 | 影响范围 |
|------|----------|----------|
| 入口协议终态分支 | memory.md 含"项目状态: 全部完成"时有独立分支 | 入口协议 line 38–42 |
| task.md / PRD.md 模板 | 补了显式填写指令，占位符改为带说明格式 | Session 0a Step 3.2、3.3 |
| 多 Session 禁止行为 | 补了拒绝时的标准回复格式 | SECTION 4 禁止行为 line 999–1000 |
| 需求大改旁路 | 新增三级变更分级 + 大改处理流程 + 复用评估表 | SECTION 3 修订规则 line 912–956 |

---

## 使用前提

| 项目 | 要求 |
|------|------|
| 大模型 | Claude Sonnet 4.6 / GPT-4o 或同等能力模型 |
| 执行环境 | 任意支持文件读写的 AI 对话环境（Claude Code / Claude.ai / Cursor / Windsurf 等） |
| 运行时依赖 | 无（零依赖，单文件交付） |
| 适用角色 | 产品经理（Web 功能原型场景） |

---

## 核心交付物示例

基于真实业务场景（TSMC Fab 厂务平台 — 制冷机房优化策略管理）：

| 交付物 | 内容 | 用途 |
|--------|------|------|
| **PRD.md** | 问题定义、用户价值、功能范围、验收标准 | 产品评审核心文档 |
| **task.html** | 可交互 HTML 原型，含基于 TSMC 业务背景的模拟数据（机组列表、策略包、EER 趋势、执行记录等），且 CSS / JS / HTML 全部内联 | 演示核心产物，可直接浏览器打开或分发评审 |

示例文件位置：`demo/TSMC-fab-chiller-strategy/`

---

## 客户支持

### 文档索引

| 文档 | 用途 |
|------|------|
| [user-guide.md](user-guide.md) | 用户手册，含完整示例和常见问题 |
| [1paperprdasprompt.md](../1paperprdasprompt.md) | 工作流完整规范（大模型必读） |
| [tests/test-1paperprdasprompt.md](../tests/test-1paperprdasprompt.md) | 测试用例文档（64 个用例） |
| [final-regression-report.md](../artifacts/1paperprdasprompt-regression/final-regression-report.md) | 回归测试报告 |

### 常见问题快速索引

- **Q: 我需要提前准备什么？** → [user-guide.md 常见问题](user-guide.md#常见问题)
- **Q: 每个 Session 必须开新对话窗口吗？** → [user-guide.md 常见问题](user-guide.md#常见问题)
- **Q: 需求中途变了怎么办？** → [user-guide.md 需求大改处理流程](user-guide.md#需求大改处理流程v22-新增)
- **Q: 最终 HTML 的模拟数据从哪里来？** → [user-guide.md 常见问题](user-guide.md#常见问题)

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v2.7 | 2026-03-20 | Session 0a 新增 Step 0（目录初始化 + 等待客户资料）；Step 1 问卷自动扫描 `customer_context/` 预填文件列表 |
| v2.4 | 2026-03-19 | 对外交付口径收敛为”唯一必需文件是 `1paperprdasprompt.md`”，`docs/user-guide.md` 改为可选参考资料 |
| v2.3 | 2026-03-19 | 固定最终评审产物为 `task.html`，要求 CSS / JS / HTML 资源全部内联；通过 64 个用例回归测试 |
| v2.2 | 2026-03-18 | 新增需求大改处理流程、CLAUDE.md 修改确认机制、项目完成终态识别；通过 64 个用例回归测试 |
| v2.1 | 2026-03-15 | 初始版本，基础工作流能力 |

---

## 交付确认

- [x] 唯一必需交付物已准备：1paperprdasprompt.md
- [x] 可选参考资料已准备：user-guide.md
- [x] 回归测试已通过：64/64 用例，覆盖率 100%
- [x] 示例文件已验证：demo/TSMC-fab-chiller-strategy/
- [x] 文档索引已完整：用户手册、规范文档、测试报告
- [x] 版本号已更新：v2.4

**可交付给客户。**
