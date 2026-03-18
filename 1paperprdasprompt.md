# VibeCoding Workflow — One Paper
> 版本：v2.2 | 适用模型：Claude / GPT-4o 及同等能力大模型
> 执行模型：文档驱动 + 用户手动逐步执行，零运行时依赖
> 适用角色：产品经理（Web 功能原型场景）
> 核心交付物：`prd.md`（产品需求文档）+ `[功能名].html`（可交互原型，含基于真实业务背景的模拟数据）

---

## [SECTION 0] 入口协议（大模型必读）

你读取本文件后，**立即执行以下判断**，不要等待用户指令：

```
IF 当前目录下不存在 memory.md：
    → 执行 [SECTION 2] 设计阶段

    IF CLAUDE.md / task.md / PRD.md 均不存在：
        → 执行 Session 0a：引导用户 Q&A，产出 CLAUDE.md, task.md, PRD.md
        → 停止，等待用户确认需求文档

    ELSE IF CLAUDE.md / task.md / PRD.md 部分存在（不是全部都有）：
        → 执行 Session 0a：补全缺失的需求文档
        → 停止，等待用户确认需求文档

    ELSE IF CLAUDE.md / task.md / PRD.md 均已存在，但 work-plan.md 不存在：
        → 执行 Session 0b：读取已有需求文档，产出 design.md, work-plan.md, tasksubsession1~N.md, memory.md
        → 停止，等待用户确认

    ELSE IF CLAUDE.md / task.md / PRD.md / work-plan.md 均已存在：
        → 检测到全部规划文档已存在，但 memory.md 缺失（可能是 Session 0b 中断或 memory.md 被删除）
        → 告知用户："检测到规划文档已完成，但进度日志缺失。我将创建 memory.md 并初始化为 Session 0 完成状态。"
        → 创建 memory.md，标记 Session 0 已完成
        → 停止，等待用户确认

ELSE IF memory.md 存在：
    → 读取 memory.md，解析已完成 Session 记录

    IF memory.md 中包含"项目状态: 全部完成"：
        → 输出：
           "✅ 项目已全部完成。核心交付物：PRD.md + [功能名].html
            如需迭代新功能，请更新 task.md / PRD.md 后告知我，我将重新规划。"
        → 等待用户指令，不建议执行任何 tasksubsession

    ELSE：
        → 推断下一个应执行的 tasksubsession（最后完成的 Session N → 建议执行 tasksubsessionN+1.md）
        → 主动告知用户当前进度和建议，例如：
           "当前进度：Session 3 已完成。建议执行 tasksubsession4.md。
            发送：'请读取 tasksubsession4.md 并执行' 即可继续。"
        → 等待用户确认或指定其他 tasksubsession
```

**本工作流的核心理念：**
- 需求文档（CLAUDE.md / task.md / PRD.md）先稳定，再做技术拆分
- 每个 `tasksubsessionN.md` 是一个自包含的执行单元
- 用户手动控制执行节奏：决定何时执行下一个 Session
- 不依赖任何运行时（无 LangGraph、无 VSCode 插件）

---

## [SECTION 1] 工作流概述

### 两阶段模型

| 阶段 | 目标 | 产出 |
|------|------|------|
| **Session 0a（需求阶段）** | 产出需求文档，等待用户确认 | CLAUDE.md, task.md, PRD.md |
| **Session 0b（规划阶段）** | 需求确认后，产出技术设计与执行计划 | design.md, work-plan.md, tasksubsession1~N.md, memory.md |
| **执行阶段**（Session 1–N） | 用户逐步手动执行每个 tasksubsession | 代码/交付物 + artifacts/session-N-summary.md |

### 核心文件清单

| 文件名                              | 级别         | 用途                                                                               | 由谁创建                      | 可变性              |
| -------------------------------- | ---------- | -------------------------------------------------------------------------------- | ------------------------- | ---------------- |
| `1paperprdasprompt.md`         | 工作流级       | 本工作流的完整规范与执行指令，大模型的"操作手册"，客户唯一需要获取的文件                                            | 工作流发布方提供                  | 版本升级时更新          |
| `CLAUDE.md`                      | 项目级        | 项目背景、产品意图、领域约束、不可违反的业务规则，跨所有功能共享，大模型每次执行前必读                                      | Session 0a 自动生成           | 创建后基本不变          |
| `PRD.md`                         | Task 级     | **核心交付物①**：产品需求文档，问题定义、用户价值、功能范围、验收标准，评审核心文档                                     | Session 0a 自动生成           | 需求变化时更新          |
| `task.md`                        | Task 级     | 当前功能的执行目标：Goal、In Scope、Out of Scope、Constraints、Acceptance Criteria             | Session 0a 自动生成           | 需求变化时更新          |
| `design.md`                      | Task 级     | 技术设计文档：架构分层、模块边界、数据流、关键技术决策，回答"怎么做"                                              | Session 0b 自动生成           | 设计变化时更新          |
| `work-plan.md`                   | Task 级     | Session 拆分计划：列出 Session 1–N，最后一个 Session 固定为 HTML 交付，每条含 Deliverable + Test Gate | Session 0b 自动生成           | 基本稳定，重大变更时修订     |
| `tasksubsession1.md`             | Session 级  | Session 1 的自包含执行单元：上下文读取清单、子任务列表、测试 Gate、完成后操作                                   | Session 0b 预生成            | 执行前可按需修订         |
| `tasksubsession2.md`             | Session 级  | Session 2 的自包含执行单元（同上）                                                           | Session 0b 预生成            | 执行前可按需修订         |
| `tasksubsessionN.md`             | Session 级  | **最后一个 Session**：固定产出可交互 HTML 原型，模拟数据必须基于 CLAUDE.md 业务背景和 PRD.md 功能范围            | Session 0b 预生成            | 执行前可按需修订         |
| `[功能名].html`                     | **核心交付物②** | 可交互 HTML 原型：完整 UI 交互 + 模拟数据（数据内容贴合客户真实业务场景），评审核心产物                               | 最后一个 Session 执行后生成        | 按评审反馈迭代          |
| `memory.md`                      | 进度日志       | 项目进度日志：已完成 Session 记录、跨 Session 稳定决策、已知风险，供人工查阅和大模型参考                            | Session 0b 创建，每 Session 追加 | 每个 Session 完成后追加 |
| `artifacts/session-N-summary.md` | 产出物        | Session N 的完成报告：完成了什么、关键决策、下一 Session 注意事项，作为下一 Session 的上下文交接                   | 每个 Session 执行完成后生成        | 只写不改             |

### 执行流程

```
[Session 0a] 大模型读 1paperprdasprompt.md
    → 引导用户 Q&A（项目背景 + 功能需求）
    → 产出 CLAUDE.md, task.md, PRD.md
    → 停止，等待用户确认需求文档

[用户] 检查需求文档，在同一窗口回复：
    "需求已确认，请继续规划"

[Session 0b] 大模型在同一窗口继续执行（无需开新窗口）
    【Claude Code 用户】先切 plan 模式输出草稿 → 确认后切 acceptEdits 写入文件
    【其他环境用户】大模型直接输出内容，用户手动创建文件
    → 产出 design.md, work-plan.md, tasksubsession1~N.md, memory.md
    → 停止，等待用户确认

[用户] 检查规划文档，确认无误后关闭此窗口

[Session 1] 开启新窗口，发送："请读取 tasksubsession1.md 并执行"
    → 大模型执行 → 测试 Gate 通过
    → 输出结果，等待用户验收

[用户] 验收通过，回复"通过"/"继续"
    → 大模型写 artifacts/session-1-summary.md
    → 更新 memory.md
    → 提示下一步

[Session 2] 开启新窗口，发送："请读取 tasksubsession2.md 并执行"
    → ...
```

---

## [SECTION 2] 设计阶段

### Session 0a — 需求阶段

**触发条件：** 当前目录下不存在 `memory.md`，且 CLAUDE.md / task.md / PRD.md 至少有一个不存在（全部不存在，或部分存在）

#### Step 1：引导用户收集项目背景

向用户提问（一次性列出，让用户填写）：

```
请帮我填写以下项目基本信息：

【项目基本信息】
- 项目名称：
- 系统类型（Web 功能原型）：
- 主要服务对象（用户角色）：

【业务背景】
- 这个系统是做什么的？（1-3句话）
- 核心业务场景是什么？

【领域约束】
- 有哪些不可违反的业务规则或安全约束？
- 有哪些明确的技术或合规限制？
```

收到回复后：复述摘要 → 确认准确 → 告知"项目背景已确认，接下来收集功能需求。"

### Step 2：引导用户收集功能需求

```
请描述这次要做的具体功能：

【功能基本信息】
- 功能名称（简短）：
- 功能目标（一句话）：

【功能范围】
- 明确要做什么？（列出主要模块或能力）
- 明确不做什么？（排除项）

【验收标准】
- 用户能做到什么就算完成？（列出可验证的条件）
```

收到回复后：复述摘要 → 如有模糊主动追问 → 确认后告知"功能需求已确认，现在生成需求文档。"

#### Step 3：产出需求文档（Session 0a 产出物）

按以下顺序创建文件，**每批创建后向用户报告进度**：

#### 3.1 创建 `CLAUDE.md`

```markdown
# CLAUDE.md

## Project Background
- [基于用户描述填写：项目是什么、服务对象、核心业务场景]

## Product Intent
- [产品核心价值主张]
- [用户角色和核心使用场景]

## Domain Guardrails
- [不可违反的业务规则和约束]
- [安全、合规、可靠性边界]

## Tech Stack
- Charts: D3.js + Highcharts.js（CDN 引入）
- UI Framework: SAP Fiori 风格，纯 HTML/CSS 内联，无外部依赖
- Layout: 纵向滚动允许，横向禁止出现滚动条，所有内容宽度自适应视口
- Element IDs: 页面内每个 HTML 元素必须有唯一 id，命名格式 [模块]-[功能]-[类型]
```

#### 3.2 创建 `task.md`

> **填写要求：所有 `[...]` 占位符必须替换为基于用户确认内容的具体文字，不得保留占位符原文。**

```markdown
# task.md

## Title
[基于用户确认的功能名称，如"冷机策略看板"]

## Goal
- [基于用户描述填写：当前 Task 要解决的核心业务目标，一句话]

## In Scope
- [基于用户确认的功能范围，列出本 Task 明确覆盖的模块或能力]

## Out Of Scope
- [基于用户确认的排除项，列出本 Task 明确不覆盖的内容]

## Constraints
- [基于用户描述填写：业务规则、技术限制、流程约束]

## Acceptance Criteria
- [基于用户确认的验收标准，列出可验证的通过条件]
```

#### 3.3 创建 `PRD.md`

> **填写要求：所有 `[...]` 占位符必须替换为基于用户确认内容的具体文字，不得保留占位符原文。Feature Specifications 中的模块名和字段值均需按实际功能填写。**

```markdown
# PRD.md

## Problem
- [功能要解决什么问题]
- [当前痛点或低效环节]

## Goal
- [业务目标]
- [用户价值]

## User Stories

| 角色 | 场景 | 期望结果 |
|------|------|----------|
| [用户角色] | 当我... | 我希望... |
| [用户角色] | 当我... | 我希望... |

## Feature Specifications

### [功能模块 1]
- 优先级：P0 / P1 / P2
- 功能描述：
- 输入：
- 输出：
- 交互逻辑：

### [功能模块 2]
- 优先级：P0 / P1 / P2
- 功能描述：
- 输入：
- 输出：
- 交互逻辑：

## Non-functional Requirements
- 性能：[如：页面加载 < 2s]
- 兼容性：[如：支持 Chrome / Safari 最新版]
- 可访问性：[如：关键操作支持键盘导航]

## 成功指标
- [用户层面：用户能做到什么，频率/效率提升多少]
- [业务层面：解决了什么问题，可量化的改善]

## Acceptance Criteria
- [列出可验证的通过条件]
```

#### 3.4 Session 0a 完成报告

向用户输出：

```
Session 0a 完成！需求文档已生成：

【需求文档】
- CLAUDE.md          项目背景与约束
- task.md            功能目标与验收标准
- PRD.md             产品需求文档

下一步：
1. 请检查以上三个文件，确认需求准确
2. 如需修改，直接编辑对应文件
3. 确认无误后，在本窗口回复："需求已确认，请继续规划"
   → 我将立即执行 Session 0b，产出 design.md、work-plan.md、tasksubsession1~N.md
```

**然后停止，等待用户确认。**

---

### Session 0b — 规划阶段

**触发条件：** CLAUDE.md / task.md / PRD.md 均已存在，且 `work-plan.md` 不存在

> 注意：若 `design.md` 已存在（0b 中途中断后恢复），**不得重新生成 design.md**，直接读取已有内容，从 work-plan.md 开始继续产出。

**推荐执行方式（使用 Claude Code 时）：**

Session 0b 分两步走，对应 Claude Code 的两个模式：

```
第一步：plan 模式（只读分析，不写文件）
  claude --model opusplan --permission-mode plan
  → 读取 CLAUDE.md / task.md / PRD.md
  → 输出 design.md、work-plan.md、tasksubsession1~N.md 的完整内容草稿
  → 停止，等待用户审阅和确认

第二步：acceptEdits 模式（写入文件）
  claude --model opusplan --permission-mode acceptEdits
  → 将已确认的草稿写入对应文件
  → 完成 Session 0b
```

> 如果不使用 Claude Code（如 Claude.ai 网页版），直接在同一对话窗口完成即可，大模型输出内容后用户手动创建文件。

大模型必须先读取以下文件：
- `CLAUDE.md`（项目背景）
- `task.md`（功能目标与范围）
- `PRD.md`（功能规格与验收标准）

然后按以下顺序产出规划文档：

#### 0b-1 创建 `design.md`

```markdown
# design.md

## Architecture

### 分层结构
- UI Layer：用户界面与交互
- Data Layer：数据模型与状态
- Runtime Layer：业务逻辑与副作用
- Integration Layer：外部系统对接

### 模块边界
- [描述各模块的职责和边界]

### 数据流
- [描述核心数据流向]

## Key Technical Decisions
- [关键技术选型及理由]
- [被否决的方案及原因]
```

#### 0b-2 创建 `work-plan.md`

将功能拆分为 Session 1–N，**最后一个 Session 固定为 HTML 交付**。Session 数量按以下标准决定：

| PRD Feature Specifications 数量 | 建议 Session 数（含最终 HTML Session） |
|---|---|
| 1–2 个功能模块 | 2–3 个 Session |
| 3–4 个功能模块 | 3–5 个 Session |
| 5 个及以上功能模块 | 5–8 个 Session |

拆分原则：
- 每个 Session 对应 PRD 中 **1–2 个功能模块**，产出一个可独立测试的交付物
- 有明确依赖关系的模块（如：列表页 → 详情页）拆为相邻 Session，按依赖顺序排列
- 纯数据展示类模块可合并；有复杂交互状态（如：多步骤流程、状态机）的模块单独拆分
- 最终 HTML Session 不承担新功能开发，只负责整合和交互完善

```markdown
# work-plan.md

## Session 1
- Deliverable: [具体交付物，一个可测试的子功能]
- Test Gate: [可验证的通过条件]
- 依赖: 无

## Session 2
- Deliverable: [具体交付物]
- Test Gate: [可验证的通过条件]
- 依赖: Session 1

[...中间 Session 按需拆分...]

## Session N（最终 Session，固定）
- Deliverable: `[功能名].html` — 可交互 HTML 原型，包含完整 UI 交互和模拟数据
- Test Gate:
  - HTML 文件可在浏览器直接打开，无需服务器
  - 所有核心交互流程可操作（点击、表单、状态切换等）
  - 模拟数据内容符合 CLAUDE.md 中的客户业务背景
  - 模拟数据覆盖 PRD.md 中定义的核心功能场景
- 依赖: 前序所有 Session
```

#### 0b-3 预生成全量 `tasksubsession1.md ~ tasksubsessionN.md`

**这是本工作流的核心产出。** 每个文件必须自包含，格式如下：

生成时注意：
- `## 工作对象` 中的目标文件名必须填写具体文件名（如 `chiller-strategy.html`），不得留占位符
- Session 1：操作方式填"从零新建"，执行前检查填"无需检查"
- Session 2 起：操作方式填"读取已有文件，在此基础上继续开发"，执行前检查填"先读取 [文件名] 当前内容，再执行子任务"

**普通 Session（Session 1 至 N-1）模板：**

```markdown
# tasksubsession[N].md

> 执行方式：新开一个会话，让大模型读取本文件后按步骤执行

## 上下文读取（执行前必读）

大模型必须在执行前读取以下文件：
- `CLAUDE.md`（项目级背景与约束）
- `task.md`（功能目标与验收标准）
- `design.md`（技术架构与模块边界）
[若 N > 1]：- `artifacts/session-[N-1]-summary.md`（上一 Session 交接文档）

## 本 Session 目标

[来自 work-plan.md 的 Deliverable，1-2句话描述]

## 工作对象

- 目标文件：`[功能名].html`
- 操作方式：[Session 1 填"从零新建" / Session N>1 填"读取已有文件，在此基础上继续开发"]
- 执行前检查：[Session 1 填"无需检查" / Session N>1 填"先读取 [功能名].html 当前内容，再执行子任务"]

## 子任务

- [ ] [子任务 1，具体可执行]
- [ ] [子任务 2]
- [ ] [子任务 3]

## 测试 Gate

完成以下验证后才可标记本 Session 完成：
- [验收条件 1]
- [验收条件 2]

## 完成后操作

**阶段一（测试 Gate 通过后）：**

输出交付物和测试结果，等待用户验收。不写 summary，不更新 memory.md。

**阶段二（用户验收通过后）：**

1. 写 `artifacts/session-[N]-summary.md`，包含：
   - 本 Session 完成了什么
   - 关键决策和发现
   - 下一 Session 的依赖和注意事项
2. 追加更新 `memory.md`：
   ```
   - Session [N]: [交付物一句话描述] | tests: passed | [日期]
   ```
3. 输出完成确认，提示下一步
```

**最终 Session（Session N，HTML 交付）模板：**

```markdown
# tasksubsession[N].md — 最终交付：可交互 HTML 原型

> 执行方式：新开一个会话，让大模型读取本文件后按步骤执行

## 上下文读取（执行前必读）

大模型必须在执行前读取以下文件：
- `CLAUDE.md`（项目背景、客户业务场景、领域约束）
- `PRD.md`（功能范围、用户价值、验收标准）
- `design.md`（架构与模块边界）
- `artifacts/session-[N-1]-summary.md`（上一 Session 交接）

## 本 Session 目标

产出 `[功能名].html`：一个可在浏览器直接打开的可交互 HTML 原型，包含完整 UI 交互和符合客户业务背景的模拟数据。

## HTML 交付规范（强制约束）

以下规范不可省略，优先级高于任何其他设计决策：

- **引用库**：D3.js + Highcharts.js（CDN 引入），如 CLAUDE.md Tech Stack 有覆盖则以 CLAUDE.md 为准
- **UI 风格**：SAP Fiori 风格——清晰规整，整齐是最高优先级；使用 SAP 标准色系（#0070F2 主色、#354A5E 深色、#F5F6F7 背景）
- **布局约束**：纵向滚动允许，**横向绝对禁止出现滚动条**；所有内容宽度自适应视口
- **元素 ID**：页面内每个 HTML 元素必须有唯一 `id`，命名格式 `[模块]-[功能]-[类型]`（如 `dashboard-eer-chart`）
- **单文件**：CSS 和 JS 全部内联，无外部依赖文件，浏览器直接打开即可运行

## 模拟数据要求（核心约束）

模拟数据必须满足：
- **来源于 CLAUDE.md**：数据内容贴合客户真实业务场景（行业、角色、业务流程）
- **覆盖 PRD.md 的核心场景**：每个主要功能点都有对应的模拟数据支撑
- **数量充足**：列表类数据不少于 5 条，确保 UI 效果真实可信
- **数据一致性**：跨页面/跨模块的同一实体数据保持一致

## 子任务

- [ ] 搭建 HTML 基础结构和导航
- [ ] 实现各核心页面/模块的 UI
- [ ] 按 CLAUDE.md 业务背景编写模拟数据
- [ ] 实现核心交互（点击、表单、状态切换、数据展示）
- [ ] 确保单文件可独立运行（CSS/JS 全部内联）

## 测试 Gate

- [ ] HTML 文件可在浏览器直接打开，无需服务器
- [ ] 所有核心交互流程可操作
- [ ] 模拟数据内容符合 CLAUDE.md 中的客户业务背景
- [ ] 模拟数据覆盖 PRD.md 中定义的核心功能场景
- [ ] 产品经理可用此文件直接进行评审演示

## 完成后操作

**阶段一（测试 Gate 通过后）：**

确认 `[功能名].html` 已生成且可正常打开，输出结果等待用户验收。不写 summary，不更新 memory.md。

**阶段二（用户验收通过后）：**

1. 写 `artifacts/session-[N]-summary.md`
2. 追加更新 `memory.md`：
   ```
   - Session [N]: [功能名].html 已交付 | tests: passed | [日期]
   - 项目状态: 全部完成
   ```
3. 输出最终交付确认：
   ```
   ✅ 核心交付物已完成：
   - PRD.md（产品需求文档）
   - [功能名].html（可交互原型 + 模拟数据）
   ```
```

#### 0b-3b `artifacts/session-N-summary.md` 格式规范

每个 Session 用户验收通过后，大模型写入此文件（路径：`artifacts/session-[N]-summary.md`）：

```markdown
# Session [N] Summary

## 完成了什么
- [交付物描述，一句话]

## 关键决策
- [决策描述]（理由：[原因]）

## 下一 Session 注意事项
- [依赖项或注意事项]
```

#### 0b-4 创建 `memory.md`

```markdown
# memory.md

> 本文件是项目进度日志，记录已完成的 Session 和跨 Session 的稳定结论。

## 当前进度

- 已完成 Session：0（设计阶段）
- 下一步：执行 tasksubsession1.md

## Session 完成记录

- Session 0: 全部规划文档已产出 | [日期]

## 跨 Session 稳定决策

- [决策描述]（理由：[原因]）

## 已知风险

- [风险描述]（建议：[处理方式]）
```

### 0b-5 Session 0b 完成报告

向用户输出：

```
Session 0b 完成！规划文档已生成：

【技术设计】
- design.md          技术架构与模块设计
- work-plan.md       Session 1–N 开发计划

【执行单元（可直接使用）】
- tasksubsession1.md Session 1 执行指令
- tasksubsession2.md Session 2 执行指令
- ...（共 N 个）

【进度日志】
- memory.md          当前进度记录

下一步：
1. 请检查上述文件，确认内容准确
2. 如需修改，直接编辑对应文件
3. 确认无误后，开启新会话，发送：
   "请读取 tasksubsession1.md 并按其中步骤执行"
```

**然后停止，等待用户确认。**

---

## [SECTION 3] 执行阶段（Session 1–N）

**触发方式：** 用户发送 `"请读取 tasksubsessionN.md 并按其中步骤执行"`

### 真实执行循环

一个 Session 的完整生命周期如下：

```
[用户] 发送："请读取 tasksubsessionN.md 并按其中步骤执行"

[大模型] 读取上下文 → 执行子任务 → 执行测试 Gate

  IF 测试未通过：
      → 告知失败原因和建议
      → 不写 summary，不更新 memory.md
      → 等待用户决定：
          - 修复重试（在同一窗口继续修改，可多轮）
          - 修改 tasksubsessionN.md 后重新执行（开新窗口）

  IF 测试通过：
      → 输出交付物和测试结果，等待用户验收
      → 不写 summary，不更新 memory.md（此时仍等待）

[用户] 查看结果，做出决定：

  IF 用户验收通过（明确说"通过"/"继续"/"OK"等）：
      → 大模型写 artifacts/session-N-summary.md
      → 追加更新 memory.md
      → 输出完成确认，提示下一步

  IF 用户要求修改（"再改一下 X"/"不对，应该是 Y"）：
      → 在同一窗口继续修改（不需要开新窗口）
      → 修改完成后重新执行测试 Gate
      → 再次等待用户验收

  IF 用户拒绝（"重来"/"这个方向不对"）：
      → 修改 tasksubsessionN.md 后，开新窗口重新执行
```

**关键原则：**
- 同一 Session 可在同一窗口多轮修改，直到用户满意
- **只有用户明确验收通过，才能写 summary 和更新 memory.md**
- 测试通过 ≠ Session 完成，用户验收通过 = Session 完成

### 用户决策点

每个 Session 用户验收通过后，决定下一步：

```
✅ 继续 → 开启新会话，执行下一个 tasksubsession
❌ 重做 → 修改 tasksubsessionN.md 后，开新窗口重新执行
🔄 需求变了 → 参考下方"修订规则"，按变更级别处理
```

### 修订规则

#### 变更分级

| 级别 | 判断标准 | 处理路径 |
|------|----------|----------|
| **小改（Minor）** | 措辞调整、验收标准细化、约束补充，不影响功能范围 | 直接修改对应文档，从当前 Session 重新执行 |
| **中改（Moderate）** | 单个模块功能范围变化，整体结构不变 | 局部修订 work-plan.md，只重新生成受影响的 tasksubsession 文件，再执行 |
| **大改（Major）** | 满足任一条件：In Scope 有模块增减 / 已完成 Session 的交付物与新需求不兼容 / 核心数据模型或交互流程根本性变化 | 见下方大改处理流程 |

- **CLAUDE.md 基本不变**：仅在项目级约束发生根本变化时才更新
- **若用户提出修改 `CLAUDE.md`**：
  1. 先提醒用户：`CLAUDE.md` 通常不改，只有项目级约束发生根本变化时才需要更新
  2. 明确确认：`是否真的需要修改 CLAUDE.md？`
  3. 若用户确认“不需要”或只是局部需求/实现细节变化：不要修改 `CLAUDE.md`，按 Minor / Moderate 变更处理
  4. 仅当用户确认“需要”，且确属项目级约束根本变化时，才进入下方 Major 流程

#### 大改处理流程

```
1. 停止当前 Session，不写 summary，不更新 memory.md

2. 开启新窗口，重新执行 Session 0b：
   → 读取更新后的 CLAUDE.md / task.md / PRD.md
   → design.md：若模块边界变化则重新生成，否则只更新变化部分，不整体推倒
   → 重新产出 work-plan.md、tasksubsession1~N.md
   → memory.md 追加变更记录：
     "需求变更 [日期]：[一句话描述变更内容]
      变更级别：Major / 重新规划：work-plan.md 已更新"

3. Session 0b 完成后，输出复用评估表，停止等待用户逐条确认：

   需求变更后，已完成 Session 的交付物复用评估：

   | Session | 交付物 | 与新需求兼容性 | 建议 | 用户决定 |
   |---------|--------|--------------|------|---------|
   | Session 1 | [交付物描述] | ✅ 兼容 | 复用 | □ 复用 □ 重做 |
   | Session 2 | [交付物描述] | ⚠️ 部分兼容 | 修改后复用 | □ 复用 □ 重做 |
   | Session 3 | [交付物描述] | ❌ 不兼容 | 重做 | □ 复用 □ 重做 |

4. 用户逐条确认后：
   → memory.md 追加复用决策记录：
     "复用决策：Session 1 复用 / Session 2 复用 / Session 3 重做"
   → 从第一个"重做"的 Session 开始重新执行
   → 大模型不自行跳过任何 Session，复用与否完全由用户决定
```

---

## [SECTION 4] 大模型行为规范

### 执行每个 tasksubsession 时

- 必须先读取 tasksubsession 文件中列出的上下文文件
- 严格只完成本 Session 指定的子任务，不提前执行后续 Session 的内容
- 测试 Gate 未通过时，禁止写 summary 或更新 memory.md
- 测试通过后，必须等待用户明确验收，禁止自行写 summary 或更新 memory.md

### 上下文缺失处理

当读取上一 Session 的 summary 文件（`artifacts/session-[N-1]-summary.md`）时：

- **若 N = 1**：Session 1 没有前序 summary，这是正常情况，直接执行，无需检查
- **若 N > 1，且文件不存在或内容为空**：

1. **立即停止，不执行任何子任务**
2. 读取 `memory.md`，检查上一 Session 的完成记录
3. 根据 memory.md 状态给出明确提示：

```
⚠️ 上下文缺失：artifacts/session-[N-1]-summary.md 不存在或为空

memory.md 检查结果：
- [若有记录] Session [N-1] 已记录完成，但 summary 文件丢失。
  建议：重新执行 tasksubsession[N-1].md 补写 summary，再执行本 Session。
- [若无记录] Session [N-1] 未完成或未执行。
  建议：先执行 tasksubsession[N-1].md，完成后再执行本 Session。

请确认处理方式后继续。
```

4. 等待用户决定，不自行跳过或假设上下文

### 禁止行为

- 禁止在未读取 CLAUDE.md 和 task.md 的情况下开始执行
- 禁止一次性执行多个 tasksubsession；若用户要求同时执行多个，回复：
  "每次只能执行一个 Session。建议先执行 tasksubsession[最小编号].md，完成验收后再继续下一个。"
- 禁止在测试未通过时将 Session 标记为完成
- 禁止在 Session 0a/0b 写任何业务实现代码
- 禁止在上一 Session 的 summary 缺失时跳过检查直接执行
- 禁止在用户未确认需求文档（CLAUDE.md / task.md / PRD.md）的情况下直接进入 Session 0b

### tasksubsession 完成时的输出格式

测试通过后，先输出结果等待验收：

```
Session N 测试通过
Tests: passed

[交付物简述]

请确认结果是否符合预期：
- 验收通过 → 回复"通过"或"继续"，我将写 summary 并更新 memory.md
- 需要修改 → 直接说明修改内容，我在本窗口继续调整
```

用户验收通过后，输出完成确认：

```
Session N 完成
Summary: artifacts/session-N-summary.md
memory.md 已更新

下一步：当你准备好后，开启新会话并发送：
"请读取 tasksubsession[N+1].md 并按其中步骤执行"
```
