# VibeCoding VSCode Extension

VSCode 扩展是 VibeCoding 工作流的 IDE 集成层，提供可视化 Dashboard、状态栏、Runner 控制和 **HITL 验收按钮**，但**不拥有 workflow 真相**——所有状态来源仍是 `memory.md` 和 Python driver。

---

## 整体架构

```
VSCode Extension (UI Layer)
    │
    ├── Activity Bar Sidebar → 迷你启动器（Open Dashboard 按钮）
    ├── Dashboard Webview Panel → 全屏控制台
    ├── Status Bar → 实时显示 session/gate 状态
    └── Commands → 触发 inspect / prepare / runner / 验收操作
         │
         ▼
Python Driver (run-vibecoding-loop.py)
         │
         ▼
memory.md / session-N-prompt.md（workflow 真相）
         │
         ▼
Claude CLI（执行 Session 工作）
```

---

## 安装与配置

### 前提

- VSCode ≥ 1.85
- Python ≥ 3.9（用于执行 driver）
- `run-vibecoding-loop.py` 已在本地可用

### 配置项

打开 VSCode 设置（`Cmd+,`），搜索 `vibeCoding`：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `vibeCoding.pythonPath` | `python3` | Python 可执行路径 |
| `vibeCoding.driverPath` | `""` | `run-vibecoding-loop.py` 的绝对路径（留空则用内置默认路径） |
| `vibeCoding.defaultProjectRoot` | `""` | workflow 项目根目录（留空自动用当前 workspace）|
| `vibeCoding.runnerCommandTemplate` | `""` | fresh session 启动命令模板（用于 `--action run`）|

---

## UI 组件

### Activity Bar Sidebar — 迷你启动器

点击 Activity Bar 的 VibeCoding 图标打开侧边栏，侧边栏显示一个 **Open Dashboard** 按钮。点击后在编辑器区域打开全屏 Dashboard Webview Panel。

### Dashboard Webview Panel — 全屏控制台

Dashboard 是主要操作界面，包含以下区域：

**顶栏（Top Bar）**
- 左：VibeCoding 品牌标识
- 中：Phase pill、Gate pill、Runner 状态 pill
- 右：**Debug** 按钮（点击展开/收起调试信息面板，显示 `sessionGate`、`projectRoot`、`result` 等状态）

**HITL 验收 Banner（核心功能）**

| `session_gate` | Banner 颜色 | 可操作按钮 |
|---------------|------------|-----------|
| `pending_review` | 琥珀色 | ✅ 批准，推进下一 Session / ❌ 驳回 |
| `blocked` | 红色 | 🔄 重新开放本 Session |

- **✅ 批准**：直接将 `memory.md` 中的 `session_gate` 改为 `ready`，无需手动编辑文件
- **❌ 驳回**：弹出输入框填写驳回原因，自动写入 `review_notes` 并将 `session_gate` 改为 `blocked`
- **🔄 重新开放**：将 `session_gate` 重置为 `ready`，允许重新执行本 Session

**进度统计行**
- 已完成 Session / 共 N 个（含进度条）
- 下一个 Session 编号和 prompt 文件名
- 工作流总数
- 完成百分比

**调度驱动器卡片**
- 当前进程信息（PID、启动时间、运行时长、心跳）
- 启动 / 停止 / killpid 控制按钮

**双面板：工作流列表 + Session 时间线**
- 左：所有 workflow 项目列表，可切换选中
- 右：Session prompt 文件列表，含完成状态、时间、打开按钮

### Status Bar（底部状态栏）

| 显示 | 含义 |
|------|------|
| `Vibe: idle` | 未检测到项目或尚未刷新 |
| `Vibe: S3 \| ready` | Session 3 待执行，gate = ready |
| `Vibe: S3 \| pending_review` | Session 3 完成，等待人工验收 |
| `Vibe: S3 \| blocked` | Session 3 被拒绝或遇到阻塞 |
| `Vibe: S3 \| running` | Runner 正在执行 Session 3 |
| `Vibe: done` | 全部 Session 完成 |

鼠标悬停状态栏可查看完整 tooltip：`status`、`session_gate`、`next_session`、`next_session_prompt`、`last_completed_session_tests` 等。

---

## 命令列表

通过命令面板（`Cmd+Shift+P`）搜索 `VibeCoding`：

| 命令 | 作用 |
|------|------|
| `VibeCoding: Open Dashboard` | 打开全屏 Webview 控制台 |
| `VibeCoding: Refresh Workflow Status` | 调用 `driver inspect`，读取 `memory.md`，刷新 UI |
| `VibeCoding: Open Memory` | 在编辑器中打开 `memory.md` |
| `VibeCoding: Open Startup Prompt` | 打开 `startup-prompt.md` |
| `VibeCoding: Open Next Session Prompt` | 打开当前 `next_session` 对应的 `session-N-prompt.md` |
| `VibeCoding: Prepare Fresh Session` | 调用 `driver prepare`，生成 `session-N-spec.json` |
| `VibeCoding: Start Runner In Terminal` | 在集成终端启动 `driver --action run`（持续驱动循环）|
| `VibeCoding: Open Loop Log` | 查看 `outputs/session-logs/vibecoding-loop.jsonl` |
| `VibeCoding: Configure Python Driver Path` | 快速跳转到 `driverPath` 设置项 |

> Dashboard Banner 按钮对应内部命令 `vibeCoding.approveSession` / `vibeCoding.rejectSession`，无需手动触发，点击 Banner 按钮即可。

---

## 使用流程（HITL 循环）

### 1. 初始化：Refresh Workflow Status

打开项目后先执行一次 Refresh，扩展调用 `driver inspect`，解析 `memory.md` 并更新状态栏和 Dashboard。

> **注意**：`session_gate` 直接从 `memory.md` 读取，无需等待 driver 调用。Dashboard 打开即可看到当前验收状态。

### 2. 检查 session_gate

Dashboard 顶栏 Gate pill 和 Banner 会同步显示当前状态：

| gate 状态 | Dashboard 表现 | 下一步操作 |
|-----------|--------------|-----------|
| `ready` | 无 Banner | 执行 Prepare Fresh Session |
| `pending_review` | **琥珀色 Banner + 验收按钮** | 审核后点击批准或驳回 |
| `blocked` | **红色 Banner + 重新开放按钮** | 查看 `review_notes`，修复后点击重新开放 |
| `in_progress` | Gate pill 显示执行中 | 等待 Runner 完成 |
| `done` | Gate pill 显示已完成 | 全部流程结束 |

### 3. 准备并执行 Session

```
Prepare Fresh Session
  → driver prepare → 写 outputs/session-specs/session-N-spec.json
  → Open Next Session Prompt（查看本次要做什么）
  → Start Runner In Terminal（驱动 Claude CLI 执行 Session）
```

Runner 启动后，终端会显示 Claude CLI 的执行过程。Session 完成后 Claude 会：
- 写 `artifacts/session-N-summary.md`
- 写 `artifacts/session-N-manifest.json`
- 更新 `memory.md`，设 `session_gate = pending_review`

### 4. 人工验收（HITL Review Gate）

Dashboard 顶栏变为 **Gate: 待验收** pill，同时展示**琥珀色验收 Banner**：

```
┌─────────────────────────────────────────────────────────┐
│ ⏸  等待人工验收 — Session 已完成                          │
│    请检查产出物和代码变更，确认无误后批准推进，或驳回并填写原因 │
│    [ ✅ 批准，推进下一 Session ]  [ ❌ 驳回 ]              │
└─────────────────────────────────────────────────────────┘
```

**验收通过：**
1. 阅读 `artifacts/session-N-summary.md`
2. 检查代码变更
3. 点击 **✅ 批准，推进下一 Session**
4. 扩展自动将 `memory.md` 中 `session_gate` 改为 `ready`，刷新 Dashboard

**验收拒绝：**
1. 点击 **❌ 驳回**
2. 在弹出的输入框中填写驳回原因
3. 扩展自动写入 `review_notes` 并将 `session_gate` 改为 `blocked`
4. 下一轮 Claude 执行时会读取 `review_notes`，针对性修复

**重新开放（blocked 状态）：**
- 红色 Banner 显示 **🔄 重新开放本 Session**，点击后 `session_gate` 重置为 `ready`

### 5. 完整循环图

```
Refresh → 检查 gate
  ↓ ready
Prepare Fresh Session → Start Runner
  ↓ 执行完成
session_gate = pending_review
  ↓ Dashboard 显示琥珀色 Banner
  ✅ 点击批准 → session_gate = ready → next_session = N+1 → 回到 Refresh
  ❌ 点击驳回 + 填写原因 → session_gate = blocked → review_notes 已写入
       ↓ 修复后点击重新开放
       session_gate = ready → 重做本 Session → 回到 Refresh
```

---

## Runner 状态持久化

Runner 状态保存在：

```
<project-root>/.vibecoding/runner-state.sqlite
```

重启 VSCode 后扩展会自动从 SQLite 恢复 runner 状态（`starting` / `running` / `paused`）。

---

## 与 Python Driver 的契约

扩展通过 `pythonDriver.ts` 调用 driver，driver 以 `--json` 返回结构化结果，扩展校验以下必填字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `schema_version` | string | 契约版本 |
| `status` | string | `ready` / `blocked` / `invalid` / `done` / `runner_failed` |
| `message` | string | 人类可读的状态描述 |
| `requested_action` | string | 请求的 action（`inspect` / `prepare` / `run`）|
| `effective_action` | string | 实际执行的 action |
| `project_root` | string | 项目绝对路径 |
| `exit_code` | number | driver 退出码 |
| `artifacts` | object | 产出文件路径 |
| `next_action` | object | 扩展/用户的下一步建议 |

> `session_gate` 直接从 `memory.md` 读取（无需 driver 调用），Dashboard 初始化时即可显示正确的验收状态和 Banner。

字段校验失败会显示 `Vibe: invalid` 并输出错误到 Output Channel（`VibeCoding Workflow`）。

---

## 扩展开发 & 更新（修改源码后如何生效）

VSCode 加载的是已安装目录（`~/.vscode/extensions/`）中的编译产物，**直接修改源码不会自动生效**。每次修改 TypeScript 源码后，必须执行以下两步：

### 第一步：编译并同步

在仓库根目录执行一键脚本：

```bash
./integrations/vibecoding-vscode-extension/build-and-sync.sh
```

脚本做了两件事：
1. 在 `vscode-ext/` 目录执行 `tsc -p ./`，将 TypeScript 编译为 `out/` 目录下的 JS
2. 将 `out/` 同步到 `~/.vscode/extensions/beckliu.vibecoding-vscode-extension-0.1.10/out/`

输出示例：
```
▶ Compiling...
▶ Syncing to ~/.vscode/extensions/beckliu.vibecoding-vscode-extension-0.1.10...
✅ Done. Reload VSCode window to apply changes.
```

### 第二步：Reload VSCode Window

在 VSCode 中执行：

```
Cmd+Shift+P → Developer: Reload Window
```

Reload 后扩展重新加载，新代码立即生效。

---

> **注意**：如果扩展版本号升级（`package.json` 中的 `version` 字段变更），需要同步更新 `build-and-sync.sh` 中的目标路径：
> ```bash
> VSCODE_EXT=~/.vscode/extensions/beckliu.vibecoding-vscode-extension-<新版本号>
> ```

---

## 相关文档

- [workflow-standard.md](workflow-standard.md) — 工作流整体架构和层次职责
- [progress-loop.md](progress-loop.md) — Session 循环和 HITL Review Gate 详细规范
- [hitl-review-gate.md](hitl-review-gate.md) — 人工验收机制说明
- [user-guide.md](user-guide.md) — 手动使用工作流（不依赖扩展）的完整指南
