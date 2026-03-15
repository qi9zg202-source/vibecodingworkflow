import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildRunDriverCommand, DriverIntegrationError, getDriverConfig, inspectWorkflow, prepareWorkflow, validateDriverConfig } from './driver/pythonDriver';
import { DriverResult } from './driver/driverTypes';
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
    | 'vibeCoding.configurePythonDriverPath';

type InternalVibeCodingCommand =
    | 'vibeCoding.selectWorkflow'
    | 'vibeCoding.openWorkflowFileAtPath'
    | 'vibeCoding.runStartupFlow'
    | 'vibeCoding.prepareAndOpenNextSessionPrompt'
    | 'vibeCoding.activateWorkflowRunner'
    | 'vibeCoding.pauseWorkflowRunner'
    | 'vibeCoding.resumeWorkflowRunner'
    | 'vibeCoding.cancelWorkflowRunner'
    | 'vibeCoding.killWorkflowRunner'
    | 'vibeCoding.approveSession'
    | 'vibeCoding.rejectSession';

const COMMANDS: ReadonlyArray<{ id: VibeCodingCommand; label: string }> = [
    { id: 'vibeCoding.openDashboard', label: 'Open Dashboard' },
    { id: 'vibeCoding.refreshWorkflowStatus', label: 'Refresh Workflow Status' },
    { id: 'vibeCoding.openMemory', label: 'Open Memory' },
    { id: 'vibeCoding.openStartupPrompt', label: 'Open Startup Prompt' },
    { id: 'vibeCoding.openNextSessionPrompt', label: 'Open Next Session Prompt' },
    { id: 'vibeCoding.prepareFreshSession', label: 'Prepare Fresh Session' },
    { id: 'vibeCoding.startRunnerInTerminal', label: 'Start Runner In Terminal' },
    { id: 'vibeCoding.openLoopLog', label: 'Open Loop Log' },
    { id: 'vibeCoding.configurePythonDriverPath', label: 'Configure Python Driver Path' },
];

let outputChannel: vscode.OutputChannel | undefined;
let statusBar: WorkflowStatusBar | undefined;
let dashboardViewProvider: WorkflowDashboardViewProvider | undefined;
let latestInspectResult: { projectRoot: string; result: DriverResult } | undefined;
let latestPrepareResult: { projectRoot: string; result: DriverResult } | undefined;
let latestDashboardState: DashboardState = {};
let activeWorkflowRoot: string | undefined;
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
    dashboardViewProvider = new WorkflowDashboardViewProvider(latestDashboardState, async (command, args) => {
        await vscode.commands.executeCommand(command, ...(args ?? []));
    }, () => {
        openDashboard();
    });
    outputChannel.appendLine('Session 7 activation complete.');
    outputChannel.appendLine('Refresh, prepare, runner, and error handling now use the Python driver JSON contract.');
    outputChannel.appendLine('Workflow truth remains in memory.md and the Python driver.');
    outputChannel.appendLine('Open Dashboard is available for a dedicated Webview control surface.');
    outputChannel.appendLine('Runner state SQLite path pattern: <workflow-root>/.vibecoding/runner-state.sqlite');
    outputChannel.appendLine(`Legacy runner state SQLite path: ${resolveLegacyRunnerStateDbPath(context, persistenceWorkspaceRoot) ?? 'n/a'}`);
    statusBar.showIdle();

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
    const pythonPath = config.get<string>('pythonPath') ?? 'python3';
    const driverPath = config.get<string>('driverPath') ?? '';
    const defaultProjectRoot = config.get<string>('defaultProjectRoot') ?? '';

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Command invoked: ${command.id}`);
    outputChannel?.appendLine(`pythonPath=${pythonPath}`);
    outputChannel?.appendLine(`driverPath=${driverPath || '<unset>'}`);
    outputChannel?.appendLine(`defaultProjectRoot=${defaultProjectRoot || '<workspace>'}`);

    if (command.id === 'vibeCoding.configurePythonDriverPath') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'vibeCoding.driverPath');
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
    const terminal = runnerTerminalByWorkflow.get(workflowRoot);
    if (!terminal || getRunnerState(workflowRoot) !== 'running') {
        void vscode.window.showWarningMessage('No running workflow terminal is available to pause.');
        return;
    }

    terminal.show(true);
    terminal.sendText('\u001A', false);
    setRunnerState(workflowRoot, 'paused');
    syncRunnerStatusBar(workflowRoot, 'paused');
    outputChannel?.appendLine(`Runner paused for workflow: ${workflowRoot}`);
    void vscode.window.showInformationMessage('Workflow runner paused.');
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
 * 批准当前 Session：将 memory.md 中的 session_gate 设为 ready，并触发刷新。
 * 对 blocked 状态同样适用（重新开放本 Session，不递增 next_session）。
 */
async function approveSession(workflowRoot: string) {
    const memoryPath = path.join(workflowRoot, 'memory.md');
    try {
        let content = fs.readFileSync(memoryPath, 'utf-8');
        content = content.replace(/^(- session_gate:\s*).*$/m, '$1ready');
        fs.writeFileSync(memoryPath, content, 'utf-8');
        outputChannel?.appendLine(`[approveSession] session_gate → ready  (${memoryPath})`);
        void vscode.window.showInformationMessage('Session 已批准，session_gate 已设为 ready。');
        await refreshWorkflowStatus();
    } catch (error) {
        void vscode.window.showErrorMessage(`批准失败：${formatErrorMessage(error)}`);
    }
}

/**
 * 驳回当前 Session：弹出输入框收集原因，写入 review_notes 并将 session_gate 设为 blocked。
 */
async function rejectSession(workflowRoot: string) {
    const reason = await vscode.window.showInputBox({
        title: '驳回 Session',
        prompt: '请输入驳回原因（将写入 memory.md review_notes）',
        placeHolder: '例如：测试未通过，缺少边界检查…',
    });
    if (reason === undefined) {
        return; // 用户取消
    }

    const memoryPath = path.join(workflowRoot, 'memory.md');
    try {
        let content = fs.readFileSync(memoryPath, 'utf-8');
        // 更新 session_gate
        content = content.replace(/^(- session_gate:\s*).*$/m, '$1blocked');
        // 更新或追加 review_notes
        if (/^- review_notes:/m.test(content)) {
            content = content.replace(/^(- review_notes:\s*).*$/m, `$1${reason}`);
        } else {
            // 插入到 session_gate 行后
            content = content.replace(
                /^(- session_gate:.*)$/m,
                `$1\n- review_notes: ${reason}`,
            );
        }
        fs.writeFileSync(memoryPath, content, 'utf-8');
        outputChannel?.appendLine(`[rejectSession] session_gate → blocked, review_notes="${reason}"  (${memoryPath})`);
        void vscode.window.showWarningMessage('Session 已驳回，请修复问题后重新开放。');
        await refreshWorkflowStatus();
    } catch (error) {
        void vscode.window.showErrorMessage(`驳回失败：${formatErrorMessage(error)}`);
    }
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

    return discovery.workflows.map((workflow) => ({
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
            ...workflow.sessionPromptPaths.map((sessionPath) => ({
                label: basename(sessionPath),
                path: sessionPath,
                kind: 'session' as const,
                sessionNumber: parseSessionNumber(sessionPath) ?? undefined,
                startedAtLabel: formatSessionTime(workflow.sessionTimingBySession[parseSessionNumber(sessionPath) ?? -1]?.startedAt),
                endedAtLabel: formatSessionTime(workflow.sessionTimingBySession[parseSessionNumber(sessionPath) ?? -1]?.endedAt),
                durationLabel: formatSessionDuration(workflow.sessionTimingBySession[parseSessionNumber(sessionPath) ?? -1]?.durationMs),
            })),
        ],
    }));
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

    if (latestPrepareResult?.projectRoot === projectRoot) {
        return latestPrepareResult.result;
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

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        await reportWorkflowIssue(driverConfigError, {
            level: 'error',
            statusBarCommand: 'vibeCoding.configurePythonDriverPath',
            actions: ['openDriverSettings', 'showOutput'],
        });
        return;
    }

    outputChannel?.appendLine(`Using pythonPath=${driverConfig.pythonPath}`);
    outputChannel?.appendLine(`Using driverPath=${driverConfig.driverPath}`);

    try {
        const result = await inspectWorkflow(project.projectRoot, driverConfig);
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
        reconcileRunnerProcess(project.projectRoot, result);
    } catch (error) {
        await reportWorkflowIssue(`Refresh Workflow Status failed: ${formatErrorMessage(error)}`, {
            level: 'error',
            error,
            actions: ['showOutput', 'openLoopLog'],
        });
    }
}

function renderRefreshResult(result: DriverResult) {
    outputChannel?.appendLine(`Driver status=${result.status}`);
    outputChannel?.appendLine(`session_gate=${result.session_gate ?? '<null>'}`);
    outputChannel?.appendLine(`next_session=${result.next_session ?? '<null>'}`);
    outputChannel?.appendLine(`next_session_prompt=${result.next_session_prompt ?? '<null>'}`);
    outputChannel?.appendLine(`last_completed_session=${result.last_completed_session ?? '<null>'}`);
    outputChannel?.appendLine(`last_completed_session_tests=${result.last_completed_session_tests ?? '<null>'}`);
    outputChannel?.appendLine(`next_action=${result.next_action.type}: ${result.next_action.message}`);

    const summary = [
        `status=${result.status}`,
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

async function getInspectResultForProject(projectRoot: string): Promise<DriverResult> {
    if (latestInspectResult?.projectRoot === projectRoot) {
        outputChannel?.appendLine('Using cached inspect result for next session prompt resolution.');
        return latestInspectResult.result;
    }

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        throw new Error(driverConfigError);
    }

    outputChannel?.appendLine(`Inspecting workflow to resolve next session prompt via ${driverConfig.driverPath}`);
    const result = await inspectWorkflow(projectRoot, driverConfig);
    latestInspectResult = { projectRoot, result };
    return result;
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

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        await reportWorkflowIssue(driverConfigError, {
            level: 'error',
            statusBarCommand: 'vibeCoding.configurePythonDriverPath',
            actions: ['openDriverSettings', 'showOutput'],
        });
        return;
    }

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Preparing fresh session for: ${project.projectRoot}`);

    try {
        const result = await prepareWorkflow(project.projectRoot, driverConfig);
        latestPrepareResult = { projectRoot: project.projectRoot, result };
        latestInspectResult = { projectRoot: project.projectRoot, result };
        renderPrepareResult(result);
        updateStatusBar(project.projectRoot, result);
        updateDashboardState({
            projectRoot: project.projectRoot,
            selectedWorkflowRoot: project.projectRoot,
            result,
            issue: null,
            lastUpdatedAt: new Date(),
        });
    } catch (error) {
        await reportWorkflowIssue(`Prepare Fresh Session failed: ${formatErrorMessage(error)}`, {
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

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        await reportWorkflowIssue(driverConfigError, {
            level: 'error',
            statusBarCommand: 'vibeCoding.configurePythonDriverPath',
            actions: ['openDriverSettings', 'showOutput'],
        });
        return;
    }

    outputChannel?.show(true);
    outputChannel?.appendLine('');
    outputChannel?.appendLine(`Preparing and opening next session prompt for: ${project.projectRoot}`);

    try {
        const result = await prepareWorkflow(project.projectRoot, driverConfig);
        latestPrepareResult = { projectRoot: project.projectRoot, result };
        latestInspectResult = { projectRoot: project.projectRoot, result };
        renderPrepareResult(result);
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
            throw new Error('Driver did not return next_session_prompt_path.');
        }

        await openFileInEditor(nextSessionPromptPath, 'next session prompt');
        outputChannel?.appendLine(`Opened generated next session prompt: ${nextSessionPromptPath}`);
    } catch (error) {
        await reportWorkflowIssue(`Generate and open next session prompt failed: ${formatErrorMessage(error)}`, {
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

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        await reportWorkflowIssue(driverConfigError, {
            level: 'error',
            statusBarCommand: 'vibeCoding.configurePythonDriverPath',
            actions: ['openDriverSettings', 'showOutput'],
        });
        return;
    }

    const runnerCommandTemplate = getRunnerCommandTemplate();
    if (!runnerCommandTemplate) {
        await reportWorkflowIssue('vibeCoding.runnerCommandTemplate is required before starting the runner.', {
            level: 'warning',
            statusBarCommand: 'vibeCoding.startRunnerInTerminal',
            actions: ['openRunnerSettings', 'showOutput'],
        });
        return;
    }

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
        const result = await getPrepareResultForProject(project.projectRoot, { forceRefresh: true });
        updateStatusBar(project.projectRoot, result);
        logPrepareResult(result);
        if (!canStartRunnerForPrepareStatus(result.status)) {
            clearRunnerTracking(project.projectRoot, { preserveStatusBar: true });
            notifyPrepareResult(result);
            syncRunnerStatusBar(project.projectRoot, 'idle', result);
            void vscode.window.showWarningMessage(`Runner not started because workflow status is ${result.status}.`);
            return;
        }

        const runnerLogPath = resolveRunnerLogPath(project.projectRoot);
        const command = buildRunnerCommandWithLogging(
            buildRunDriverCommand(project.projectRoot, driverConfig, runnerCommandTemplate),
            runnerLogPath,
        );
        const terminal = vscode.window.createTerminal({
            name: `VibeCoding Runner: ${basename(project.projectRoot)}`,
            cwd: project.projectRoot,
        });

        outputChannel?.appendLine(`Runner log path: ${runnerLogPath}`);
        outputChannel?.appendLine(`Starting runner in terminal with driver command: ${command}`);
        terminal.show(true);
        terminal.sendText(command, true);
        runnerTerminalByWorkflow.set(project.projectRoot, terminal);
        setRunnerProcessInfo(project.projectRoot, {
            processName: terminal.name,
            pid: null,
            startedAtEpochMs: Date.now(),
        });
        void resolveRunnerProcessId(project.projectRoot, terminal);
        setRunnerState(project.projectRoot, 'running');
        syncRunnerStatusBar(project.projectRoot, 'running', result);
        updateDashboardState({
            projectRoot: project.projectRoot,
            selectedWorkflowRoot: project.projectRoot,
            runnerStateByWorkflow: getRunnerStateSnapshot(),
            runnerProcessByWorkflow: getRunnerProcessSnapshot(),
            result: {
                ...result,
                message: 'Runner command was sent to the integrated terminal.',
            },
            issue: null,
            lastUpdatedAt: new Date(),
        });
        void vscode.window.showInformationMessage('Runner command sent to integrated terminal.');
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

function renderPrepareResult(result: DriverResult) {
    logPrepareResult(result);
    notifyPrepareResult(result);
}

function logPrepareResult(result: DriverResult) {
    outputChannel?.appendLine(`Prepare status=${result.status}`);
    outputChannel?.appendLine(`prepare next_action=${result.next_action.type}: ${result.next_action.message}`);
}

function notifyPrepareResult(result: DriverResult) {
    const summary = [
        `status=${result.status}`,
        `gate=${result.session_gate ?? 'n/a'}`,
        `next=${result.next_session ?? 'n/a'}`,
    ].join(' | ');

    if (result.status === 'ready') {
        void vscode.window.showInformationMessage(
            `Fresh session prepared: ${summary}`,
            'Open Startup Prompt',
            'Open Next Session Prompt',
            'Open Memory'
        ).then((selection) => {
            if (selection === 'Open Startup Prompt') {
                void openStartupPrompt();
            } else if (selection === 'Open Next Session Prompt') {
                void openNextSessionPrompt();
            } else if (selection === 'Open Memory') {
                void openMemory();
            }
        });
        return;
    }

    if (result.status === 'blocked') {
        void vscode.window.showWarningMessage(
            `Fresh session blocked: ${summary}`,
            'Open Memory'
        ).then((selection) => {
            if (selection === 'Open Memory') {
                void openMemory();
            }
        });
        return;
    }

    if (result.status === 'done') {
        void vscode.window.showInformationMessage(`Workflow complete: ${summary}`);
        return;
    }

    if (result.status === 'invalid') {
        void reportWorkflowIssue(`Prepare returned invalid: ${summary}`, {
            level: 'error',
            actions: ['showOutput', 'openLoopLog'],
        });
        return;
    }

    void vscode.window.showWarningMessage(`Prepare returned ${result.status}: ${summary}`);
}

function canStartRunnerForPrepareStatus(status: DriverResult['status']): boolean {
    return status === 'ready' || status === 'done';
}

async function getPrepareResultForProject(
    projectRoot: string,
    options?: { forceRefresh?: boolean },
): Promise<DriverResult> {
    if (!options?.forceRefresh && latestPrepareResult?.projectRoot === projectRoot) {
        outputChannel?.appendLine('Using cached prepare result for runner start.');
        return latestPrepareResult.result;
    }

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        throw new Error(driverConfigError);
    }

    outputChannel?.appendLine(
        options?.forceRefresh
            ? `Preparing workflow via ${driverConfig.driverPath} before starting runner (force refresh).`
            : `Preparing workflow via ${driverConfig.driverPath} before starting runner.`
    );
    const result = await prepareWorkflow(projectRoot, driverConfig);
    latestPrepareResult = { projectRoot, result };
    latestInspectResult = { projectRoot, result };
    return result;
}

function updateStatusBar(projectRoot: string, result: DriverResult) {
    statusBar?.showResult({
        projectRoot,
        result,
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
    if (trackedWorkflowRoots.length === 0) {
        return;
    }

    const driverConfig = getDriverConfig();
    const driverConfigError = validateDriverConfig(driverConfig);
    if (driverConfigError) {
        return;
    }

    workflowRefreshInFlight = true;
    try {
        for (const projectRoot of trackedWorkflowRoots) {
            await refreshWorkflowSnapshot(projectRoot, driverConfig);
        }
    } finally {
        workflowRefreshInFlight = false;
    }
}

async function refreshWorkflowSnapshot(projectRoot: string, driverConfig?: ReturnType<typeof getDriverConfig>) {
    const resolvedDriverConfig = driverConfig ?? getDriverConfig();
    const result = await inspectWorkflow(projectRoot, resolvedDriverConfig);
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
    reconcileRunnerProcess(projectRoot, result);

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
            lastUpdatedAt: new Date(),
        });
        return;
    }

    statusBar?.showIdle();
}

function getRunnerCommandTemplate(): string {
    return (vscode.workspace.getConfiguration('vibeCoding').get<string>('runnerCommandTemplate') ?? '').trim();
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
                actions: ['showOutput', 'openDriverSettings'],
            });
            return;
        }
    }

    if (!project) {
        await reportWorkflowIssue('No workflow project detected for loop log resolution.', {
            level: 'error',
            details: 'Open a real workflow project root first, or configure vibeCoding.defaultProjectRoot.',
            actions: ['openDriverSettings', 'showOutput'],
        });
        return;
    }

    if (project.missingFiles.length > 0) {
        await reportWorkflowIssue('Open Loop Log needs a valid workflow project root before the fallback path can be resolved.', {
            level: 'warning',
            details: `Missing workflow files: ${project.missingFiles.join(', ')}`,
            actions: ['openDriverSettings', 'showOutput'],
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
            actions: ['showOutput', 'openDriverSettings'],
        });
    }
}

type WorkflowIssueAction = 'showOutput' | 'openDriverSettings' | 'openRunnerSettings' | 'openLoopLog';

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

function appendErrorDetails(error: unknown) {
    if (error instanceof DriverIntegrationError) {
        outputChannel?.appendLine(`error_code=${error.code}`);
        if (error.details) {
            outputChannel?.appendLine(`error_details=${JSON.stringify(error.details)}`);
        }
        return;
    }

    if (error instanceof Error) {
        outputChannel?.appendLine(`error=${error.message}`);
        return;
    }

    outputChannel?.appendLine(`error=${String(error)}`);
}

function formatErrorMessage(error: unknown): string {
    if (error instanceof DriverIntegrationError) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function actionToLabel(action: WorkflowIssueAction): string {
    switch (action) {
        case 'showOutput':
            return 'Show Output';
        case 'openDriverSettings':
            return 'Open Driver Settings';
        case 'openRunnerSettings':
            return 'Open Runner Settings';
        case 'openLoopLog':
            return 'Open Loop Log';
    }
}

async function handleWorkflowIssueAction(selection: string) {
    if (selection === 'Show Output') {
        outputChannel?.show(true);
        return;
    }

    if (selection === 'Open Driver Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'vibeCoding.driverPath');
        return;
    }

    if (selection === 'Open Runner Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'vibeCoding.runnerCommandTemplate');
        return;
    }

    if (selection === 'Open Loop Log') {
        await openLoopLog();
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
    if (error instanceof DriverIntegrationError) {
        detailSegments.push(`error_code=${error.code}`);
    } else if (error instanceof Error) {
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
