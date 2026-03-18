import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { cancelWorkflowRunViaLangGraph, doesLangGraphThreadExist, getLangGraphDaemonInfo, getLangGraphServerConfig, inspectWorkflowViaLangGraph, LangGraphIntegrationError, LangGraphServerProbeResult, probeLangGraphServer, resolveLangGraphThreadId, resumeWorkflowRunViaLangGraph, startWorkflowRunViaLangGraph } from './driver/langgraphDriver';
import { DriverResult, LangGraphDaemonInfo } from './driver/driverTypes';
import {
    DASHBOARD_SIDEBAR_VIEW_ID,
    DashboardIssue,
    DashboardRunnerProcessInfo,
    DashboardRunnerState,
    DashboardState,
    DashboardWorkflowSummary,
    WorkflowDashboardPanel,
    WorkflowDashboardViewProvider,
} from './ui/dashboard';
import { StateDisplay, resolveDominantSessionGate, resolveSessionTimelineDisplay } from './ui/sessionStateMachine';
import {
    SessionRuntimeInspection,
    SessionRuntimeInspectorPanel,
    SessionRuntimeLatestAttempt,
} from './ui/sessionRuntimeInspector';
import {
    SessionHistoryLocation,
    SessionStudioTarget,
} from './ui/sessionHistory';
import {
    LangGraphManagerPanel,
    LangGraphManagerState,
    LangGraphSessionNodeState,
} from './ui/langGraphManager';
import { WorkflowStatusBar } from './ui/statusBar';
import { openFileInEditor } from './workspace/fileOpeners';
import { detectWorkflowProject, discoverWorkflowProjects, getConfiguredProjectRoot, WorkflowDiscovery, WorkflowProject } from './workspace/workflowDetector';
import { resolveLegacyRunnerStateDbPath, resolveRunnerStateDbPath, RunnerStateStore } from './storage/runnerStateStore';

const EXTENSION_OUTPUT_CHANNEL = 'VibeCoding Workflow';

type VibeCodingCommand =
    | 'vibeCoding.openDashboard'
    | 'vibeCoding.refreshWorkflowStatus'
    | 'vibeCoding.openMemory'
    | 'vibeCoding.openStartupPrompt'
    | 'vibeCoding.openNextSessionPrompt'
    | 'vibeCoding.prepareFreshSession'
    | 'vibeCoding.startRunnerInTerminal'
    | 'vibeCoding.openLoopLog'
    | 'vibeCoding.configureLangGraphServerUrl';

type InternalVibeCodingCommand =
    | 'vibeCoding.selectWorkflow'
    | 'vibeCoding.openWorkflowFileAtPath'
    | 'vibeCoding.openSessionRuntimeInspector'
    | 'vibeCoding.openSessionStudio'
    | 'vibeCoding.selectLangGraphSessionNode'
    | 'vibeCoding.refreshWorkflowStatusForRoot'
    | 'vibeCoding.runStartupFlow'
    | 'vibeCoding.prepareAndOpenNextSessionPrompt'
    | 'vibeCoding.activateWorkflowRunner'
    | 'vibeCoding.pauseWorkflowRunner'
    | 'vibeCoding.resumeWorkflowRunner'
    | 'vibeCoding.cancelWorkflowRunner'
    | 'vibeCoding.killWorkflowRunner'
    | 'vibeCoding.approveSession'
    | 'vibeCoding.rejectSession'
    | 'vibeCoding.reopenSession';

const COMMANDS: ReadonlyArray<{ id: VibeCodingCommand; label: string }> = [
    { id: 'vibeCoding.openDashboard', label: 'Open Dashboard' },
    { id: 'vibeCoding.refreshWorkflowStatus', label: 'Refresh Workflow Status' },
    { id: 'vibeCoding.openMemory', label: 'Open Memory' },
    { id: 'vibeCoding.openStartupPrompt', label: 'Open Startup Prompt' },
    { id: 'vibeCoding.openNextSessionPrompt', label: 'Open Next Session Prompt' },
    { id: 'vibeCoding.prepareFreshSession', label: 'Prepare Fresh Session' },
    { id: 'vibeCoding.startRunnerInTerminal', label: 'Start Runner In Terminal' },
    { id: 'vibeCoding.openLoopLog', label: 'Open Loop Log' },
    { id: 'vibeCoding.configureLangGraphServerUrl', label: 'Configure LangGraph Server URL' },
];

let outputChannel: vscode.OutputChannel | undefined;
let statusBar: WorkflowStatusBar | undefined;
let dashboardViewProvider: WorkflowDashboardViewProvider | undefined;
let latestInspectResult: { projectRoot: string; result: DriverResult } | undefined;
let latestDashboardState: DashboardState = {};
let activeWorkflowRoot: string | undefined;
let activeSessionInspectorTarget: { workflowRoot: string; filePath: string; label: string } | undefined;
let activeLangGraphManagerTarget: { workflowRoot: string; selectedSessionNumber: number | null } | undefined;
let runnerStateStore: RunnerStateStore | undefined;
const runnerStateByWorkflow = new Map<string, DashboardRunnerState>();
const runnerTerminalByWorkflow = new Map<string, vscode.Terminal>();
const runnerProcessByWorkflow = new Map<string, DashboardRunnerProcessInfo>();
let workflowRefreshInFlight = false;
type RunnerProcessDisposition = 'active' | 'shell_idle' | 'dead' | 'unknown';

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel(EXTENSION_OUTPUT_CHANNEL);
    statusBar = new WorkflowStatusBar();
    const persistenceWorkspaceRoot = resolvePersistenceWorkspaceRoot();
    runnerStateStore = RunnerStateStore.create(context, persistenceWorkspaceRoot);
    hydrateRunnerStateFromStore(persistenceWorkspaceRoot);
    const langGraphConfig = getLangGraphServerConfig();
    dashboardViewProvider = new WorkflowDashboardViewProvider(latestDashboardState, async (command, args) => {
        await vscode.commands.executeCommand(command, ...(args ?? []));
    }, () => {
        openDashboard();
    });
    outputChannel.appendLine('Session 7 activation complete.');
    outputChannel.appendLine('Refresh, prepare, runner, and review flows use the LangGraph runtime contract.');
    outputChannel.appendLine('Workflow truth remains in memory.md; daemon state is surfaced separately from workflow gate.');
    outputChannel.appendLine('Open Dashboard is available for a dedicated Webview control surface.');
    outputChannel.appendLine('Runner state SQLite path pattern: <workflow-root>/.vibecoding/runner-state.sqlite');
    outputChannel.appendLine(`LangGraph server URL=${langGraphConfig.serverUrl}`);
    outputChannel.appendLine(`Legacy runner state SQLite path: ${resolveLegacyRunnerStateDbPath(context, persistenceWorkspaceRoot) ?? 'n/a'}`);
    statusBar.showIdle();
    void logLangGraphProbe('activation');

    for (const command of COMMANDS) {
        const disposable = vscode.commands.registerCommand(command.id, async (...args: unknown[]) => {
            await handlePlaceholderCommand(command, ...args);
        });
        context.subscriptions.push(disposable);
    }

    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.selectWorkflow', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await selectWorkflow(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.openWorkflowFileAtPath', async (...args: unknown[]) => {
        await openWorkflowFileAtPathCommand(args);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.openSessionRuntimeInspector', async (...args: unknown[]) => {
        await openSessionRuntimeInspectorCommand(args);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.openSessionStudio', async (...args: unknown[]) => {
        await openSessionStudioCommand(args);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.selectLangGraphSessionNode', async (workflowRoot?: unknown, sessionNumber?: unknown) => {
        if (typeof workflowRoot !== 'string') {
            return;
        }
        activeLangGraphManagerTarget = {
            workflowRoot,
            selectedSessionNumber: typeof sessionNumber === 'number' && Number.isFinite(sessionNumber)
                ? sessionNumber
                : null,
        };
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.refreshWorkflowStatusForRoot', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            activeWorkflowRoot = workflowRoot;
            syncDashboardSelection(workflowRoot);
        }
        await refreshWorkflowStatus();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.runStartupFlow', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await runStartupFlow(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.prepareAndOpenNextSessionPrompt', async () => {
        await prepareAndOpenNextSessionPrompt();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.activateWorkflowRunner', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await activateWorkflowRunner(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.pauseWorkflowRunner', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await pauseWorkflowRunner(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.resumeWorkflowRunner', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await resumeWorkflowRunner(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.cancelWorkflowRunner', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await cancelWorkflowRunner(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.killWorkflowRunner', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await killWorkflowRunner(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.approveSession', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await approveSession(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.rejectSession', async (workflowRoot?: unknown) => {
        if (typeof workflowRoot === 'string') {
            await rejectSession(workflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.reopenSession', async (workflowRoot?: unknown) => {
        const resolvedWorkflowRoot = typeof workflowRoot === 'string'
            ? workflowRoot
            : resolveCurrentWorkflow()?.projectRoot;
        if (resolvedWorkflowRoot) {
            await reopenSession(resolvedWorkflowRoot);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vibeCoding.syncAndReload', async () => {
        await syncAndReload();
    }));

    context.subscriptions.push(outputChannel);
    context.subscriptions.push(statusBar);
    context.subscriptions.push(dashboardViewProvider);
    context.subscriptions.push(runnerStateStore);
    registerTerminalLifecycleHandlers(context);
    registerWorkflowStatePolling(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DASHBOARD_SIDEBAR_VIEW_ID, dashboardViewProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    );
    syncDashboardSelection();
}

export function deactivate() {
    outputChannel?.dispose();
    statusBar?.dispose();
    dashboardViewProvider?.dispose();
    runnerStateStore?.dispose();
}

async function handlePlaceholderCommand(command: { id: VibeCodingCommand; label: string }, ..._args: unknown[]) {
    if (command.id === 'vibeCoding.openDashboard') {
        openDashboard();
        return;
    }

    const config = vscode.workspace.getConfiguration('vibeCoding');
    const langGraphServerUrl = config.get<string>('langGraphServerUrl') ?? 'http://localhost:2024';
    const defaultProjectRoot = config.get<string>('defaultProjectRoot') ?? '';

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Command invoked: ${command.id}`);
    outputChannel?.appendLine(`langGraphServerUrl=${langGraphServerUrl}`);
    outputChannel?.appendLine(`defaultProjectRoot=${defaultProjectRoot || '<workspace>'}`);

    if (command.id === 'vibeCoding.configureLangGraphServerUrl') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'vibeCoding.langGraphServerUrl');
        return;
    }

    if (command.id === 'vibeCoding.refreshWorkflowStatus') {
        await refreshWorkflowStatus();
        return;
    }

    if (command.id === 'vibeCoding.openMemory') {
        await openMemory();
        return;
    }

    if (command.id === 'vibeCoding.openStartupPrompt') {
        await openStartupPrompt();
        return;
    }

    if (command.id === 'vibeCoding.openNextSessionPrompt') {
        await openNextSessionPrompt();
        return;
    }

    if (command.id === 'vibeCoding.prepareFreshSession') {
        await prepareFreshSession();
        return;
    }

    if (command.id === 'vibeCoding.startRunnerInTerminal') {
        await startRunnerInTerminal();
        return;
    }

    if (command.id === 'vibeCoding.openLoopLog') {
        await openLoopLog();
        return;
    }

    void vscode.window.showInformationMessage(
        `${command.label} is not implemented yet.`
    );
}

function openDashboard() {
    syncDashboardSelection();

    WorkflowDashboardPanel.createOrShow(latestDashboardState, async (command, args) => {
        await vscode.commands.executeCommand(command, ...(args ?? []));
    });
}

async function selectWorkflow(workflowRoot: string) {
    activeWorkflowRoot = workflowRoot;
    syncDashboardSelection(workflowRoot);
    void vscode.window.showInformationMessage(`Active workflow switched to ${workflowRoot}`);
}

async function runStartupFlow(workflowRoot: string) {
    activeWorkflowRoot = workflowRoot;
    syncDashboardSelection(workflowRoot);
    await openStartupPrompt();
}

async function activateWorkflowRunner(workflowRoot: string) {
    activeWorkflowRoot = workflowRoot;
    syncDashboardSelection(workflowRoot);

    if (getRunnerState(workflowRoot) === 'paused') {
        await resumeWorkflowRunner(workflowRoot);
        return;
    }

    if (getRunnerState(workflowRoot) !== 'idle') {
        void vscode.window.showWarningMessage(`Workflow runner is already ${describeRunnerState(getRunnerState(workflowRoot))}.`);
        return;
    }

    await startRunnerInTerminal();
}

async function pauseWorkflowRunner(workflowRoot: string) {
    activeWorkflowRoot = workflowRoot;
    syncDashboardSelection(workflowRoot);

    const terminal = runnerTerminalByWorkflow.get(workflowRoot);
    if (terminal && getRunnerState(workflowRoot) === 'running') {
        terminal.show(true);
        terminal.sendText('\u001A', false);
        setRunnerState(workflowRoot, 'paused');
        syncRunnerStatusBar(workflowRoot, 'paused');
        outputChannel?.appendLine(`Runner paused for workflow: ${workflowRoot}`);
        void vscode.window.showInformationMessage('Workflow runner paused.');
        return;
    }

    try {
        const inspectResult = await inspectWorkflowForReadPath(workflowRoot);
        latestInspectResult = { projectRoot: workflowRoot, result: inspectResult };
        const runtime = getDriverInputString(inspectResult, 'runtime');
        const runId = getDriverInputString(inspectResult, 'run_id');
        const runStatus = getDriverInputString(inspectResult, 'run_status');
        const isRuntimeActive = runStatus === 'pending' || runStatus === 'running' || inspectResult.status === 'in_progress';

        if (runtime === 'langgraph' && runId && isRuntimeActive) {
            setRunnerState(workflowRoot, 'paused');
            syncRunnerStatusBar(workflowRoot, 'paused', inspectResult);
            await cancelWorkflowRunViaLangGraph(workflowRoot, runId, getLangGraphServerConfig(), 'interrupt');
            outputChannel?.appendLine(`LangGraph run pause requested for workflow: ${workflowRoot}, run_id=${runId}`);
            void vscode.window.showInformationMessage('已向 LangGraph 发送暂停请求。当前 run 已中断，可再次点击“执行”重新提交。');
            await refreshWorkflowStatus();
            return;
        }
    } catch (error) {
        outputChannel?.appendLine(`Pause via LangGraph failed for ${workflowRoot}: ${formatErrorMessage(error)}`);
        void vscode.window.showWarningMessage(`Pause failed: ${formatErrorMessage(error)}`);
        return;
    }

    void vscode.window.showWarningMessage('No running workflow execution is available to pause.');
}

async function resumeWorkflowRunner(workflowRoot: string) {
    const terminal = runnerTerminalByWorkflow.get(workflowRoot);
    if (!terminal || getRunnerState(workflowRoot) !== 'paused') {
        void vscode.window.showWarningMessage('No paused workflow terminal is available to resume.');
        return;
    }

    terminal.show(true);
    terminal.sendText('fg', true);
    setRunnerState(workflowRoot, 'running');
    syncRunnerStatusBar(workflowRoot, 'running');
    outputChannel?.appendLine(`Runner resumed for workflow: ${workflowRoot}`);
    void vscode.window.showInformationMessage('Workflow runner resumed.');
}

async function cancelWorkflowRunner(workflowRoot: string) {
    const terminal = runnerTerminalByWorkflow.get(workflowRoot);
    const runnerState = getRunnerState(workflowRoot);
    const processInfo = runnerProcessByWorkflow.get(workflowRoot);
    if ((runnerState !== 'running' && runnerState !== 'paused') || (!terminal && !processInfo?.pid)) {
        void vscode.window.showWarningMessage('No running workflow terminal is available to cancel.');
        return;
    }

    if (terminal) {
        terminal.show(true);
        terminal.sendText('\u0003', false);
        if ('dispose' in terminal && typeof terminal.dispose === 'function') {
            terminal.dispose();
        }
    } else if (processInfo?.pid) {
        try {
            process.kill(processInfo.pid, 'SIGTERM');
            outputChannel?.appendLine(`Runner PID ${processInfo.pid} received SIGTERM for workflow: ${workflowRoot}`);
        } catch (error) {
            outputChannel?.appendLine(`SIGTERM failed for PID ${processInfo.pid}: ${formatErrorMessage(error)}`);
            void vscode.window.showWarningMessage(`Stop failed: ${formatErrorMessage(error)}`);
            return;
        }
    }
    clearRunnerTracking(workflowRoot);
    outputChannel?.appendLine(`Runner cancelled for workflow: ${workflowRoot}`);
    void vscode.window.showInformationMessage('Workflow runner cancelled.');
}

async function killWorkflowRunner(workflowRoot: string) {
    const terminal = runnerTerminalByWorkflow.get(workflowRoot);
    const runnerState = getRunnerState(workflowRoot);
    const processInfo = runnerProcessByWorkflow.get(workflowRoot);
    if ((runnerState !== 'running' && runnerState !== 'paused' && runnerState !== 'starting') || (!terminal && !processInfo?.pid)) {
        void vscode.window.showWarningMessage('No workflow runner is available to kill.');
        return;
    }

    terminal?.show(true);

    if (processInfo?.pid) {
        try {
            process.kill(processInfo.pid, 'SIGKILL');
            outputChannel?.appendLine(`Runner PID ${processInfo.pid} was killed for workflow: ${workflowRoot}`);
        } catch (error) {
            outputChannel?.appendLine(`Kill failed for PID ${processInfo.pid}: ${formatErrorMessage(error)}`);
            void vscode.window.showWarningMessage(`Kill failed: ${formatErrorMessage(error)}`);
        }
    } else {
        outputChannel?.appendLine(`Runner PID is unavailable for workflow ${workflowRoot}; disposing terminal as fallback.`);
    }

    if (terminal && 'dispose' in terminal && typeof terminal.dispose === 'function') {
        terminal.dispose();
    }
    clearRunnerTracking(workflowRoot);
    void vscode.window.showInformationMessage(processInfo?.pid ? 'Workflow runner killed.' : 'Workflow runner terminal closed because PID was unavailable.');
}

// ─── HITL Review Gate ────────────────────────────────────────────────────────

/**
 * 批准当前 Session：LangGraph 在线时优先走 resume；离线时退回旧的 memory.md 写法。
 */
async function approveSession(workflowRoot: string) {
    const langGraphProbe = await logLangGraphProbe('refresh');
    if (langGraphProbe.ok) {
        await resumeInterruptedRunViaLangGraph(workflowRoot, 'approve');
        return;
    }

    await approveSessionViaMemoryFallback(workflowRoot);
}

/**
 * 驳回当前 Session：LangGraph 在线时优先走 resume；离线时退回旧的 memory.md 写法。
 */
async function rejectSession(workflowRoot: string) {
    const reason = await vscode.window.showInputBox({
        title: '驳回 Session',
        prompt: '请输入驳回原因',
        placeHolder: '例如：测试未通过，缺少边界检查…',
    });
    if (reason === undefined) {
        return;
    }

    const langGraphProbe = await logLangGraphProbe('refresh');
    if (langGraphProbe.ok) {
        await resumeInterruptedRunViaLangGraph(workflowRoot, 'reject', reason);
        return;
    }

    await rejectSessionViaMemoryFallback(workflowRoot, reason);
}

async function reopenSession(workflowRoot: string) {
    try {
        const inspectResult = await getInspectResultForProject(workflowRoot, { forceRefresh: true });
        updateStatusBar(workflowRoot, inspectResult);
        updateDashboardState({
            projectRoot: workflowRoot,
            selectedWorkflowRoot: workflowRoot,
            result: inspectResult,
            issue: null,
            lastUpdatedAt: new Date(),
        });

        const runStatus = getDriverInputString(inspectResult, 'run_status');
        if (runStatus === 'interrupted') {
            void vscode.window.showWarningMessage('当前 Session 仍在等待验收。请先批准或驳回，再决定是否重新开放。');
            return;
        }

        if (inspectResult.status !== 'blocked' || inspectResult.session_gate !== 'blocked') {
            void vscode.window.showWarningMessage(`当前 workflow 不是 blocked 状态，无法重新开放。当前状态：${inspectResult.status}`);
            return;
        }

        const memoryPath = path.join(workflowRoot, 'memory.md');
        let content = fs.readFileSync(memoryPath, 'utf-8');
        if (!/^- session_gate:/m.test(content)) {
            throw new Error(`memory.md is missing session_gate: ${memoryPath}`);
        }

        content = content.replace(/^(- session_gate:\s*).*$/m, '$1ready');
        if (/^- workflow_status:/m.test(content)) {
            content = content.replace(/^(- workflow_status:\s*).*$/m, '$1ready');
        }
        fs.writeFileSync(memoryPath, content, 'utf-8');

        outputChannel?.appendLine(`[reopenSession] session_gate → ready (${memoryPath})`);
        void vscode.window.showInformationMessage('当前 Session 已重新开放。workflow 已回到 ready，可以再次点击“执行”。');
        await refreshWorkflowStatus();
    } catch (error) {
        void vscode.window.showErrorMessage(`重新开放 Session 失败：${formatErrorMessage(error)}`);
    }
}

async function resumeInterruptedRunViaLangGraph(
    workflowRoot: string,
    decision: 'approve' | 'reject',
    reason?: string,
) {
    try {
        const inspectResult = await inspectWorkflowForReadPath(workflowRoot);
        latestInspectResult = { projectRoot: workflowRoot, result: inspectResult };
        const runtime = getDriverInputString(inspectResult, 'runtime');
        const threadId = getDriverInputString(inspectResult, 'thread_id');
        const runId = getDriverInputString(inspectResult, 'run_id');
        const runStatus = getDriverInputString(inspectResult, 'run_status');

        if (runtime !== 'langgraph') {
            throw new Error('Current workflow is not using LangGraph runtime metadata.');
        }
        if (!threadId || !runId) {
            throw new Error('LangGraph inspect result is missing thread_id or run_id. Refresh the workflow status after triggering a run.');
        }
        if (runStatus !== 'interrupted') {
            throw new Error(`LangGraph run is not waiting for HITL review. Current run_status=${runStatus ?? 'unknown'}.`);
        }

        const resumedRun = await resumeWorkflowRunViaLangGraph(
            workflowRoot,
            runId,
            decision,
            decision === 'reject' ? reason ?? null : null,
            getLangGraphServerConfig(),
        );
        outputChannel?.appendLine(
            `[resumeInterruptedRunViaLangGraph] decision=${decision} thread_id=${threadId} run_id=${resumedRun.runId ?? runId} status=${resumedRun.status ?? '<unknown>'}`
        );

        const actionLabel = decision === 'approve' ? '批准' : '驳回';
        void vscode.window.showInformationMessage(
            `Session ${actionLabel}请求已发送到 LangGraph${resumedRun.status ? `（${resumedRun.status}）` : ''}。`,
        );
        await refreshWorkflowStatus();
    } catch (error) {
        void vscode.window.showErrorMessage(`${decision === 'approve' ? '批准' : '驳回'}失败：${formatErrorMessage(error)}`);
    }
}

async function approveSessionViaMemoryFallback(workflowRoot: string) {
    const memoryPath = path.join(workflowRoot, 'memory.md');
    try {
        let content = fs.readFileSync(memoryPath, 'utf-8');
        content = content.replace(/^(- session_gate:\s*).*$/m, '$1ready');
        fs.writeFileSync(memoryPath, content, 'utf-8');
        outputChannel?.appendLine(`[approveSession:legacy] session_gate → ready  (${memoryPath})`);
        void vscode.window.showInformationMessage('Session 已批准，已回退为直接更新 memory.md。');
        await refreshWorkflowStatus();
    } catch (error) {
        void vscode.window.showErrorMessage(`批准失败：${formatErrorMessage(error)}`);
    }
}

async function rejectSessionViaMemoryFallback(workflowRoot: string, reason: string) {
    const memoryPath = path.join(workflowRoot, 'memory.md');
    try {
        let content = fs.readFileSync(memoryPath, 'utf-8');
        content = content.replace(/^(- session_gate:\s*).*$/m, '$1blocked');
        if (/^- review_notes:/m.test(content)) {
            content = content.replace(/^(- review_notes:\s*).*$/m, `$1${reason}`);
        } else {
            content = content.replace(
                /^(- session_gate:.*)$/m,
                `$1\n- review_notes: ${reason}`,
            );
        }
        fs.writeFileSync(memoryPath, content, 'utf-8');
        outputChannel?.appendLine(`[rejectSession:legacy] session_gate → blocked, review_notes="${reason}"  (${memoryPath})`);
        void vscode.window.showWarningMessage('Session 已驳回，已回退为直接更新 memory.md。');
        await refreshWorkflowStatus();
    } catch (error) {
        void vscode.window.showErrorMessage(`驳回失败：${formatErrorMessage(error)}`);
    }
}

function getDriverInputString(result: DriverResult, key: string): string | null {
    const value = result.inputs?.[key];
    return typeof value === 'string' && value.trim() ? value : null;
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Sync & Reload ───────────────────────────────────────────────────────────

/**
 * 执行 build-and-sync.sh（编译 TypeScript + 同步到已安装扩展目录），
 * 完成后提示用户 Reload Window。
 */
async function syncAndReload() {
    // build-and-sync.sh 是源码目录里的开发脚本，必须从 workspace 里查找
    // 不能用 __dirname（那是已安装扩展的 out/ 目录）
    const scriptRelative = path.join('integrations', 'vibecoding-vscode-extension', 'build-and-sync.sh');
    let scriptPath: string | undefined;
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const candidate = path.join(folder.uri.fsPath, scriptRelative);
        if (fs.existsSync(candidate)) {
            scriptPath = candidate;
            break;
        }
    }

    if (!scriptPath) {
        void vscode.window.showErrorMessage(
            `build-and-sync.sh not found. Expected: <workspaceRoot>/${scriptRelative}`
        );
        return;
    }

    void vscode.window.showInformationMessage('⟳ Sync & Reload: building and syncing extension…');

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine('▶ Running build-and-sync.sh...');

    const terminal = vscode.window.createTerminal({
        name: 'VibeCoding: Sync & Reload',
        cwd: path.dirname(scriptPath),
    });
    // preserveFocus=false 让 terminal 获得焦点，用户能直接看到执行过程
    terminal.show(false);
    terminal.sendText(`bash "${scriptPath}" && echo "" && echo "✅ Sync done. Now run: Cmd+Shift+P → Developer: Reload Window"`, true);
}

// ─────────────────────────────────────────────────────────────────────────────

async function openWorkflowFileAtPathCommand(args: unknown[]) {
    const [workflowRoot, filePath, label] = args;
    if (typeof workflowRoot !== 'string' || typeof filePath !== 'string' || typeof label !== 'string') {
        return;
    }

    activeWorkflowRoot = workflowRoot;
    syncDashboardSelection(workflowRoot);

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Opening ${label}: ${filePath}`);

    try {
        await openFileInEditor(filePath, label);
    } catch (error) {
        await reportWorkflowIssue(`Open ${label} failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput'],
        });
    }
}

async function openSessionRuntimeInspectorCommand(args: unknown[]) {
    const [workflowRoot, filePath, label] = args;
    if (typeof workflowRoot !== 'string' || typeof filePath !== 'string' || typeof label !== 'string') {
        return;
    }

    activeWorkflowRoot = workflowRoot;
    activeSessionInspectorTarget = { workflowRoot, filePath, label };
    syncDashboardSelection(workflowRoot);

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Opening Session Runtime Inspector for ${label}: ${filePath}`);

    try {
        const inspection = await buildSessionRuntimeInspection(workflowRoot, filePath, label, { forceRefresh: true });
        SessionRuntimeInspectorPanel.createOrShow(inspection, async (command, commandArgs) => {
            await vscode.commands.executeCommand(command, ...(commandArgs ?? []));
        });
    } catch (error) {
        await reportWorkflowIssue(`Open Session Runtime Inspector failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput'],
        });
    }
}

async function openSessionStudioCommand(args: unknown[]) {
    const [workflowRoot, sessionNumber, rawStudioTarget] = args;
    if (typeof workflowRoot !== 'string') {
        return;
    }
    activeWorkflowRoot = workflowRoot;
    syncDashboardSelection(workflowRoot);

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    const sessionLabel = typeof sessionNumber === 'number' && Number.isFinite(sessionNumber)
        ? `session-${sessionNumber}`
        : 'workflow';
    outputChannel?.appendLine(`Opening LangSmith Studio for ${sessionLabel}: ${workflowRoot}`);

    try {
        const langGraphProbe = await ensureLangGraphServerAvailable('open LangSmith Studio');
        const serverUrl = langGraphProbe.serverUrl ?? latestDashboardState.langGraphServerUrl ?? getLangGraphServerConfig().serverUrl;
        const studioTarget = normalizeSessionStudioTarget(rawStudioTarget);
        if (studioTarget) {
            outputChannel?.appendLine(
                `Historical studio locator: source=${studioTarget.source ?? 'n/a'} thread_id=${studioTarget.threadId ?? 'n/a'} run_id=${studioTarget.runId ?? 'n/a'} checkpoint_id=${studioTarget.checkpointId ?? 'n/a'}`
            );
        }
        const resolvedThreadId = studioTarget?.threadId
            ?? (latestInspectResult?.projectRoot === workflowRoot
                ? getDriverInputString(latestInspectResult.result, 'thread_id') ?? resolveLangGraphThreadId(workflowRoot)
                : resolveLangGraphThreadId(workflowRoot));
        const threadId = await resolveStudioThreadContext(resolvedThreadId, serverUrl);
        const studioUrl = buildLangGraphStudioUrl(serverUrl, threadId);
        const opened = await vscode.env.openExternal(vscode.Uri.parse(studioUrl));
        if (!opened) {
            throw new Error(`VS Code could not open external URL: ${studioUrl}`);
        }
        outputChannel?.appendLine(`Opened LangSmith Studio: ${studioUrl}`);
        if (studioTarget?.runId || studioTarget?.checkpointId) {
            outputChannel?.appendLine(
                `Studio target preserved in extension metadata: run_id=${studioTarget.runId ?? 'n/a'} checkpoint_id=${studioTarget.checkpointId ?? 'n/a'} parent_checkpoint_id=${studioTarget.parentCheckpointId ?? 'n/a'}`
            );
        }
    } catch (error) {
        await reportWorkflowIssue(`Open LangSmith Studio failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput'],
        });
    }
}

async function resolveStudioThreadContext(threadId: string | null | undefined, serverUrl: string): Promise<string | null> {
    if (!threadId) {
        return null;
    }

    const exists = await doesLangGraphThreadExist(threadId, { serverUrl });
    if (exists) {
        return threadId;
    }

    outputChannel?.appendLine(`Opening Studio without thread context because LangGraph thread was not found: ${threadId}`);
    return null;
}

async function buildSessionRuntimeInspection(
    workflowRoot: string,
    filePath: string,
    label: string,
    options?: {
        forceRefresh?: boolean;
        result?: DriverResult;
        workflowSummary?: DashboardWorkflowSummary;
    },
): Promise<SessionRuntimeInspection> {
    const result = options?.result ?? await getInspectResultForProject(workflowRoot, options?.forceRefresh ? { forceRefresh: true } : undefined);
    const workflowSummary = options?.workflowSummary ?? (() => {
        const discovery = discoverWorkflowProjects();
        const workflows = mapDashboardWorkflows(discovery);
        return workflows.find((workflow) => workflow.projectRoot === workflowRoot);
    })();
    const runnerState = getRunnerState(workflowRoot);
    const threadId = getDriverInputString(result, 'thread_id');
    const runId = getDriverInputString(result, 'run_id');
    const runStatus = getDriverInputString(result, 'run_status');
    const rejectionReason = getDriverInputString(result, 'rejection_reason');
    const sessionNumber = parseSessionNumber(filePath) ?? parseSessionNumber(label);
    const nextSessionPromptPath = result.artifacts.next_session_prompt_path ?? '';
    const nextSessionPromptLabel = result.next_session_prompt ?? (nextSessionPromptPath ? basename(nextSessionPromptPath) : '');
    const isNextSession = filePath === nextSessionPromptPath || label === nextSessionPromptLabel;
    const sessionDisplay = buildSessionDisplay(workflowSummary, result, runnerState, label, filePath, isNextSession);
    const isCurrentSession = isCurrentSessionFile(sessionNumber, workflowSummary, result, isNextSession);
    const effectiveSessionGate = resolveDominantSessionGate(result.session_gate, workflowSummary?.sessionGate);
    const summaryPath = resolveSessionArtifactPath(workflowRoot, sessionNumber, 'summary.md');
    const manifestPath = resolveSessionArtifactPath(workflowRoot, sessionNumber, 'manifest.json');
    const latestAttempt = readLatestSessionAttempt(workflowRoot, sessionNumber);
    const studioTarget = latestAttempt ?? buildWorkflowThreadFallbackLocation(workflowRoot, sessionNumber, result);
    const canApprove = isCurrentSession && runStatus === 'interrupted';
    const canReject = canApprove;
    const canRerun = isCurrentSession && result.status === 'ready' && effectiveSessionGate === 'ready';
    const canReopen = isCurrentSession && result.status === 'blocked' && effectiveSessionGate === 'blocked';
    const serverUrl = latestDashboardState.langGraphServerUrl ?? getLangGraphServerConfig().serverUrl;

    return {
        workflowRoot,
        workflowDisplayName: workflowSummary?.displayName ?? basename(workflowRoot),
        filePath,
        fileLabel: label,
        sessionNumber,
        isCurrentSession,
        sessionStatusLabel: sessionDisplay.label,
        sessionStatusDetail: sessionDisplay.detail,
        sessionStatusClass: sessionDisplay.pillClass,
        workflowGate: effectiveSessionGate,
        nextSession: result.next_session,
        nextSessionPrompt: result.next_session_prompt,
        lastCompletedSession: result.last_completed_session,
        lastCompletedSessionTests: result.last_completed_session_tests,
        runnerState,
        threadId,
        runId,
        runStatus,
        rejectionReason,
        langGraphServerUrl: serverUrl,
        studioUrl: buildLangGraphStudioUrl(serverUrl, studioTarget?.threadId ?? threadId),
        memoryPath: path.join(workflowRoot, 'memory.md'),
        summaryPath,
        manifestPath,
        latestAttempt,
        studioTarget,
        canApprove,
        canReject,
        canRerun,
        canReopen,
        actionHint: buildSessionActionHint({
            isCurrentSession,
            sessionNumber,
            nextSession: result.next_session,
            sessionGate: effectiveSessionGate,
            runStatus,
            workflowStatus: result.status,
            runnerState,
        }),
    };
}

async function buildLangGraphManagerState(
    workflowRoot: string,
    selectedSessionNumber: number | null,
    options?: {
        forceRefresh?: boolean;
        result?: DriverResult;
    },
): Promise<LangGraphManagerState> {
    const result = options?.result ?? await getInspectResultForProject(workflowRoot, options?.forceRefresh ? { forceRefresh: true } : undefined);
    const discovery = discoverWorkflowProjects();
    const workflows = mapDashboardWorkflows(discovery);
    const workflowSummary = workflows.find((workflow) => workflow.projectRoot === workflowRoot);
    const effectiveSessionGate = resolveDominantSessionGate(result.session_gate, workflowSummary?.sessionGate);
    const runnerState = getRunnerState(workflowRoot);
    const runnerProcess = runnerProcessByWorkflow.get(workflowRoot);
    const selectedWorkflowFiles = workflowSummary?.files ?? [];
    const sessionFiles = selectedWorkflowFiles
        .filter((file) => file.kind === 'session')
        .sort((left, right) => compareSessionFiles(left.path, right.path));
    const currentSessionNumber = parseNullableInt(result.next_session);

    const nodes: LangGraphSessionNodeState[] = [];
    for (const file of sessionFiles) {
        const inspection = await buildSessionRuntimeInspection(workflowRoot, file.path, file.label, {
            result,
            workflowSummary,
        });
        const timing = resolveNodeTiming(file, inspection, runnerProcess);

        nodes.push({
            workflowRoot,
            filePath: file.path,
            fileLabel: file.label,
            sessionNumber: inspection.sessionNumber,
            isCurrentSession: inspection.isCurrentSession,
            sessionStatusLabel: inspection.sessionStatusLabel,
            sessionStatusDetail: inspection.sessionStatusDetail,
            sessionStatusClass: inspection.sessionStatusClass,
            workflowGate: inspection.workflowGate,
            nextSession: inspection.nextSession,
            lastCompletedSession: inspection.lastCompletedSession,
            runnerState: inspection.runnerState,
            threadId: inspection.threadId,
            runId: inspection.runId,
            runStatus: inspection.runStatus,
            rejectionReason: inspection.rejectionReason,
            startedAtLabel: timing.startedAtLabel,
            endedAtLabel: timing.endedAtLabel,
            durationLabel: timing.durationLabel,
            summaryPath: inspection.summaryPath,
            manifestPath: inspection.manifestPath,
            latestAttempt: inspection.latestAttempt,
            studioTarget: inspection.studioTarget,
            canApprove: inspection.canApprove,
            canReject: inspection.canReject,
            canRerun: inspection.canRerun,
            canReopen: inspection.canReopen,
            actionHint: inspection.actionHint,
        });
    }

    const initialSelectedSessionNumber = selectedSessionNumber
        ?? activeLangGraphManagerTarget?.selectedSessionNumber
        ?? currentSessionNumber
        ?? nodes[0]?.sessionNumber
        ?? null;
    const serverUrl = latestDashboardState.langGraphServerUrl ?? getLangGraphServerConfig().serverUrl;

    return {
        workflowRoot,
        workflowDisplayName: workflowSummary?.displayName ?? basename(workflowRoot),
        totalSessionCount: workflowSummary?.totalSessionCount ?? nodes.length,
        currentSessionNumber,
        selectedSessionNumber: initialSelectedSessionNumber,
        workflowGate: effectiveSessionGate,
        threadId: getDriverInputString(result, 'thread_id'),
        runId: getDriverInputString(result, 'run_id'),
        runStatus: getDriverInputString(result, 'run_status'),
        langGraphServerUrl: serverUrl,
        externalStudioUrl: buildLangGraphStudioUrl(serverUrl, getDriverInputString(result, 'thread_id')),
        nodes,
    };
}

function buildSessionDisplay(
    workflowSummary: DashboardWorkflowSummary | undefined,
    result: DriverResult,
    runnerState: DashboardRunnerState,
    label: string,
    filePath: string,
    isNextSession: boolean,
): StateDisplay {
    return resolveSessionTimelineDisplay({
        file: { label, path: filePath },
        workflow: workflowSummary,
        result,
        runnerState,
        isNextSession,
    });
}

function isCurrentSessionFile(
    sessionNumber: number | null,
    workflowSummary: DashboardWorkflowSummary | undefined,
    result: DriverResult,
    isNextSession: boolean,
): boolean {
    if (isNextSession) {
        return true;
    }
    const workflowNextSession = parseNullableInt(result.next_session) ?? workflowSummary?.nextSession ?? null;
    return sessionNumber !== null && workflowNextSession !== null && sessionNumber === workflowNextSession;
}

function buildSessionActionHint(input: {
    isCurrentSession: boolean;
    sessionNumber: number | null;
    nextSession: string | null;
    sessionGate: string | null;
    runStatus: string | null;
    workflowStatus: DriverResult['status'];
    runnerState: DashboardRunnerState;
}): string {
    if (input.isCurrentSession && input.runStatus === 'interrupted') {
        return '这个 session 对应当前 LangGraph review gate。可以直接验收通过或驳回。';
    }
    if (input.isCurrentSession && input.sessionGate === 'blocked') {
        return '这个 session 目前是 blocked。先处理 review notes 或文档修订，再点击“重新开放当前 Session”让 workflow 回到 ready。';
    }
    if (input.isCurrentSession && (input.runnerState === 'starting' || input.runnerState === 'running' || input.workflowStatus === 'in_progress' || input.sessionGate === 'in_progress')) {
        return '这个 session 正在执行中。当前应先等待 run 完成，再决定验收或重跑。';
    }
    if (input.isCurrentSession && input.sessionGate === 'done') {
        return '这个 workflow 已经完成。历史 session 只保留只读检查，不再支持重跑。';
    }
    if (input.isCurrentSession && input.workflowStatus === 'ready' && input.sessionGate === 'ready') {
        return '这个 session 就是当前 next_session。可以直接重新触发 LangGraph run。';
    }
    if (!input.isCurrentSession && input.sessionNumber !== null && input.nextSession !== null) {
        const nextSession = parseNullableInt(input.nextSession);
        if (nextSession !== null && input.sessionNumber < nextSession) {
            return `这是历史 session。当前 LangGraph thread 已推进到 session-${nextSession}，这里以只读方式展示。`;
        }
        if (nextSession !== null && input.sessionNumber > nextSession) {
            return `这是未来 session。当前 workflow 还没推进到 session-${input.sessionNumber}，因此暂时不能管理这个节点。`;
        }
    }
    return '当前 thread 是 task 级别的 LangGraph runtime。只有当前 next_session 才能直接执行 approve / reject / re-run。';
}

function resolveSessionArtifactPath(workflowRoot: string, sessionNumber: number | null, suffix: 'summary.md' | 'manifest.json'): string | null {
    if (sessionNumber === null) {
        return null;
    }
    const filePath = path.join(workflowRoot, 'artifacts', `session-${sessionNumber}-${suffix}`);
    return fs.existsSync(filePath) ? filePath : null;
}

function readSessionHistoryIndex(workflowRoot: string): Map<number, SessionRuntimeLatestAttempt> {
    const historyIndex = new Map<number, SessionRuntimeLatestAttempt>();
    const loopLogPath = path.join(workflowRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl');
    if (!fs.existsSync(loopLogPath)) {
        return historyIndex;
    }

    const lines = fs.readFileSync(loopLogPath, 'utf-8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        try {
            const payload = JSON.parse(line) as Record<string, unknown>;
            const sessionNumber = parseSessionNumberFromPayload(payload);
            if (sessionNumber === null) {
                continue;
            }

            historyIndex.set(sessionNumber, {
                source: 'loop_log',
                sessionNumber,
                sessionPrompt: asNullablePayloadString(payload.session_prompt) ?? asNullablePayloadString(payload.next_session_prompt),
                threadId: asNullablePayloadString(payload.thread_id),
                runId: asNullablePayloadString(payload.run_id),
                checkpointId: asNullablePayloadString(payload.checkpoint_id),
                parentCheckpointId: asNullablePayloadString(payload.parent_checkpoint_id),
                workflowGate: asNullablePayloadString(payload.session_gate),
                approvalRequired: typeof payload.approval_required === 'boolean' ? payload.approval_required : null,
                approvalDecision: asNullablePayloadString(payload.approval_decision),
                runnerExitCode: payload.runner_exit_code === null || payload.runner_exit_code === undefined
                    ? null
                    : String(payload.runner_exit_code),
                summaryExists: typeof payload.summary_exists === 'boolean' ? payload.summary_exists : null,
                manifestPath: asNullablePayloadString(payload.manifest_path),
                startedAt: asNullablePayloadString(payload.started_at),
                endedAt: asNullablePayloadString(payload.ended_at),
                recordedAt: asNullablePayloadString(payload.recorded_at),
            });
        } catch {
            continue;
        }
    }

    return historyIndex;
}

function readLatestSessionAttempt(workflowRoot: string, sessionNumber: number | null): SessionRuntimeLatestAttempt | null {
    if (sessionNumber === null) {
        return null;
    }
    return readSessionHistoryIndex(workflowRoot).get(sessionNumber) ?? null;
}

function buildWorkflowThreadFallbackLocation(
    workflowRoot: string,
    sessionNumber: number | null,
    result: DriverResult,
): SessionHistoryLocation | null {
    const threadId = getDriverInputString(result, 'thread_id') ?? resolveLangGraphThreadId(workflowRoot);
    if (!threadId) {
        return null;
    }

    return {
        source: 'workflow_thread_fallback',
        sessionNumber,
        sessionPrompt: sessionNumber !== null ? `session-${sessionNumber}-prompt.md` : result.next_session_prompt,
        threadId,
        runId: getDriverInputString(result, 'run_id'),
        checkpointId: null,
        parentCheckpointId: null,
        workflowGate: result.session_gate,
        approvalRequired: null,
        approvalDecision: getDriverInputString(result, 'approval_decision'),
        runnerExitCode: result.runner_exit_code === null || result.runner_exit_code === undefined
            ? null
            : String(result.runner_exit_code),
        summaryExists: null,
        manifestPath: null,
        startedAt: null,
        endedAt: null,
        recordedAt: null,
    };
}

function parseSessionNumberFromPayload(payload: Record<string, unknown>): number | null {
    const explicitSessionNumber = parseNullableInt(payload.session_number);
    if (explicitSessionNumber !== null) {
        return explicitSessionNumber;
    }
    return parseNullableInt(payload.next_session);
}

function asNullablePayloadString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function normalizeSessionStudioTarget(value: unknown): SessionStudioTarget | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const target = value as Record<string, unknown>;
    return {
        source: target.source === 'loop_log' || target.source === 'workflow_thread_fallback'
            ? target.source
            : null,
        sessionNumber: parseNullableInt(target.sessionNumber),
        sessionPrompt: asNullablePayloadString(target.sessionPrompt),
        threadId: asNullablePayloadString(target.threadId),
        runId: asNullablePayloadString(target.runId),
        checkpointId: asNullablePayloadString(target.checkpointId),
        parentCheckpointId: asNullablePayloadString(target.parentCheckpointId),
    };
}

async function refreshSessionRuntimeInspectorIfNeeded(projectRoot?: string) {
    const target = activeSessionInspectorTarget;
    if (!target) {
        return;
    }
    if (projectRoot && target.workflowRoot !== projectRoot) {
        return;
    }

    try {
        const inspection = await buildSessionRuntimeInspection(target.workflowRoot, target.filePath, target.label, {
            result: latestInspectResult?.projectRoot === target.workflowRoot ? latestInspectResult.result : undefined,
        });
        SessionRuntimeInspectorPanel.updateIfOpen(inspection);
    } catch (error) {
        outputChannel?.appendLine(`Session Runtime Inspector refresh skipped: ${formatErrorMessage(error)}`);
    }
}

async function refreshLangGraphManagerIfNeeded(projectRoot?: string) {
    const target = activeLangGraphManagerTarget;
    if (!target) {
        return;
    }
    if (projectRoot && target.workflowRoot !== projectRoot) {
        return;
    }

    try {
        const state = await buildLangGraphManagerState(target.workflowRoot, target.selectedSessionNumber, {
            result: latestInspectResult?.projectRoot === target.workflowRoot ? latestInspectResult.result : undefined,
        });
        LangGraphManagerPanel.updateIfOpen(state);
    } catch (error) {
        outputChannel?.appendLine(`LangGraph manager refresh skipped: ${formatErrorMessage(error)}`);
    }
}

function resolveCurrentWorkflow(): WorkflowProject | null {
    const project = detectWorkflowProject(activeWorkflowRoot);
    if (project) {
        activeWorkflowRoot = project.projectRoot;
        syncDashboardSelection(project.projectRoot);
    }
    return project;
}

function resolvePersistenceWorkspaceRoot(): string | null {
    const workspaceFolder = (vscode.workspace.workspaceFolders ?? [])[0];
    if (workspaceFolder?.uri.fsPath) {
        return workspaceFolder.uri.fsPath;
    }

    return getConfiguredProjectRoot();
}

function hydrateRunnerStateFromStore(workspaceRoot: string | null) {
    if (!runnerStateStore || !workspaceRoot) {
        return;
    }

    const discovery = discoverWorkflowProjects();
    const workflowRoots = discovery?.workflows.map((workflow) => workflow.projectRoot) ?? [];
    for (const projectRoot of workflowRoots) {
        const records = runnerStateStore.loadForProject(projectRoot);
        for (const record of records) {
        if (record.runnerState !== 'idle') {
            runnerStateByWorkflow.set(record.projectRoot, record.runnerState);
        }

        if (record.processInfo) {
            runnerProcessByWorkflow.set(record.projectRoot, record.processInfo);
        }
        }
    }

    latestDashboardState = {
        ...latestDashboardState,
        workspaceRoot,
        runnerStateByWorkflow: getRunnerStateSnapshot(),
        runnerProcessByWorkflow: getRunnerProcessSnapshot(),
    };

    reconcileTrackedRunnerProcesses();
}

function persistRunnerState(projectRoot: string) {
    const workspaceRoot = resolvePersistenceWorkspaceRoot();
    if (!runnerStateStore || !workspaceRoot || !projectRoot) {
        return;
    }

    const processInfo = runnerProcessByWorkflow.get(projectRoot) ?? null;
    runnerStateStore.upsert({
        workspaceRoot,
        projectRoot,
        runnerState: getRunnerState(projectRoot),
        processInfo,
        updatedAtEpochMs: processInfo?.heartbeatAtEpochMs ?? Date.now(),
    });
}

function syncDashboardSelection(preferredWorkflowRoot?: string) {
    const discovery = discoverWorkflowProjects();
    const selectedWorkflow = selectDashboardWorkflow(discovery, preferredWorkflowRoot ?? activeWorkflowRoot);

    if (selectedWorkflow) {
        activeWorkflowRoot = selectedWorkflow.projectRoot;
    }

    updateDashboardState({
        workspaceRoot: discovery?.workspaceRoot,
        workflows: mapDashboardWorkflows(discovery),
        projectRoot: selectedWorkflow?.projectRoot,
        selectedWorkflowRoot: selectedWorkflow?.projectRoot,
        runnerStateByWorkflow: getRunnerStateSnapshot(),
        runnerProcessByWorkflow: getRunnerProcessSnapshot(),
        result: getCachedResultForDashboard(selectedWorkflow?.projectRoot),
        issue: selectedWorkflow?.projectRoot === latestDashboardState.projectRoot ? latestDashboardState.issue ?? null : null,
        lastUpdatedAt: latestDashboardState.lastUpdatedAt ?? new Date(),
    });
}

function selectDashboardWorkflow(
    discovery: WorkflowDiscovery | null,
    preferredWorkflowRoot?: string,
): WorkflowProject | null {
    if (!discovery) {
        return null;
    }

    if (preferredWorkflowRoot) {
        const matchedWorkflow = discovery.workflows.find((workflow) => workflow.projectRoot === preferredWorkflowRoot);
        if (matchedWorkflow) {
            return matchedWorkflow;
        }
    }

    for (const workflow of discovery.workflows) {
        if (getRunnerState(workflow.projectRoot) === 'running' || getRunnerState(workflow.projectRoot) === 'paused') {
            return workflow;
        }
    }

    const inProgressWorkflow = discovery.workflows.find((workflow) => (
        workflow.progress.executionState === 'in_progress'
    ));
    if (inProgressWorkflow) {
        return inProgressWorkflow;
    }

    const detectedWorkflow = detectWorkflowProject(preferredWorkflowRoot);
    if (detectedWorkflow) {
        return detectedWorkflow;
    }

    return discovery.workflows[0] ?? null;
}

function mapDashboardWorkflows(discovery: WorkflowDiscovery | null): DashboardWorkflowSummary[] {
    if (!discovery) {
        return [];
    }

    return discovery.workflows.map((workflow) => {
        const historyIndex = readSessionHistoryIndex(workflow.projectRoot);
        return {
            projectRoot: workflow.projectRoot,
            displayName: workflow.displayName,
            relativePath: workflow.relativePath,
            missingFiles: workflow.missingFiles,
            statusLabel: formatWorkflowStatusLabel(workflow.progress.executionState),
            progressLabel: `${workflow.progress.completedSessionCount}/${workflow.progress.totalSessionCount}`,
            lastCompletedSession: workflow.progress.lastCompletedSession,
            nextSession: workflow.progress.nextSession,
            totalSessionCount: workflow.progress.totalSessionCount,
            sessionGate: workflow.progress.sessionGate ?? null,
            files: [
                { label: 'startup-prompt.md', path: workflow.startupPromptPath, kind: 'startup' as const },
                { label: 'memory.md', path: workflow.memoryPath, kind: 'memory' as const },
                ...workflow.sessionPromptPaths.map((sessionPath) => {
                    const sessionNumber = parseSessionNumber(sessionPath);
                    return {
                        label: basename(sessionPath),
                        path: sessionPath,
                        kind: 'session' as const,
                        sessionNumber: sessionNumber ?? undefined,
                        historyLocation: sessionNumber !== null ? (historyIndex.get(sessionNumber) ?? null) : null,
                        startedAtLabel: formatSessionTime(workflow.sessionTimingBySession[sessionNumber ?? -1]?.startedAt),
                        endedAtLabel: formatSessionTime(workflow.sessionTimingBySession[sessionNumber ?? -1]?.endedAt),
                        durationLabel: formatSessionDuration(workflow.sessionTimingBySession[sessionNumber ?? -1]?.durationMs),
                    };
                }),
            ],
        };
    });
}

function formatWorkflowStatusLabel(executionState: 'not_started' | 'in_progress' | 'done'): string {
    if (executionState === 'done') {
        return '完成';
    }
    if (executionState === 'in_progress') {
        return '执行中';
    }
    return '未执行';
}

function getCachedResultForDashboard(projectRoot: string | undefined): DriverResult | undefined {
    if (!projectRoot) {
        return undefined;
    }

    if (latestInspectResult?.projectRoot === projectRoot) {
        return latestInspectResult.result;
    }

    if (latestDashboardState.projectRoot === projectRoot) {
        return latestDashboardState.result;
    }

    return undefined;
}

async function refreshWorkflowStatus() {
    const project = resolveCurrentWorkflow();
    if (!project) {
        await reportWorkflowIssue('No workspace folder found for VibeCoding workflow detection.', {
            level: 'error',
        });
        return;
    }

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Detected project root: ${project.projectRoot}`);
    const langGraphProbe = await logLangGraphProbe('refresh');

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue(
            `Workflow files are incomplete: ${project.missingFiles.map((filePath) => filePath.split('/').pop()).join(', ')}`,
            {
                level: 'warning',
                details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            }
        );
        return;
    }

    try {
        const result = await inspectWorkflowForReadPath(project.projectRoot, langGraphProbe);
        latestInspectResult = { projectRoot: project.projectRoot, result };
        renderRefreshResult(result);
        updateStatusBar(project.projectRoot, result);
        updateDashboardState({
            projectRoot: project.projectRoot,
            selectedWorkflowRoot: project.projectRoot,
            result,
            issue: null,
            lastUpdatedAt: new Date(),
        });
        reconcileRunnerStateWithRuntime(project.projectRoot, result);
        reconcileRunnerProcess(project.projectRoot, result);
        await refreshSessionRuntimeInspectorIfNeeded(project.projectRoot);
        await refreshLangGraphManagerIfNeeded(project.projectRoot);
    } catch (error) {
        await reportWorkflowIssue(`Refresh Workflow Status failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput', 'openLoopLog'],
        });
    }
}

async function logLangGraphProbe(source: 'activation' | 'refresh'): Promise<LangGraphServerProbeResult> {
    const langGraphConfig = getLangGraphServerConfig();
    const probe = await probeLangGraphServer(langGraphConfig);
    const prefix = source === 'activation' ? 'LangGraph probe on activation' : 'LangGraph probe before refresh';

    if (probe.ok) {
        outputChannel?.appendLine(`${prefix}: online (${probe.serverUrl}, status=${probe.statusCode ?? 200})`);
    } else {
        outputChannel?.appendLine(`${prefix}: offline (${probe.serverUrl})${probe.errorMessage ? ` - ${probe.errorMessage}` : ''}`);
    }

    updateDashboardState({ langGraphServerUrl: probe.serverUrl, langGraphOnline: probe.ok });
    updateDashboardState({ langGraphDaemon: getLangGraphDaemonInfo(langGraphConfig) });
    return probe;
}

async function ensureLangGraphServerAvailable(actionLabel: string): Promise<LangGraphServerProbeResult> {
    let probe = await logLangGraphProbe('refresh');
    if (probe.ok) {
        return probe;
    }

    outputChannel?.appendLine(`LangGraph offline before ${actionLabel} — attempting auto-start...`);
    const started = await autoStartLangGraphServer();
    if (started) {
        probe = await logLangGraphProbe('refresh');
        if (probe.ok) {
            return probe;
        }
    }

    throw new Error(`LangGraph server is not available at ${probe.serverUrl ?? 'unknown'}. Please start the LangGraph server.`);
}

async function inspectWorkflowForReadPath(
    projectRoot: string,
    probe?: LangGraphServerProbeResult,
): Promise<DriverResult> {
    const langGraphProbe = probe ?? await logLangGraphProbe('refresh');
    if (!langGraphProbe.ok) {
        throw new Error(`LangGraph server is not available at ${langGraphProbe.serverUrl ?? 'unknown'}. Please start the LangGraph server.`);
    }
    outputChannel?.appendLine(`Inspecting workflow via LangGraph HTTP state: ${langGraphProbe.serverUrl}`);
    try {
        return await inspectWorkflowViaLangGraph(projectRoot, getLangGraphServerConfig());
    } catch (error) {
        if (!isLangGraphThreadNotFoundError(error)) {
            throw error;
        }

        const workflow = detectWorkflowProject(projectRoot);
        if (!workflow || workflow.projectRoot !== projectRoot || workflow.missingFiles.length > 0) {
            throw error;
        }

        outputChannel?.appendLine(`LangGraph thread not found for ${projectRoot}; using memory.md cold-start fallback until the first run creates the thread.`);
        return buildColdStartInspectResult(workflow, langGraphProbe.serverUrl);
    }
}

function renderRefreshResult(result: DriverResult) {
    outputChannel?.appendLine(`workflow_status=${result.status}`);
    outputChannel?.appendLine(`workflow_gate=${result.session_gate ?? '<null>'}`);
    outputChannel?.appendLine(`next_session=${result.next_session ?? '<null>'}`);
    outputChannel?.appendLine(`next_session_prompt=${result.next_session_prompt ?? '<null>'}`);
    outputChannel?.appendLine(`last_completed_session=${result.last_completed_session ?? '<null>'}`);
    outputChannel?.appendLine(`last_completed_session_tests=${result.last_completed_session_tests ?? '<null>'}`);
    outputChannel?.appendLine(`next_action=${result.next_action.type}: ${result.next_action.message}`);

    const summary = [
        `workflow=${result.status}`,
        `gate=${result.session_gate ?? 'n/a'}`,
        `next=${result.next_session ?? 'n/a'}`,
    ].join(' | ');

    if (result.status === 'ready') {
        void vscode.window.showInformationMessage(`Workflow ready: ${summary}`);
        return;
    }

    if (result.status === 'blocked') {
        void vscode.window.showWarningMessage(`Workflow blocked: ${summary}`);
        return;
    }

    if (result.status === 'done') {
        void vscode.window.showInformationMessage(`Workflow complete: ${summary}`);
        return;
    }

    if (result.status === 'in_progress') {
        void vscode.window.showInformationMessage(`Workflow in progress: ${summary}`);
        return;
    }

    if (result.status === 'invalid') {
        void reportWorkflowIssue(`Workflow returned invalid: ${summary}`, {
            level: 'error',
            actions: ['showOutput', 'openLoopLog'],
        });
        return;
    }

    void vscode.window.showWarningMessage(`Workflow returned ${result.status}: ${summary}`);
}

async function openMemory() {
    await openWorkflowFileByName('memory.md', 'memory.md');
}

async function openStartupPrompt() {
    await openWorkflowFileByName('startup-prompt.md', 'startup-prompt.md');
}

async function openNextSessionPrompt() {
    const project = resolveCurrentWorkflow();
    if (!project) {
        await reportWorkflowIssue('No workspace folder found for VibeCoding workflow detection.', {
            level: 'error',
        });
        return;
    }

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue(
            `Workflow files are incomplete: ${project.missingFiles.map((filePath) => filePath.split('/').pop()).join(', ')}`,
            {
                level: 'warning',
                details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            }
        );
        return;
    }

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Resolving next session prompt for: ${project.projectRoot}`);

    try {
        const result = await getInspectResultForProject(project.projectRoot);
        const nextSessionPromptPath = result.artifacts.next_session_prompt_path;

        if (!nextSessionPromptPath) {
            throw new Error('Driver did not return next_session_prompt_path.');
        }

        await openFileInEditor(nextSessionPromptPath, 'next session prompt');
        outputChannel?.appendLine(`Opened next session prompt: ${nextSessionPromptPath}`);
    } catch (error) {
        await reportWorkflowIssue(`Open Next Session Prompt failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput'],
        });
    }
}

async function openWorkflowFileByName(fileName: string, label: string) {
    const project = resolveCurrentWorkflow();
    if (!project) {
        await reportWorkflowIssue('No workspace folder found for VibeCoding workflow detection.', {
            level: 'error',
        });
        return;
    }

    const missingFileNames = project.missingFiles.map((filePath) => filePath.split('/').pop());
    if (missingFileNames.includes(fileName)) {
        await reportWorkflowIssue(`${label} is missing in the detected workflow project.`, {
            level: 'warning',
            details: `Missing file: ${fileName}`,
        });
        return;
    }

    const targetPath = `${project.projectRoot}/${fileName}`;
    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Opening ${label}: ${targetPath}`);

    try {
        await openFileInEditor(targetPath, label);
    } catch (error) {
        await reportWorkflowIssue(`Open ${label} failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput'],
        });
    }
}

async function getInspectResultForProject(
    projectRoot: string,
    options?: { forceRefresh?: boolean },
): Promise<DriverResult> {
    if (!options?.forceRefresh && latestInspectResult?.projectRoot === projectRoot) {
        outputChannel?.appendLine('Using cached inspect result for next session prompt resolution.');
        return latestInspectResult.result;
    }

    const result = await inspectWorkflowForReadPath(projectRoot);
    latestInspectResult = { projectRoot, result };
    return result;
}

function isLangGraphThreadNotFoundError(error: unknown): boolean {
    return error instanceof LangGraphIntegrationError && error.code === 'langgraph_thread_not_found';
}

function buildColdStartInspectResult(workflow: WorkflowProject, serverUrl: string): DriverResult {
    const daemonInfo = getLangGraphDaemonInfo(getLangGraphServerConfig());
    const sessionGate = workflow.progress.sessionGate;
    const nextSession = workflow.progress.nextSession;
    const lastCompletedSession = workflow.progress.lastCompletedSession;
    const nextSessionPromptPath = workflow.sessionPromptPaths.find((sessionPath) => parseSessionNumber(sessionPath) === nextSession) ?? null;
    const nextSessionPromptLabel = nextSessionPromptPath ? path.basename(nextSessionPromptPath) : null;
    const status = normalizeWorkflowStatusForColdStart(sessionGate);

    return {
        schema_version: 'langgraph-runtime-contract/2026-03-17',
        status,
        message: `LangGraph thread has not been created yet. Using memory.md workflow state. next_session=${nextSession ?? 'n/a'}`,
        exit_code: status === 'invalid' ? 1 : 0,
        requested_action: 'inspect',
        effective_action: 'inspect',
        project_root: workflow.projectRoot,
        session_gate: sessionGate,
        next_session: nextSession === null ? null : String(nextSession),
        next_session_prompt: nextSessionPromptLabel,
        last_completed_session: lastCompletedSession === null ? null : String(lastCompletedSession),
        last_completed_session_tests: null,
        inputs: {
            runtime: 'langgraph',
            thread_id: resolveLangGraphThreadId(workflow.projectRoot),
            run_id: null,
            run_status: null,
            server_url: serverUrl,
            thread_exists: false,
            cold_start_from_memory: true,
            daemon_manager: daemonInfo.manager,
            daemon_lifecycle: daemonInfo.lifecycle,
        },
        artifacts: {
            startup_prompt_path: workflow.startupPromptPath,
            memory_path: workflow.memoryPath,
            loop_log_path: path.join(workflow.projectRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl'),
            next_session_prompt_path: nextSessionPromptPath,
            runner_command: getRunnerCommandTemplate(),
            startup_prompt_contents: null,
        },
        checks: {
            langgraph_thread_exists: false,
            source: 'memory_md_cold_start',
        },
        risks: [],
        next_action: buildColdStartNextAction(status),
        error: null,
        daemon: daemonInfo,
    };
}

function normalizeWorkflowStatusForColdStart(sessionGate: string | null): DriverResult['status'] {
    if (sessionGate === 'ready' || sessionGate === 'blocked' || sessionGate === 'in_progress' || sessionGate === 'done') {
        return sessionGate;
    }
    return 'invalid';
}

function buildColdStartNextAction(status: DriverResult['status']): DriverResult['next_action'] {
    if (status === 'ready') {
        return {
            type: 'start_session',
            message: 'Current session can be triggered; LangGraph thread will be created on first run.',
        };
    }
    if (status === 'blocked') {
        return {
            type: 'review_blocker',
            message: 'Review notes or workflow documents before retrying the current session.',
        };
    }
    if (status === 'in_progress') {
        return {
            type: 'wait',
            message: 'memory.md marks this workflow as in progress, but no LangGraph thread exists yet.',
        };
    }
    if (status === 'done') {
        return {
            type: 'complete',
            message: 'Workflow is already complete.',
        };
    }
    return {
        type: 'investigate',
        message: 'Check memory.md because the workflow gate is invalid.',
    };
}

async function prepareFreshSession() {
    const project = resolveCurrentWorkflow();
    if (!project) {
        await reportWorkflowIssue('No workspace folder found for VibeCoding workflow detection.', {
            level: 'error',
        });
        return;
    }

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue(
            `Workflow files are incomplete: ${project.missingFiles.map((filePath) => filePath.split('/').pop()).join(', ')}`,
            {
                level: 'warning',
                details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            }
        );
        return;
    }

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Inspecting workflow state for: ${project.projectRoot}`);

    try {
        const result = await inspectWorkflowForReadPath(project.projectRoot);
        latestInspectResult = { projectRoot: project.projectRoot, result };
        renderRefreshResult(result);
        updateStatusBar(project.projectRoot, result);
        updateDashboardState({
            projectRoot: project.projectRoot,
            selectedWorkflowRoot: project.projectRoot,
            result,
            issue: null,
            lastUpdatedAt: new Date(),
        });
    } catch (error) {
        await reportWorkflowIssue(`Inspect workflow failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput', 'openLoopLog'],
        });
    }
}

async function prepareAndOpenNextSessionPrompt() {
    const project = resolveCurrentWorkflow();
    if (!project) {
        await reportWorkflowIssue('No workspace folder found for VibeCoding workflow detection.', {
            level: 'error',
        });
        return;
    }

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue(
            `Workflow files are incomplete: ${project.missingFiles.map((filePath) => filePath.split('/').pop()).join(', ')}`,
            {
                level: 'warning',
                details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            }
        );
        return;
    }

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Inspecting workflow and opening next session prompt for: ${project.projectRoot}`);

    try {
        const result = await inspectWorkflowForReadPath(project.projectRoot);
        latestInspectResult = { projectRoot: project.projectRoot, result };
        renderRefreshResult(result);
        updateStatusBar(project.projectRoot, result);
        updateDashboardState({
            projectRoot: project.projectRoot,
            selectedWorkflowRoot: project.projectRoot,
            result,
            issue: null,
            lastUpdatedAt: new Date(),
        });

        if (result.status !== 'ready') {
            return;
        }

        const nextSessionPromptPath = result.artifacts.next_session_prompt_path;
        if (!nextSessionPromptPath) {
            throw new Error('Workflow state did not return next_session_prompt_path.');
        }

        await openFileInEditor(nextSessionPromptPath, 'next session prompt');
        outputChannel?.appendLine(`Opened next session prompt: ${nextSessionPromptPath}`);
    } catch (error) {
        await reportWorkflowIssue(`Open next session prompt failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput', 'openLoopLog'],
        });
    }
}

async function startRunnerInTerminal() {
    const project = resolveCurrentWorkflow();
    if (!project) {
        await reportWorkflowIssue('No workspace folder found for VibeCoding workflow detection.', {
            level: 'error',
        });
        return;
    }

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue(
            `Workflow files are incomplete: ${project.missingFiles.map((filePath) => filePath.split('/').pop()).join(', ')}`,
            {
                level: 'warning',
                details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            }
        );
        return;
    }

    const runnerCommandTemplate = getRunnerCommandTemplate();
    const preferredRunner = getPreferredRunner();

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Validating fresh session run for: ${project.projectRoot}`);

    const existingRunnerState = getRunnerState(project.projectRoot);
    if (existingRunnerState !== 'idle') {
        void vscode.window.showWarningMessage(`Runner is already ${describeRunnerState(existingRunnerState)}.`);
        return;
    }

    setRunnerState(project.projectRoot, 'starting');
    syncRunnerStatusBar(project.projectRoot, 'starting');

    try {
        let langGraphProbe = await logLangGraphProbe('refresh');
        if (!langGraphProbe.ok) {
            outputChannel?.appendLine('LangGraph offline — attempting auto-start...');
            const started = await autoStartLangGraphServer();
            if (started) {
                langGraphProbe = await logLangGraphProbe('refresh');
            }
        }

        if (langGraphProbe.ok) {
            const started = await startCurrentSessionViaLangGraph(project.projectRoot, runnerCommandTemplate, preferredRunner);
            if (!started) {
                clearRunnerTracking(project.projectRoot, { preserveStatusBar: true });
                syncRunnerStatusBar(project.projectRoot, 'idle');
                return;
            }
            setRunnerState(project.projectRoot, 'running');
            syncRunnerStatusBar(project.projectRoot, 'running');
            const refreshedResult = await inspectWorkflowForReadPath(project.projectRoot, langGraphProbe);
            latestInspectResult = { projectRoot: project.projectRoot, result: refreshedResult };
            updateStatusBar(project.projectRoot, refreshedResult);
            updateDashboardState({
                projectRoot: project.projectRoot,
                selectedWorkflowRoot: project.projectRoot,
                result: refreshedResult,
                issue: null,
                lastUpdatedAt: new Date(),
            });
            return;
        }

        await reportWorkflowIssue(`LangGraph server is not available at ${langGraphProbe.serverUrl ?? 'unknown'}. Please start the LangGraph server.`, {
            level: 'error',
            actions: ['showOutput'],
        });
        clearRunnerTracking(project.projectRoot, { preserveStatusBar: true });
        return;
    } catch (error) {
        clearRunnerTracking(project.projectRoot, { preserveStatusBar: true });
        syncRunnerStatusBar(project.projectRoot, 'idle');
        await reportWorkflowIssue(`Start Runner In Terminal failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput', 'openRunnerSettings'],
        });
    }
}

async function startCurrentSessionViaLangGraph(
    projectRoot: string,
    runnerCommandTemplate: string,
    preferredRunner: string,
): Promise<boolean> {
    outputChannel?.appendLine(`Starting current session via LangGraph for: ${projectRoot}`);
    outputChannel?.appendLine(
        runnerCommandTemplate
            ? 'Runner selection: custom template'
            : `Runner selection: preferred_runner=${preferredRunner || 'auto'}`
    );
    const inspectResult = await getInspectResultForProject(projectRoot, { forceRefresh: true });
    updateStatusBar(projectRoot, inspectResult);
    updateDashboardState({
        projectRoot,
        selectedWorkflowRoot: projectRoot,
        result: inspectResult,
        issue: null,
        lastUpdatedAt: new Date(),
    });

    const runBlockerMessage = getRunBlockerMessage(inspectResult);
    if (runBlockerMessage) {
        await reportWorkflowIssue(runBlockerMessage, {
            level: 'warning',
            actions: getRunBlockerActions(inspectResult),
        });
        return false;
    }

    const run = await startWorkflowRunViaLangGraph(
        projectRoot,
        runnerCommandTemplate || null,
        runnerCommandTemplate ? null : preferredRunner || 'auto',
        getLangGraphServerConfig(),
    );
    outputChannel?.appendLine(`LangGraph run triggered: thread_id=${run.threadId} run_id=${run.runId ?? '<unknown>'} status=${run.status ?? '<unknown>'}`);

    void vscode.window.showInformationMessage(
        `Current session triggered via LangGraph${run.runId ? ` (${run.runId})` : ''}.`,
        'Refresh Workflow Status'
    ).then((selection) => {
        if (selection === 'Refresh Workflow Status') {
            void refreshWorkflowStatus();
        }
    });
    return true;
}

function getRunBlockerMessage(result: DriverResult): string | null {
    const runtimeRunStatus = getDriverInputString(result, 'run_status');
    if (runtimeRunStatus === 'interrupted') {
        return 'LangGraph run is waiting for customer review. Approve or reject the current session before starting a new run.';
    }
    if (result.status === 'blocked') {
        return 'LangGraph run cannot start while the workflow is blocked. Fix the review notes first, then use “Reopen Current Session” so the workflow returns to ready.';
    }
    if (result.status === 'in_progress') {
        return 'LangGraph run is already in progress for the current session. Wait for it to finish or refresh again.';
    }
    if (result.status !== 'ready') {
        return `LangGraph run can only start from workflow status ready. Current status: ${result.status}`;
    }
    return null;
}

function getRunBlockerActions(result: DriverResult): WorkflowIssueAction[] {
    if (result.status === 'blocked') {
        return ['reopenSession', 'showOutput'];
    }
    return ['showOutput'];
}

function updateStatusBar(projectRoot: string, result: DriverResult) {
    statusBar?.showResult({
        projectRoot,
        result,
        daemon: getCurrentDaemonInfo(result),
        lastUpdatedAt: new Date(),
    });
}

function updateDashboardState(state: DashboardState) {
    const mergedState: DashboardState = {
        ...latestDashboardState,
        ...state,
        issue: state.issue === undefined ? latestDashboardState.issue : state.issue,
    };
    latestDashboardState = mergedState;
    dashboardViewProvider?.update(latestDashboardState);
    WorkflowDashboardPanel.updateIfOpen(latestDashboardState);
}

function registerTerminalLifecycleHandlers(context: vscode.ExtensionContext) {
    const windowWithTerminalEvents = vscode.window as typeof vscode.window & {
        onDidCloseTerminal?: (listener: (terminal: vscode.Terminal) => unknown) => vscode.Disposable;
    };

    if (typeof windowWithTerminalEvents.onDidCloseTerminal !== 'function') {
        return;
    }

    context.subscriptions.push(windowWithTerminalEvents.onDidCloseTerminal((terminal) => {
        for (const [projectRoot, trackedTerminal] of runnerTerminalByWorkflow.entries()) {
            if (trackedTerminal !== terminal) {
                continue;
            }

            clearRunnerTracking(projectRoot);
            outputChannel?.appendLine(`Runner terminal closed for workflow: ${projectRoot}`);
            break;
        }
    }));
}

function registerWorkflowStatePolling(context: vscode.ExtensionContext) {
    const intervalHandle = setInterval(() => {
        void pollWorkflowResults();
    }, 5000);

    context.subscriptions.push({
        dispose() {
            clearInterval(intervalHandle);
        },
    });
}

async function pollWorkflowResults() {
    if (workflowRefreshInFlight) {
        return;
    }

    const trackedWorkflowRoots = Array.from(runnerStateByWorkflow.entries())
        .filter(([, runnerState]) => runnerState !== 'idle')
        .map(([projectRoot]) => projectRoot);

    workflowRefreshInFlight = true;
    try {
        // Always probe LangGraph so the online/offline pill stays accurate
        const langGraphConfig = getLangGraphServerConfig();
        const probe = await probeLangGraphServer(langGraphConfig);
        updateDashboardState({ langGraphServerUrl: probe.serverUrl, langGraphOnline: probe.ok });

        for (const projectRoot of trackedWorkflowRoots) {
            await refreshWorkflowSnapshot(projectRoot);
        }
    } finally {
        workflowRefreshInFlight = false;
    }
}

async function refreshWorkflowSnapshot(projectRoot: string) {
    const result = await inspectWorkflowForReadPath(projectRoot);
    latestInspectResult = { projectRoot, result };

    const discovery = discoverWorkflowProjects();
    const selectedWorkflowRoot = latestDashboardState.selectedWorkflowRoot ?? activeWorkflowRoot;
    const stateUpdate: DashboardState = {
        workspaceRoot: discovery?.workspaceRoot,
        workflows: mapDashboardWorkflows(discovery),
        lastUpdatedAt: new Date(),
    };

    if (selectedWorkflowRoot === projectRoot) {
        stateUpdate.projectRoot = projectRoot;
        stateUpdate.selectedWorkflowRoot = projectRoot;
        stateUpdate.result = result;
    }

    updateDashboardState(stateUpdate);
    reconcileRunnerStateWithRuntime(projectRoot, result);
    reconcileRunnerProcess(projectRoot, result);
    await refreshSessionRuntimeInspectorIfNeeded(projectRoot);
    await refreshLangGraphManagerIfNeeded(projectRoot);

    if (selectedWorkflowRoot === projectRoot || activeWorkflowRoot === projectRoot) {
        syncRunnerStatusBar(projectRoot, getRunnerState(projectRoot), result);
    }
}

function reconcileTrackedRunnerProcesses() {
    const trackedWorkflowRoots = Array.from(runnerStateByWorkflow.entries())
        .filter(([, runnerState]) => runnerState !== 'idle')
        .map(([projectRoot]) => projectRoot);

    for (const projectRoot of trackedWorkflowRoots) {
        reconcileRunnerProcess(projectRoot);
    }
}

function reconcileRunnerProcess(projectRoot: string, result?: DriverResult): boolean {
    const runnerState = getRunnerState(projectRoot);
    if (runnerState === 'idle') {
        return false;
    }

    const processInfo = runnerProcessByWorkflow.get(projectRoot);
    const disposition = resolveRunnerProcessDisposition(processInfo);
    if (disposition === 'active' || disposition === 'unknown') {
        return false;
    }

    const reason = disposition === 'dead'
        ? 'tracked PID is no longer alive'
        : 'tracked shell is idle with no active child process';
    outputChannel?.appendLine(`Runner state reconciled to idle for ${projectRoot}: ${reason}.`);
    clearRunnerTracking(projectRoot, { preserveStatusBar: true });
    syncRunnerStatusBar(projectRoot, 'idle', result);
    return true;
}

function reconcileRunnerStateWithRuntime(projectRoot: string, result?: DriverResult): boolean {
    if (!result) {
        return false;
    }

    const currentRunnerState = getRunnerState(projectRoot);
    const shouldSyncStatusBar = latestDashboardState.selectedWorkflowRoot === projectRoot || activeWorkflowRoot === projectRoot;
    const runtimeRunStatus = getDriverInputString(result, 'run_status');
    const isRuntimeActive = runtimeRunStatus === 'pending'
        || runtimeRunStatus === 'running'
        || result.status === 'in_progress'
        || result.session_gate === 'in_progress';

    if (isRuntimeActive) {
        const nextRunnerState: DashboardRunnerState = runtimeRunStatus === 'pending' ? 'starting' : 'running';
        if (currentRunnerState !== nextRunnerState) {
            setRunnerState(projectRoot, nextRunnerState);
        }
        if (shouldSyncStatusBar) {
            syncRunnerStatusBar(projectRoot, nextRunnerState, result);
        }
        return true;
    }

    if (currentRunnerState === 'idle') {
        return false;
    }

    clearRunnerTracking(projectRoot, { preserveStatusBar: true });
    if (shouldSyncStatusBar) {
        syncRunnerStatusBar(projectRoot, 'idle', result);
    }
    return true;
}

function clearRunnerTracking(projectRoot: string, options?: { preserveStatusBar?: boolean }) {
    runnerTerminalByWorkflow.delete(projectRoot);
    runnerProcessByWorkflow.delete(projectRoot);
    setRunnerState(projectRoot, 'idle');
    updateDashboardState({
        runnerProcessByWorkflow: getRunnerProcessSnapshot(),
    });
    if (!options?.preserveStatusBar) {
        syncRunnerStatusBar(projectRoot, 'idle');
    }
}

function getRunnerState(projectRoot: string | undefined): DashboardRunnerState {
    if (!projectRoot) {
        return 'idle';
    }
    return runnerStateByWorkflow.get(projectRoot) ?? 'idle';
}

function getRunnerStateSnapshot(): Record<string, DashboardRunnerState> {
    const snapshot: Record<string, DashboardRunnerState> = {};
    for (const [projectRoot, runnerState] of runnerStateByWorkflow.entries()) {
        snapshot[projectRoot] = runnerState;
    }
    return snapshot;
}

function getRunnerProcessSnapshot(): Record<string, DashboardRunnerProcessInfo> {
    const snapshot: Record<string, DashboardRunnerProcessInfo> = {};
    for (const [projectRoot, processInfo] of runnerProcessByWorkflow.entries()) {
        snapshot[projectRoot] = processInfo;
    }
    return snapshot;
}

function setRunnerState(projectRoot: string, runnerState: DashboardRunnerState) {
    const heartbeatAtEpochMs = Date.now();
    if (runnerState === 'idle') {
        runnerStateByWorkflow.delete(projectRoot);
    } else {
        runnerStateByWorkflow.set(projectRoot, runnerState);
    }

    const existingProcessInfo = runnerProcessByWorkflow.get(projectRoot);
    if (existingProcessInfo) {
        runnerProcessByWorkflow.set(projectRoot, {
            ...existingProcessInfo,
            heartbeatAtEpochMs,
        });
    }

    persistRunnerState(projectRoot);

    updateDashboardState({
        runnerStateByWorkflow: getRunnerStateSnapshot(),
        runnerProcessByWorkflow: getRunnerProcessSnapshot(),
    });
}

function setRunnerProcessInfo(projectRoot: string, processInfo: DashboardRunnerProcessInfo) {
    runnerProcessByWorkflow.set(projectRoot, {
        ...processInfo,
        heartbeatAtEpochMs: processInfo.heartbeatAtEpochMs ?? Date.now(),
    });
    persistRunnerState(projectRoot);
    updateDashboardState({
        runnerProcessByWorkflow: getRunnerProcessSnapshot(),
    });
}

function resolveRunnerProcessDisposition(processInfo: DashboardRunnerProcessInfo | undefined): RunnerProcessDisposition {
    const pid = processInfo?.pid;
    if (!pid || !Number.isInteger(pid) || pid <= 0) {
        return 'unknown';
    }

    if (!isProcessAlive(pid)) {
        return 'dead';
    }

    if (process.platform === 'win32') {
        return 'active';
    }

    const processCommand = readProcessCommand(pid);
    if (!processCommand) {
        return 'unknown';
    }

    if (looksLikeShellExecutable(processCommand) && !hasChildProcesses(pid)) {
        return 'shell_idle';
    }

    return 'active';
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function readProcessCommand(pid: number): string | null {
    try {
        return childProcess.execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {
            encoding: 'utf8',
        }).trim() || null;
    } catch (error) {
        outputChannel?.appendLine(`Failed to inspect process command for PID ${pid}: ${formatErrorMessage(error)}`);
        return null;
    }
}

function hasChildProcesses(pid: number): boolean {
    try {
        const output = childProcess.execFileSync('pgrep', ['-P', String(pid)], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        return output.length > 0;
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & { status?: number };
        if (execError.status === 1) {
            return false;
        }
        outputChannel?.appendLine(`Failed to inspect child processes for PID ${pid}: ${formatErrorMessage(error)}`);
        return true;
    }
}

function looksLikeShellExecutable(command: string): boolean {
    return /(^|\/)(bash|zsh|sh|fish)$/.test(command.trim());
}

function describeRunnerState(runnerState: DashboardRunnerState): string {
    if (runnerState === 'starting') {
        return 'starting';
    }
    if (runnerState === 'running') {
        return 'running';
    }
    if (runnerState === 'paused') {
        return 'paused';
    }
    return 'idle';
}

async function resolveRunnerProcessId(projectRoot: string, terminal: vscode.Terminal) {
    const terminalWithProcessId = terminal as vscode.Terminal & {
        processId?: Thenable<number | undefined>;
    };

    if (!terminalWithProcessId.processId) {
        return;
    }

    try {
        const pid = await terminalWithProcessId.processId;
        if (runnerTerminalByWorkflow.get(projectRoot) !== terminal) {
            return;
        }

        const existingInfo = runnerProcessByWorkflow.get(projectRoot);
        setRunnerProcessInfo(projectRoot, {
            processName: existingInfo?.processName ?? terminal.name,
            pid: pid ?? null,
            startedAtEpochMs: existingInfo?.startedAtEpochMs ?? null,
        });
    } catch (error) {
        outputChannel?.appendLine(`Failed to resolve terminal PID for ${projectRoot}: ${formatErrorMessage(error)}`);
    }
}

function parseSessionNumber(sessionPath: string): number | null {
    const match = sessionPath.match(/session-(\d+)-prompt\.md$/);
    if (!match) {
        return null;
    }
    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseNullableInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.trunc(value) : null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function compareSessionFiles(leftPath: string, rightPath: string): number {
    const leftValue = parseSessionNumber(leftPath) ?? Number.MAX_SAFE_INTEGER;
    const rightValue = parseSessionNumber(rightPath) ?? Number.MAX_SAFE_INTEGER;
    return leftValue - rightValue || leftPath.localeCompare(rightPath);
}

function resolveNodeTiming(
    file: DashboardWorkflowSummary['files'][number],
    inspection: SessionRuntimeInspection,
    runnerProcess: DashboardRunnerProcessInfo | undefined,
): { startedAtLabel: string; endedAtLabel: string; durationLabel: string } {
    const isActive = inspection.isCurrentSession
        && (inspection.runnerState === 'starting' || inspection.runnerState === 'running' || inspection.runnerState === 'paused');

    if (isActive && runnerProcess?.startedAtEpochMs) {
        return {
            startedAtLabel: formatSessionTime(new Date(runnerProcess.startedAtEpochMs)) ?? '-',
            endedAtLabel: '-',
            durationLabel: formatSessionDuration(Date.now() - runnerProcess.startedAtEpochMs) ?? '-',
        };
    }

    return {
        startedAtLabel: file.startedAtLabel ?? '-',
        endedAtLabel: file.endedAtLabel ?? '-',
        durationLabel: file.durationLabel ?? '-',
    };
}

function buildLangGraphStudioUrl(serverUrl: string, threadId?: string | null): string {
    const normalizedServerUrl = normalizeStudioBaseUrl(serverUrl);
    const searchParams = new URLSearchParams({
        baseUrl: normalizedServerUrl,
    });
    if (threadId) {
        searchParams.set('threadId', threadId);
    }
    return `https://smith.langchain.com/studio/thread?${searchParams.toString()}`;
}

function normalizeStudioBaseUrl(serverUrl: string): string {
    try {
        const parsed = new URL(serverUrl);
        if (parsed.hostname === 'localhost') {
            parsed.hostname = '127.0.0.1';
        }
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return serverUrl.replace(/\/$/, '');
    }
}

function formatSessionTime(value: Date | null | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    return value.toLocaleString('zh-CN', { hour12: false });
}

function formatSessionDuration(durationMs: number | null | undefined): string | undefined {
    if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
        return undefined;
    }

    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

function syncRunnerStatusBar(projectRoot: string, runnerState: DashboardRunnerState, result?: DriverResult) {
    if (runnerState === 'starting' || runnerState === 'running' || runnerState === 'paused') {
        statusBar?.showRuntime({
            projectRoot,
            result: result ?? getCachedResultForDashboard(projectRoot),
            daemon: getCurrentDaemonInfo(result ?? getCachedResultForDashboard(projectRoot)),
            runnerState,
            lastUpdatedAt: new Date(),
        });
        return;
    }

    const cachedResult = result ?? getCachedResultForDashboard(projectRoot);
    if (cachedResult) {
        statusBar?.showResult({
            projectRoot,
            result: cachedResult,
            daemon: getCurrentDaemonInfo(cachedResult),
            lastUpdatedAt: new Date(),
        });
        return;
    }

    statusBar?.showIdle();
}

function getRunnerCommandTemplate(): string {
    return (vscode.workspace.getConfiguration('vibeCoding').get<string>('runnerCommandTemplate') ?? '').trim();
}

function getPreferredRunner(): string {
    const configured = (vscode.workspace.getConfiguration('vibeCoding').get<string>('preferredRunner') ?? '').trim().toLowerCase();
    return configured || 'codex';
}

function getLangGraphStartScript(): string {
    return (vscode.workspace.getConfiguration('vibeCoding').get<string>('langGraphStartScript') ?? '').trim();
}

function resolveLangGraphStartScript(): string | null {
    // 1. Explicit setting takes priority
    const configured = getLangGraphStartScript();
    if (configured && fs.existsSync(configured)) {
        return configured;
    }
    // 2. Auto-discover: look for start-langgraph-dev.sh in workspace roots
    const candidates = [
        'start-langgraph-dev.sh',
        'scripts/start-langgraph-dev.sh',
        'scripts/start-langgraph-dev.command',
    ];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const rel of candidates) {
            const full = path.join(folder.uri.fsPath, rel);
            if (fs.existsSync(full)) {
                return full;
            }
        }
    }
    return null;
}

async function autoStartLangGraphServer(): Promise<boolean> {
    const startScript = resolveLangGraphStartScript();
    if (!startScript) {
        outputChannel?.appendLine('No LangGraph start script found. Set vibeCoding.langGraphStartScript or add start-langgraph-dev.sh to workspace root.');
        return false;
    }

    outputChannel?.appendLine(`Auto-starting LangGraph server via: ${startScript}`);
    const terminal = vscode.window.createTerminal({ name: 'VibeCoding: LangGraph Server' });
    terminal.show(false);
    terminal.sendText(`bash "${startScript}"`, true);

    // Poll until server is up (max 30s)
    const langGraphConfig = getLangGraphServerConfig();
    for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const probe = await probeLangGraphServer(langGraphConfig);
        if (probe.ok) {
            outputChannel?.appendLine(`LangGraph server is online after ${i + 1}s`);
            return true;
        }
    }
    outputChannel?.appendLine('LangGraph server did not come online within 30s');
    return false;
}

function resolveRunnerLogPath(projectRoot: string): string {
    return path.join(projectRoot, '.vibecoding', 'runner.log');
}

function buildRunnerCommandWithLogging(command: string, runnerLogPath: string): string {
    fs.mkdirSync(path.dirname(runnerLogPath), { recursive: true });
    const bashScript = [
        'mkdir -p "$(dirname "$RUNNER_LOG_PATH")"',
        'printf "\\n===== [%s] Runner start =====\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')" >> "$RUNNER_LOG_PATH"',
        'stdin_tty=no; stdout_tty=no; stderr_tty=no',
        'if [ -t 0 ]; then stdin_tty=yes; fi',
        'if [ -t 1 ]; then stdout_tty=yes; fi',
        'if [ -t 2 ]; then stderr_tty=yes; fi',
        'runner_term="${TERM:-}"',
        'if [ -z "$runner_term" ] || [ "$runner_term" = "dumb" ]; then runner_term="xterm-256color"; fi',
        'printf "Runner env: stdin_tty=%s stdout_tty=%s stderr_tty=%s TERM=%s\\n" "$stdin_tty" "$stdout_tty" "$stderr_tty" "$runner_term" >> "$RUNNER_LOG_PATH"',
        'if [ "$stdin_tty" = "yes" ] && [ "$stdout_tty" = "yes" ] && [ "$stderr_tty" = "yes" ]; then TERM="$runner_term" script -aqF "$RUNNER_LOG_PATH" /bin/bash -lc "$RUNNER_CMD" 2>>"$RUNNER_LOG_PATH"; status=$?; else set -o pipefail; eval "$RUNNER_CMD" 2>&1 | tee -a "$RUNNER_LOG_PATH"; status=${PIPESTATUS[0]}; fi',
        'printf "===== [%s] Runner end (exit=%s) =====\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')" "$status" >> "$RUNNER_LOG_PATH"',
        'exit "$status"',
    ].join('; ');
    return `RUNNER_LOG_PATH=${shellQuote(runnerLogPath)} RUNNER_CMD=${shellQuote(command)} /bin/bash -lc ${shellQuote(bashScript)}`;
}

function shellQuote(value: string): string {
    if (value.length === 0) {
        return "''";
    }

    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function basename(filePath: string): string {
    const segments = filePath.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : filePath;
}

async function openLoopLog() {
    const project = resolveCurrentWorkflow();
    const currentProjectRoot = project?.projectRoot
        ?? latestDashboardState.projectRoot
        ?? getConfiguredProjectRoot()
        ?? undefined;
    const currentProjectResult = getCachedResultForDashboard(currentProjectRoot);
    const loopLogPath = currentProjectResult?.artifacts.loop_log_path;

    if (loopLogPath) {
        try {
            await openFileInEditor(loopLogPath, 'loop log');
            return;
        } catch (error) {
            await reportWorkflowIssue(`Open Loop Log failed: ${formatErrorMessage(error)}`, {
                level: 'error',
                error,
                actions: ['showOutput'],
            });
            return;
        }
    }

    const knownProjectRoot = currentProjectRoot;

    if (knownProjectRoot) {
        const knownFallbackLogPath = `${knownProjectRoot}/outputs/session-logs/vibecoding-loop.jsonl`;
        try {
            await openFileInEditor(knownFallbackLogPath, 'loop log');
            return;
        } catch (error) {
            await reportWorkflowIssue(`Open Loop Log failed: ${formatErrorMessage(error)}`, {
                level: 'error',
                error,
                details: 'Run Refresh Workflow Status first, or make sure vibeCoding.defaultProjectRoot points to a real workflow project root.',
                actions: ['showOutput'],
            });
            return;
        }
    }

    if (!project) {
        await reportWorkflowIssue('No workflow project detected for loop log resolution.', {
            level: 'error',
            details: 'Open a real workflow project root first, or configure vibeCoding.defaultProjectRoot.',
            actions: ['showOutput'],
        });
        return;
    }

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue('Open Loop Log needs a valid workflow project root before the fallback path can be resolved.', {
            level: 'warning',
            details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            actions: ['showOutput'],
        });
        return;
    }

    const fallbackLogPath = `${project.projectRoot}/outputs/session-logs/vibecoding-loop.jsonl`;
    try {
        await openFileInEditor(fallbackLogPath, 'loop log');
    } catch (error) {
        await reportWorkflowIssue(`Open Loop Log failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            details: 'Run Refresh Workflow Status or Prepare Fresh Session first so the driver can return a concrete loop_log_path.',
            actions: ['showOutput'],
        });
    }
}

type WorkflowIssueAction = 'showOutput' | 'openRunnerSettings' | 'openLoopLog' | 'reopenSession';

async function reportWorkflowIssue(
    message: string,
    options: {
        level: 'error' | 'warning';
        error?: unknown;
        details?: string;
        statusBarCommand?: string;
        actions?: WorkflowIssueAction[];
    }
) {
    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`[${options.level.toUpperCase()}] ${message}`);

    if (options.details) {
        outputChannel?.appendLine(options.details);
    }

    if (options.error) {
        appendErrorDetails(options.error);
    }

    statusBar?.showInvalid(message, options.statusBarCommand);
    updateDashboardState({
        issue: buildDashboardIssue(message, options.level, options.details, options.error),
        lastUpdatedAt: new Date(),
    });

    const labels = (options.actions ?? []).map(actionToLabel);
    const selection = options.level === 'error'
        ? await vscode.window.showErrorMessage(message, ...labels)
        : await vscode.window.showWarningMessage(message, ...labels);

    if (selection) {
        await handleWorkflowIssueAction(selection);
    }
}

function getCurrentDaemonInfo(result?: DriverResult): LangGraphDaemonInfo | null {
    return result?.daemon ?? latestDashboardState.langGraphDaemon ?? null;
}

function appendErrorDetails(error: unknown) {
    if (error instanceof Error) {
        outputChannel?.appendLine(`error=${error.message}`);
        return;
    }

    outputChannel?.appendLine(`error=${String(error)}`);
}

function formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function actionToLabel(action: WorkflowIssueAction): string {
    switch (action) {
        case 'showOutput':
            return 'Show Output';
        case 'openRunnerSettings':
            return 'Open Runner Settings';
        case 'openLoopLog':
            return 'Open Loop Log';
        case 'reopenSession':
            return 'Reopen Current Session';
    }
}

async function handleWorkflowIssueAction(selection: string) {
    if (selection === 'Show Output') {
        outputChannel?.show(true);
        return;
    }

    if (selection === 'Open Runner Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'vibeCoding.preferredRunner');
        return;
    }

    if (selection === 'Open Loop Log') {
        await openLoopLog();
        return;
    }

    if (selection === 'Reopen Current Session') {
        const workflowRoot = activeWorkflowRoot
            ?? latestDashboardState.selectedWorkflowRoot
            ?? latestDashboardState.projectRoot
            ?? resolveCurrentWorkflow()?.projectRoot;
        if (workflowRoot) {
            await reopenSession(workflowRoot);
        }
    }
}

function buildDashboardIssue(
    message: string,
    level: 'error' | 'warning',
    details?: string,
    error?: unknown,
): DashboardIssue {
    const detailSegments: string[] = [];
    if (details) {
        detailSegments.push(details);
    }
    if (error instanceof Error) {
        detailSegments.push(error.message);
    } else if (error !== undefined) {
        detailSegments.push(String(error));
    }

    return {
        level,
        message,
        details: detailSegments.join(' | '),
    };
}
