import * as vscode from 'vscode';
import { DriverResult } from '../driver/driverTypes';

// ─── REDESIGNED UI ───────────────────────────────────────────────────────────
// Two-phase architecture (design → development → done)
// HITL Review Gate: ready → in_progress → pending_review → ready/blocked → done
// ─────────────────────────────────────────────────────────────────────────────

export const DASHBOARD_PANEL_VIEW_TYPE = 'vibeCodingDashboard';
export const DASHBOARD_SIDEBAR_VIEW_ID = 'vibeCodingDashboardView';

export interface DashboardIssue {
    level: 'error' | 'warning';
    message: string;
    details?: string;
}

export interface DashboardWorkflowFile {
    label: string;
    path: string;
    kind: 'startup' | 'memory' | 'session';
    sessionNumber?: number;
    startedAtLabel?: string;
    endedAtLabel?: string;
    durationLabel?: string;
}

export interface DashboardWorkflowSummary {
    projectRoot: string;
    displayName: string;
    relativePath: string;
    missingFiles: string[];
    statusLabel: string;
    progressLabel: string;
    lastCompletedSession: number | null;
    nextSession: number | null;
    totalSessionCount: number;
    sessionGate: string | null;
    files: DashboardWorkflowFile[];
}

export type DashboardRunnerState = 'idle' | 'starting' | 'running' | 'paused';

export interface DashboardRunnerProcessInfo {
    processName: string;
    pid: number | null;
    startedAtEpochMs?: number | null;
    heartbeatAtEpochMs?: number | null;
}

export interface DashboardState {
    workspaceRoot?: string;
    projectRoot?: string;
    selectedWorkflowRoot?: string;
    workflows?: DashboardWorkflowSummary[];
    result?: DriverResult;
    issue?: DashboardIssue | null;
    lastUpdatedAt?: Date;
    runnerStateByWorkflow?: Record<string, DashboardRunnerState>;
    runnerProcessByWorkflow?: Record<string, DashboardRunnerProcessInfo>;
}

export interface DashboardSessionRow {
    sessionNumber: number;
    title: string;
    progress: string;
    status: string;
    tone: 'completed' | 'current' | 'blocked' | 'pending' | 'done';
}

type SessionPromptExecutionStatus = 'pending' | 'running' | 'completed';

type DashboardMessage = {
    type: 'runCommand';
    command: string;
    args?: unknown[];
};

type DashboardRenderMode = 'panel' | 'sidebar';
type DashboardCommandHandler = (command: string, args?: unknown[]) => Thenable<unknown> | void;

export class WorkflowDashboardPanel implements vscode.Disposable {
    private static currentPanel: WorkflowDashboardPanel | undefined;

    static createOrShow(
        initialState: DashboardState,
        onCommand: DashboardCommandHandler,
    ): WorkflowDashboardPanel {
        if (WorkflowDashboardPanel.currentPanel) {
            WorkflowDashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            WorkflowDashboardPanel.currentPanel.update(initialState);
            void vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
            return WorkflowDashboardPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            DASHBOARD_PANEL_VIEW_TYPE,
            'VibeCoding Workflow Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        WorkflowDashboardPanel.currentPanel = new WorkflowDashboardPanel(panel, initialState, onCommand);
        void vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
        return WorkflowDashboardPanel.currentPanel;
    }

    static updateIfOpen(state: DashboardState) {
        WorkflowDashboardPanel.currentPanel?.update(state);
    }

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly onCommand: DashboardCommandHandler;
    private state: DashboardState;

    private constructor(
        panel: vscode.WebviewPanel,
        initialState: DashboardState,
        onCommand: DashboardCommandHandler,
    ) {
        this.panel = panel;
        this.state = initialState;
        this.onCommand = onCommand;

        this.panel.onDidDispose(() => {
            WorkflowDashboardPanel.currentPanel = undefined;
            this.dispose();
        }, null, this.disposables);

        attachDashboardMessageListener(this.panel.webview, this.onCommand, this.disposables);
        this.render();
    }

    update(state: DashboardState) {
        this.state = mergeDashboardState(this.state, state);
        this.render();
    }

    dispose() {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private render() {
        this.panel.webview.html = getDashboardHtml(this.state, 'panel');
    }
}

export class WorkflowDashboardViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly onCommand: DashboardCommandHandler;
    private readonly onVisible: (() => void) | undefined;
    private state: DashboardState;
    private view: vscode.WebviewView | undefined;

    constructor(
        initialState: DashboardState,
        onCommand: DashboardCommandHandler,
        onVisible?: () => void,
    ) {
        this.state = initialState;
        this.onCommand = onCommand;
        this.onVisible = onVisible;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        attachDashboardMessageListener(webviewView.webview, this.onCommand, this.disposables);
        this.render();

        // When the sidebar panel becomes visible, immediately open the full-screen panel
        // and keep the sidebar as a minimal launcher placeholder.
        if (this.onVisible) {
            this.onVisible();
        }
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible && this.onVisible) {
                    this.onVisible();
                }
            }),
        );
    }

    update(state: DashboardState) {
        this.state = mergeDashboardState(this.state, state);
        this.render();
    }

    dispose() {
        this.view = undefined;
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private render() {
        if (!this.view) {
            return;
        }
        this.view.webview.html = getSidebarLauncherHtml();
    }
}

/** Minimal sidebar HTML — just a launch button. The real UI lives in the full-screen panel. */
function getSidebarLauncherHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    padding: 16px 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0 6px;
  }
  .brand-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #49b470;
    box-shadow: 0 0 6px rgba(73,180,112,0.6);
  }
  .brand-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--vscode-foreground);
    opacity: 0.85;
  }
  .open-btn {
    width: 100%;
    padding: 9px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: opacity 0.15s;
  }
  .open-btn:hover { opacity: 0.88; }
  .hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    line-height: 1.6;
    opacity: 0.7;
  }
</style>
</head>
<body>
  <div class="brand">
    <div class="brand-dot"></div>
    <span class="brand-name">VibeCoding</span>
  </div>
  <button class="open-btn" data-command="vibeCoding.openDashboard">
    ⬡ Open Dashboard
  </button>
  <div class="hint">在全屏面板中打开工作流控制台</div>
</body>
<script>
  const vscodeApi = acquireVsCodeApi();
  document.querySelectorAll('[data-command]').forEach(el => {
    el.addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'runCommand', command: el.getAttribute('data-command') });
    });
  });
</script>
</html>`;
}

function mergeDashboardState(currentState: DashboardState, nextState: DashboardState): DashboardState {
    return {
        ...currentState,
        ...nextState,
        issue: nextState.issue === undefined ? currentState.issue : nextState.issue,
    };
}

function attachDashboardMessageListener(
    webview: vscode.Webview,
    onCommand: DashboardCommandHandler,
    disposables: vscode.Disposable[],
) {
    disposables.push(webview.onDidReceiveMessage((message: DashboardMessage) => {
        if (message.type === 'runCommand' && typeof message.command === 'string') {
            void onCommand(message.command, Array.isArray(message.args) ? message.args : undefined);
        }
    }));
}

function getDashboardHtml(state: DashboardState, mode: DashboardRenderMode): string {
    const result = state.result;
    const issue = state.issue;
    const selectedWorkflowRoot = state.selectedWorkflowRoot ?? state.projectRoot ?? result?.project_root ?? '';
    const selectedRunnerState = state.runnerStateByWorkflow?.[selectedWorkflowRoot] ?? 'idle';
    const selectedWorkflow = (state.workflows ?? []).find((workflow) => workflow.projectRoot === selectedWorkflowRoot);
    const processTableWorkflowRoot = resolveProcessTableWorkflowRoot(state, selectedWorkflowRoot);
    const processTableRunnerState = state.runnerStateByWorkflow?.[processTableWorkflowRoot] ?? 'idle';
    const processTableRunnerProcess = state.runnerProcessByWorkflow?.[processTableWorkflowRoot];
    const processTableWorkflow = (state.workflows ?? []).find((workflow) => workflow.projectRoot === processTableWorkflowRoot);
    const processTableRunnerDbPath = processTableWorkflowRoot
        ? `${processTableWorkflowRoot}/.vibecoding/runner-state.sqlite`
        : 'n/a';
    const processTableRunnerLogPath = processTableWorkflowRoot
        ? `${processTableWorkflowRoot}/.vibecoding/runner.log`
        : 'n/a';
    const workflows = state.workflows ?? [];
    const selectedWorkflowFiles = selectedWorkflow?.files ?? [];
    const selectedStartupFile = selectedWorkflowFiles.find((file) => file.kind === 'startup');
    const selectedSessionPromptFiles = selectedWorkflowFiles
        .filter((file) => file.kind === 'session')
        .sort((left, right) => compareSessionLabels(left.label, right.label));
    const fallbackNextSessionLabel = selectedWorkflow?.nextSession ? `session-${selectedWorkflow.nextSession}-prompt.md` : '';
    const nextSessionPromptPath = result?.artifacts.next_session_prompt_path ?? '';
    const nextSessionPromptLabel = result?.next_session_prompt || basename(nextSessionPromptPath) || fallbackNextSessionLabel;
    const isPanelMode = mode === 'panel';

    // Derive phase and gate from result/workflow
    const currentPhase: string = (result as any)?.current_phase ?? '';
    const sessionGate: string = result?.session_gate ?? selectedWorkflow?.sessionGate ?? '';
    const projectRoot: string = result?.project_root ?? (state.projectRoot ?? '');
    const lastCompletedSession = parseNumericValue(result?.last_completed_session) ?? selectedWorkflow?.lastCompletedSession ?? null;
    const nextSession = parseNumericValue(result?.next_session) ?? selectedWorkflow?.nextSession ?? null;
    const totalSessions = selectedWorkflow?.totalSessionCount ?? 0;
    const progressPct = totalSessions > 0 && lastCompletedSession !== null
        ? Math.round((lastCompletedSession / totalSessions) * 100)
        : 0;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeCoding Workflow Dashboard</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: ${isPanelMode ? '0' : '0'};
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      min-height: 100vh;
    }
    /* ── Layout ── */
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    .topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 ${isPanelMode ? '32px' : '16px'};
      height: 48px;
      background: var(--vscode-titleBar-activeBackground, var(--vscode-sideBar-background));
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .brand {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; opacity: 0.9; white-space: nowrap;
    }
    .brand-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #49b470; box-shadow: 0 0 6px rgba(73,180,112,0.7);
      flex-shrink: 0;
    }
    .topbar-spacer { flex: 1; }
    .topbar-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .debug-btn {
      padding: 3px 9px; border-radius: 4px; font-size: 11px; font-weight: 600;
      background: transparent; color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-panel-border); cursor: pointer; opacity: 0.7;
      font-family: var(--vscode-font-family);
    }
    .debug-btn:hover { opacity: 1; }
    .sync-btn {
      padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
      background: transparent; color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-textLink-foreground); cursor: pointer; opacity: 0.85;
      font-family: var(--vscode-font-family);
    }
    .sync-btn:hover { opacity: 1; background: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent); }
    .debug-panel {
      display: none; font-size: 11px; font-family: var(--vscode-editor-font-family);
      background: rgba(255,200,0,0.08); border: 1px solid rgba(255,200,0,0.35);
      border-radius: 6px; padding: 10px 14px; line-height: 1.8;
      white-space: pre-wrap; word-break: break-all;
    }
    .debug-panel.open { display: block; }
    .content {
      flex: 1;
      padding: ${isPanelMode ? '24px 32px' : '16px'};
      max-width: ${isPanelMode ? '1600px' : '100%'};
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    /* ── Gate banners ── */
    .gate-banner {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 18px; border-radius: 8px; border: 1px solid transparent;
      font-size: 13px; line-height: 1.5;
    }
    .gate-banner-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .gate-banner-body { display: flex; flex-direction: column; gap: 2px; }
    .gate-banner-title { font-weight: 700; font-size: 13px; }
    .gate-banner-desc { opacity: 0.82; font-size: 12px; }
    .gate-pending-review {
      background: rgba(232,173,53,0.12); border-color: rgba(232,173,53,0.45);
      color: #7a4d00;
    }
    .gate-blocked {
      background: rgba(218,30,40,0.10); border-color: rgba(218,30,40,0.40);
      color: #a2191f;
    }
    .gate-banner-actions { display: flex; gap: 8px; margin-top: 10px; }
    button.approve { background: #24a148; color: #fff; border-color: #198038; }
    button.approve:hover { background: #198038; }
    /* ── Issue banner ── */
    .issue-banner {
      padding: 12px 16px; border-radius: 8px;
      border: 1px solid ${issue?.level === 'error' ? 'rgba(218,30,40,0.4)' : 'rgba(220,145,44,0.4)'};
      background: ${issue?.level === 'error' ? 'rgba(218,30,40,0.08)' : 'rgba(220,145,44,0.08)'};
      display: ${issue ? 'block' : 'none'};
      font-size: 13px;
    }
    .issue-banner strong { display: block; margin-bottom: 4px; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; }
    /* ── Stats row ── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .stat-card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 14px 16px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; }
    .stat-value { font-size: 22px; font-weight: 700; line-height: 1; }
    .stat-sub { font-size: 11px; opacity: 0.6; }
    /* ── Progress bar ── */
    .progress-track {
      height: 4px; border-radius: 2px;
      background: var(--vscode-panel-border);
      overflow: hidden; margin-top: 4px;
    }
    .progress-fill {
      height: 100%; border-radius: 2px;
      background: linear-gradient(90deg, #24a148, #49b470);
      transition: width 0.4s ease;
    }
    /* ── Runner card ── */
    .runner-card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px 18px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .runner-card-header {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .runner-card-title { font-size: 13px; font-weight: 700; }
    .runner-card-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 8px 24px;
      font-size: 12px;
    }
    .runner-meta-item { display: flex; gap: 6px; align-items: baseline; }
    .runner-meta-label { opacity: 0.6; white-space: nowrap; flex-shrink: 0; }
    .runner-meta-value { font-family: var(--vscode-editor-font-family); word-break: break-all; }
    .runner-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    /* ── Panels ── */
    .panels-grid {
      display: grid;
      grid-template-columns: ${isPanelMode ? 'minmax(380px,1fr) minmax(520px,1.6fr)' : '1fr'};
      gap: 16px;
      align-items: start;
    }
    .panel {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: color-mix(in srgb, var(--vscode-editor-background) 60%, var(--vscode-sideBar-background));
    }
    .panel-title { font-size: 13px; font-weight: 700; }
    .panel-subtitle { font-size: 11px; opacity: 0.6; font-family: var(--vscode-editor-font-family); word-break: break-all; }
    .panel-body { overflow-x: auto; }
    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th {
      padding: 8px 12px; text-align: left;
      font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
      background: color-mix(in srgb, var(--vscode-editor-background) 80%, black 20%);
      border-bottom: 1px solid var(--vscode-panel-border);
      white-space: nowrap; opacity: 0.85;
    }
    td {
      padding: 10px 12px; vertical-align: top;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent);
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent); }
    .row-selected td { background: color-mix(in srgb, rgba(73,180,112,0.15) 80%, transparent) !important; }
    .row-running td { animation: row-breathe 2.2s ease-in-out infinite; }
    .row-current td:first-child { box-shadow: inset 3px 0 0 #49b470; }
    @keyframes row-breathe {
      0%,100% { background: color-mix(in srgb, rgba(73,180,112,0.08) 100%, transparent); }
      50% { background: color-mix(in srgb, rgba(73,180,112,0.22) 100%, transparent); }
    }
    /* ── Pills ── */
    .pill {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: 999px; border: 1px solid transparent;
      font-size: 11px; font-weight: 700; white-space: nowrap; line-height: 1.4;
    }
    .pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    /* runner state */
    .pill-idle { color: #c6c6c6; background: #393939; border-color: #525252; }
    .pill-starting { color: #261700; background: #ffd7a0; border-color: #ffb84d; }
    .pill-running { color: #04351e; background: #a7f0ba; border-color: #24a148; animation: pill-pulse 1.8s ease-in-out infinite; }
    .pill-paused { color: #4c2d00; background: #f1c21b; border-color: #8a3c00; }
    .pill-done { color: #04351e; background: #a7f0ba; border-color: #24a148; }
    /* session status */
    .pill-completed { color: #0b63ce; background: rgba(32,125,255,0.14); border-color: rgba(32,125,255,0.3); }
    .pill-pending { color: var(--vscode-foreground); background: var(--vscode-badge-background); border-color: var(--vscode-panel-border); opacity: 0.7; }
    .pill-blocked { color: #a2191f; background: rgba(218,30,40,0.12); border-color: rgba(218,30,40,0.35); }
    .pill-pending-review { color: #7a4d00; background: rgba(232,173,53,0.18); border-color: rgba(232,173,53,0.4); }
    /* phase */
    .pill-phase-design { color: #6929c4; background: rgba(105,41,196,0.12); border-color: rgba(105,41,196,0.3); }
    .pill-phase-development { color: #0b63ce; background: rgba(11,99,206,0.12); border-color: rgba(11,99,206,0.3); }
    .pill-phase-done { color: #04351e; background: rgba(36,161,72,0.14); border-color: rgba(36,161,72,0.3); }
    /* next session */
    .pill-next { color: #7a4d00; background: rgba(232,173,53,0.18); border-color: rgba(232,173,53,0.35); }
    @keyframes pill-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(73,180,112,0); }
      50% { box-shadow: 0 0 0 4px rgba(73,180,112,0.2); }
    }
    @keyframes dot-ping {
      0% { box-shadow: 0 0 0 0 rgba(73,180,112,0.6); }
      70% { box-shadow: 0 0 0 8px rgba(73,180,112,0); }
      100% { box-shadow: 0 0 0 0 rgba(73,180,112,0); }
    }
    .dot-running { background: #49b470; animation: dot-ping 1.6s ease-out infinite; }
    .dot-completed { background: #207dff; }
    .dot-pending { background: color-mix(in srgb, var(--vscode-foreground) 40%, transparent); }
    /* ── Buttons ── */
    button {
      padding: 6px 12px; border-radius: 5px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font: inherit; font-size: 12px; cursor: pointer;
      white-space: nowrap;
    }
    button:hover { opacity: 0.88; }
    button.secondary {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border-color: var(--vscode-panel-border);
    }
    button.secondary:hover { background: color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent); }
    button.danger { background: #a2191f; color: #fff; border-color: #da1e28; }
    button.danger:hover { background: #c21f2b; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    /* ── Misc ── */
    .mono { font-family: var(--vscode-editor-font-family); }
    .muted { opacity: 0.6; }
    .check-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%;
      background: linear-gradient(135deg,#24a148,#49b470);
      color: #fff; font-size: 11px; font-weight: 900; flex-shrink: 0;
    }
    .cell-warn { color: #da1e28; font-size: 11px; margin-top: 3px; }
    .path-text { font-size: 11px; opacity: 0.6; word-break: break-all; font-family: var(--vscode-editor-font-family); }
    .timing-grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 11px; margin-top: 4px; }
    .timing-label { opacity: 0.6; white-space: nowrap; }
    .timing-value { font-family: var(--vscode-editor-font-family); }
    .session-actions { display: flex; gap: 6px; }
    @media (max-width: ${isPanelMode ? '860px' : '9999px'}) {
      .panels-grid { grid-template-columns: 1fr; }
      .stats-row { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Top bar ── -->
  <header class="topbar">
    <div class="brand">
      <div class="brand-dot"></div>
      <span>VibeCoding</span>
    </div>
    <div class="topbar-spacer"></div>
    <div class="topbar-meta">
      ${currentPhase ? `<span class="pill pill-phase-${escapeHtml(currentPhase)}">Phase: ${escapeHtml(currentPhase)}</span>` : ''}
      ${renderGatePill(sessionGate)}
      ${renderRunnerStatePill(processTableRunnerState)}
      <button class="sync-btn" data-command="vibeCoding.syncAndReload">⟳ Sync & Reload</button>
      <button class="debug-btn" id="debugToggleBtn">Debug</button>
    </div>
  </header>

  <div class="content">

    <!-- ── Debug panel ── -->
    <div class="debug-panel" id="debugPanel">sessionGate = ${escapeHtml(sessionGate || '(empty)')}
projectRoot  = ${escapeHtml(projectRoot || '(empty)')}
result       = ${result ? 'loaded' : 'undefined (driver not called yet)'}
selectedWorkflow.sessionGate = ${escapeHtml(selectedWorkflow?.sessionGate ?? '(none)')}
lastCompletedSession = ${String(lastCompletedSession ?? '-')}
nextSession          = ${String(nextSession ?? '-')}
totalSessions        = ${String(totalSessions)}
progressPct          = ${progressPct}%</div>

    <!-- ── HITL banners ── -->
    ${sessionGate === 'pending_review' ? `
    <div class="gate-banner gate-pending-review">
      <div class="gate-banner-icon">⏸</div>
      <div class="gate-banner-body">
        <div class="gate-banner-title">等待人工验收 — Session 已完成</div>
        <div class="gate-banner-desc">请检查产出物和代码变更，确认无误后批准推进，或驳回并填写原因。</div>
        <div class="gate-banner-actions">
          ${commandButton('vibeCoding.approveSession', '✅ 批准，推进下一 Session', false, [projectRoot], { className: 'approve' })}
          ${commandButton('vibeCoding.rejectSession', '❌ 驳回', true, [projectRoot])}
        </div>
      </div>
    </div>` : ''}
    ${sessionGate === 'blocked' ? `
    <div class="gate-banner gate-blocked">
      <div class="gate-banner-icon">⛔</div>
      <div class="gate-banner-body">
        <div class="gate-banner-title">Session 已驳回</div>
        <div class="gate-banner-desc">请查看 memory.md 中的 review_notes，修复问题后点击重新开放。</div>
        <div class="gate-banner-actions">
          ${commandButton('vibeCoding.approveSession', '🔄 重新开放本 Session', false, [projectRoot], { className: 'approve' })}
        </div>
      </div>
    </div>` : ''}

    <!-- ── Issue banner ── -->
    <div class="issue-banner">
      <strong>${escapeHtml(issue?.level?.toUpperCase() ?? '')}</strong>
      <div>${escapeHtml(issue?.message ?? '')}</div>
      <div style="margin-top:4px;opacity:0.75;">${escapeHtml(issue?.details ?? '')}</div>
    </div>

    <!-- ── Stats row ── -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">已完成 Session</div>
        <div class="stat-value">${escapeHtml(String(lastCompletedSession ?? '-'))}</div>
        <div class="stat-sub">共 ${escapeHtml(String(totalSessions || '-'))} 个</div>
        <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">下一个 Session</div>
        <div class="stat-value">${nextSession !== null ? escapeHtml(String(nextSession)) : '-'}</div>
        <div class="stat-sub">${escapeHtml(nextSessionPromptLabel || '-')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">工作流数量</div>
        <div class="stat-value">${workflows.length}</div>
        <div class="stat-sub">当前工作区</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">进度</div>
        <div class="stat-value">${progressPct}%</div>
        <div class="stat-sub">${escapeHtml(selectedWorkflow?.statusLabel ?? '-')}</div>
      </div>
    </div>

    <!-- ── Runner card ── -->
    <div class="runner-card">
      <div class="runner-card-header">
        <span class="runner-card-title">调度驱动器</span>
        ${renderRunnerStatePill(processTableRunnerState)}
        ${processTableRunnerProcess?.pid ? `<span class="pill pill-idle mono">PID ${escapeHtml(String(processTableRunnerProcess.pid))}</span>` : ''}
      </div>
      <div class="runner-card-meta">
        <div class="runner-meta-item">
          <span class="runner-meta-label">进程</span>
          <span class="runner-meta-value mono">${escapeHtml(processTableRunnerProcess?.processName ?? 'n/a')}</span>
        </div>
        <div class="runner-meta-item">
          <span class="runner-meta-label">启动时间</span>
          <span class="runner-meta-value" data-timestamp-epoch="${escapeHtml(String(processTableRunnerProcess?.startedAtEpochMs ?? ''))}">${escapeHtml(formatTimestampValue(processTableRunnerProcess?.startedAtEpochMs ?? null))}</span>
        </div>
        <div class="runner-meta-item">
          <span class="runner-meta-label">运行时长</span>
          <span class="runner-meta-value" data-duration-from-epoch="${escapeHtml(String(processTableRunnerProcess?.startedAtEpochMs ?? ''))}">${escapeHtml(processTableRunnerProcess?.startedAtEpochMs ? formatDuration(Date.now() - processTableRunnerProcess.startedAtEpochMs) : '-')}</span>
        </div>
        <div class="runner-meta-item">
          <span class="runner-meta-label">心跳</span>
          <span class="runner-meta-value" data-timestamp-epoch="${escapeHtml(String(processTableRunnerProcess?.heartbeatAtEpochMs ?? ''))}">${escapeHtml(formatTimestampValue(processTableRunnerProcess?.heartbeatAtEpochMs ?? null))}</span>
        </div>
        <div class="runner-meta-item">
          <span class="runner-meta-label">状态库</span>
          <span class="runner-meta-value mono">${escapeHtml(processTableRunnerDbPath)}</span>
        </div>
        <div class="runner-meta-item">
          <span class="runner-meta-label">日志</span>
          <span class="runner-meta-value mono">${escapeHtml(processTableRunnerLogPath)}</span>
        </div>
      </div>
      <div class="runner-actions">
        ${renderRunnerControls(processTableWorkflowRoot, processTableRunnerState, processTableWorkflow, result)}
      </div>
    </div>

    <!-- ── Workflow + Session panels ── -->
    <div class="panels-grid">

      <!-- Left: Workflow list -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">工作流列表</span>
          <span class="muted" style="font-size:11px;">${workflows.length} 个任务</span>
        </div>
        <div class="panel-body">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>任务名称</th>
                <th>状态</th>
                <th>进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${workflows.length > 0
                ? workflows.map((workflow, index) => renderWorkflowTreeItem(workflow, selectedWorkflowRoot, state.runnerStateByWorkflow ?? {}, selectedRunnerState, index)).join('')
                : '<tr><td colspan="5" style="padding:20px;text-align:center;opacity:0.5;">未找到 startup-prompt.md</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right: Session timeline -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Session 时间线</span>
          <span class="panel-subtitle">${escapeHtml(selectedStartupFile?.path ?? 'n/a')}</span>
        </div>
        <div class="panel-body">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${selectedSessionPromptFiles.length > 0
                ? selectedSessionPromptFiles.map((file) => renderSessionPromptFileRow(file, selectedWorkflow, selectedWorkflowRoot, nextSessionPromptPath, nextSessionPromptLabel, result, selectedRunnerState, processTableRunnerProcess)).join('')
                : '<tr><td colspan="4" style="padding:20px;text-align:center;opacity:0.5;">未找到 session 文件</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const formatTimestamp = (epochMs) => {
    const parsed = Number(epochMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return '-';
    return new Date(parsed).toLocaleString('zh-CN', { hour12: false });
  };
  const formatDuration = (durationMs) => {
    const parsed = Number(durationMs);
    if (!Number.isFinite(parsed) || parsed < 0) return '-';
    const totalSeconds = Math.floor(parsed / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return hours + 'h ' + minutes + 'm ' + seconds + 's';
    if (minutes > 0) return minutes + 'm ' + seconds + 's';
    return seconds + 's';
  };
  const refreshProcessMetrics = () => {
    document.querySelectorAll('[data-timestamp-epoch]').forEach((node) => {
      const epoch = node.getAttribute('data-timestamp-epoch');
      node.textContent = epoch ? formatTimestamp(epoch) : '-';
    });
    document.querySelectorAll('[data-duration-from-epoch]').forEach((node) => {
      const epoch = Number(node.getAttribute('data-duration-from-epoch'));
      node.textContent = (Number.isFinite(epoch) && epoch > 0) ? formatDuration(Date.now() - epoch) : '-';
    });
  };
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      const rawArgs = button.getAttribute('data-args');
      vscode.postMessage({
        type: 'runCommand',
        command: button.getAttribute('data-command'),
        args: rawArgs ? JSON.parse(rawArgs) : undefined,
      });
    });
  });
  refreshProcessMetrics();
  window.setInterval(refreshProcessMetrics, 1000);
  // Debug toggle
  const debugBtn = document.getElementById('debugToggleBtn');
  const debugPanel = document.getElementById('debugPanel');
  if (debugBtn && debugPanel) {
    debugBtn.addEventListener('click', () => {
      const open = debugPanel.classList.toggle('open');
      debugBtn.textContent = open ? 'Debug ▲' : 'Debug';
    });
  }
</script>
</body>
</html>`;
}

function commandButton(
    command: string,
    label: string,
    secondary = false,
    args?: unknown[],
    options?: { disabled?: boolean; className?: string },
): string {
    const encodedArgs = args ? ` data-args="${escapeHtml(JSON.stringify(args))}"` : '';
    const disabledAttr = options?.disabled ? ' disabled' : '';
    const classNames = [secondary ? 'secondary' : '', options?.className ?? ''].filter(Boolean).join(' ');
    return `<button class="${classNames}" data-command="${escapeHtml(command)}"${encodedArgs}${disabledAttr}>${escapeHtml(label)}</button>`;
}

function resolveProcessTableWorkflowRoot(state: DashboardState, fallbackWorkflowRoot: string): string {
    const runnerStateByWorkflow = state.runnerStateByWorkflow ?? {};
    const runnerProcessByWorkflow = state.runnerProcessByWorkflow ?? {};
    const candidateRoots = new Set<string>([
        ...Object.keys(runnerStateByWorkflow),
        ...Object.keys(runnerProcessByWorkflow),
    ]);

    let resolvedWorkflowRoot = '';
    let resolvedPriority = -1;
    let resolvedHeartbeat = -1;

    for (const workflowRoot of candidateRoots) {
        const runnerState = runnerStateByWorkflow[workflowRoot] ?? 'idle';
        if (runnerState === 'idle') {
            continue;
        }

        const processInfo = runnerProcessByWorkflow[workflowRoot];
        const priority = getRunnerStatePriority(runnerState);
        const heartbeat = processInfo?.heartbeatAtEpochMs ?? -1;
        if (priority > resolvedPriority || (priority === resolvedPriority && heartbeat > resolvedHeartbeat)) {
            resolvedWorkflowRoot = workflowRoot;
            resolvedPriority = priority;
            resolvedHeartbeat = heartbeat;
        }
    }

    return resolvedWorkflowRoot || fallbackWorkflowRoot;
}

function getRunnerStatePriority(runnerState: DashboardRunnerState): number {
    if (runnerState === 'running') {
        return 3;
    }
    if (runnerState === 'paused') {
        return 2;
    }
    if (runnerState === 'starting') {
        return 1;
    }
    return 0;
}

function renderWorkflowTreeItem(
    workflow: DashboardWorkflowSummary,
    selectedWorkflowRoot: string,
    runnerStateByWorkflow: Record<string, DashboardRunnerState>,
    _selectedRunnerState: DashboardRunnerState,
    index: number,
): string {
    const startupFile = workflow.files.find((file) => file.kind === 'startup');
    const startupPath = startupFile?.path ?? workflow.relativePath;
    const isSelected = workflow.projectRoot === selectedWorkflowRoot;
    const startupLabel = startupFile?.label ?? 'startup-prompt.md';
    const runnerState = runnerStateByWorkflow[workflow.projectRoot] ?? 'idle';
    const isDone = workflow.statusLabel === '完成';
    const rowClass = isSelected ? 'row-selected' : '';
    const missingHtml = workflow.missingFiles.length > 0
        ? `<div class="cell-warn">缺少: ${escapeHtml(workflow.missingFiles.map((f) => basename(f)).join(', '))}</div>`
        : '';

    let statusPill = '';
    if (isDone) {
        statusPill = '<span class="pill pill-done">✓ 完成</span>';
    } else if (runnerState === 'running') {
        statusPill = '<span class="pill pill-running"><span class="pill-dot dot-running"></span>执行中</span>';
    } else if (runnerState === 'paused') {
        statusPill = '<span class="pill pill-paused">已暂停</span>';
    } else if (runnerState === 'starting') {
        statusPill = '<span class="pill pill-starting">启动中</span>';
    } else {
        statusPill = `<span class="pill pill-pending">${escapeHtml(workflow.statusLabel || '未开始')}</span>`;
    }

    return `<tr class="${rowClass}">
      <td style="text-align:center;font-weight:700;opacity:0.5;width:36px;">${index + 1}</td>
      <td>
        <div style="font-weight:600;font-size:12px;">${escapeHtml(startupLabel)}${isDone ? ' <span class="check-badge">✓</span>' : ''}</div>
        <div class="path-text" style="margin-top:2px;">${escapeHtml(startupPath)}</div>
        ${missingHtml}
      </td>
      <td>${statusPill}</td>
      <td style="font-size:11px;opacity:0.7;white-space:nowrap;">${escapeHtml(workflow.progressLabel)}</td>
      <td>${commandButton('vibeCoding.selectWorkflow', isSelected ? '已选中' : '选择', isSelected, [workflow.projectRoot], { disabled: isDone })}</td>
    </tr>`;
}

function renderSessionPromptFileRow(
    file: DashboardWorkflowFile,
    selectedWorkflow: DashboardWorkflowSummary | undefined,
    selectedWorkflowRoot: string,
    nextSessionPromptPath: string,
    nextSessionPromptLabel: string,
    result: DriverResult | undefined,
    runnerState: DashboardRunnerState,
    runnerProcess: DashboardRunnerProcessInfo | undefined,
): string {
    const isNextSession = file.path === nextSessionPromptPath || file.label === nextSessionPromptLabel;
    const executionStatus = resolveSessionPromptExecutionStatus(file, selectedWorkflow, result, runnerState, isNextSession);
    const isCurrent = isCurrentSessionPrompt(file, selectedWorkflow, result, isNextSession);
    const timing = resolveSessionPromptTiming(file, executionStatus, runnerProcess);

    const rowClasses = ['row-' + executionStatus, isCurrent ? 'row-current' : ''].filter(Boolean).join(' ');

    let statusPill = '';
    if (executionStatus === 'running') {
        statusPill = '<span class="pill pill-running"><span class="pill-dot dot-running"></span>执行中</span>';
    } else if (executionStatus === 'completed') {
        statusPill = '<span class="pill pill-completed"><span class="pill-dot dot-completed"></span>✓ 完成</span>';
    } else {
        statusPill = '<span class="pill pill-pending"><span class="pill-dot dot-pending"></span>未执行</span>';
    }

    const nextBadge = isNextSession
        ? '<span class="pill pill-next" style="margin-left:6px;">↑ 下一个</span>'
        : '';

    const startedEl = executionStatus === 'running' && runnerProcess?.startedAtEpochMs
        ? `<span data-timestamp-epoch="${escapeHtml(String(runnerProcess.startedAtEpochMs))}">${escapeHtml(timing.startedAtLabel)}</span>`
        : `<span>${escapeHtml(timing.startedAtLabel)}</span>`;
    const durationEl = executionStatus === 'running' && runnerProcess?.startedAtEpochMs
        ? `<span data-duration-from-epoch="${escapeHtml(String(runnerProcess.startedAtEpochMs))}">${escapeHtml(timing.durationLabel)}</span>`
        : `<span>${escapeHtml(timing.durationLabel)}</span>`;

    return `<tr class="${rowClasses}">
      <td>
        <div style="font-weight:600;font-size:12px;">${escapeHtml(file.label)}${nextBadge}</div>
        <div class="path-text" style="margin-top:2px;">${escapeHtml(file.path)}</div>
      </td>
      <td>${statusPill}</td>
      <td>
        <div class="timing-grid">
          <span class="timing-label">开始</span>${startedEl}
          <span class="timing-label">结束</span><span>${escapeHtml(timing.endedAtLabel)}</span>
          <span class="timing-label">耗时</span>${durationEl}
        </div>
      </td>
      <td>
        <div class="session-actions">
          ${commandButton('vibeCoding.openWorkflowFileAtPath', '打开', true, [selectedWorkflowRoot, file.path, file.label])}
        </div>
      </td>
    </tr>`;
}


function renderRunnerControls(
    selectedWorkflowRoot: string,
    runnerState: DashboardRunnerState,
    _selectedWorkflow: DashboardWorkflowSummary | undefined,
    _result: DriverResult | undefined,
): string {
    if (!selectedWorkflowRoot) {
        return '';
    }

    return `<div class="runner-controls">
      ${commandButton('vibeCoding.activateWorkflowRunner', '启动', false, [selectedWorkflowRoot], {
          disabled: runnerState === 'starting' || runnerState === 'running',
      })}
      ${commandButton('vibeCoding.cancelWorkflowRunner', '停止', true, [selectedWorkflowRoot], {
          disabled: runnerState !== 'running' && runnerState !== 'paused',
      })}
      ${commandButton('vibeCoding.killWorkflowRunner', 'killpid', false, [selectedWorkflowRoot], {
          disabled: runnerState === 'idle',
          className: 'danger',
      })}
    </div>`;
}

function renderRunnerStatePill(runnerState: DashboardRunnerState): string {
    if (runnerState === 'starting') {
        return '<span class="pill pill-starting">启动中</span>';
    }
    if (runnerState === 'running') {
        return '<span class="pill pill-running"><span class="pill-dot dot-running"></span>执行中</span>';
    }
    if (runnerState === 'paused') {
        return '<span class="pill pill-paused">已暂停</span>';
    }
    return '<span class="pill pill-idle">未启动</span>';
}

function renderGatePill(sessionGate: string): string {
    if (!sessionGate) return '';
    if (sessionGate === 'ready') return '<span class="pill pill-completed">Gate: 就绪</span>';
    if (sessionGate === 'in_progress') return '<span class="pill pill-running"><span class="pill-dot dot-running"></span>Gate: 执行中</span>';
    if (sessionGate === 'pending_review') return '<span class="pill pill-pending-review">Gate: 待验收</span>';
    if (sessionGate === 'blocked') return '<span class="pill pill-blocked">Gate: 已驳回</span>';
    if (sessionGate === 'done') return '<span class="pill pill-done">Gate: 已完成</span>';
    return `<span class="pill pill-pending">Gate: ${escapeHtml(sessionGate)}</span>`;
}

function resolveSessionPromptTiming(
    file: DashboardWorkflowFile,
    executionStatus: SessionPromptExecutionStatus,
    runnerProcess: DashboardRunnerProcessInfo | undefined,
): { startedAtLabel: string; endedAtLabel: string; durationLabel: string } {
    if (executionStatus === 'running' && runnerProcess?.startedAtEpochMs) {
        return {
            startedAtLabel: formatTimestamp(new Date(runnerProcess.startedAtEpochMs)),
            endedAtLabel: '-',
            durationLabel: formatDuration(Date.now() - runnerProcess.startedAtEpochMs),
        };
    }

    return {
        startedAtLabel: file.startedAtLabel ?? '-',
        endedAtLabel: file.endedAtLabel ?? '-',
        durationLabel: file.durationLabel ?? '-',
    };
}

function resolveSessionPromptExecutionStatus(
    file: DashboardWorkflowFile,
    selectedWorkflow: DashboardWorkflowSummary | undefined,
    result: DriverResult | undefined,
    runnerState: DashboardRunnerState,
    isNextSession: boolean,
): SessionPromptExecutionStatus {
    const sessionNumber = parseSessionPromptNumber(file.label) ?? parseSessionPromptNumber(file.path);
    const lastCompletedSession = parseNumericValue(result?.last_completed_session) ?? selectedWorkflow?.lastCompletedSession ?? null;
    const workflowNextSession = parseNumericValue(result?.next_session) ?? selectedWorkflow?.nextSession ?? null;
    const effectiveIsNextSession = isNextSession || (sessionNumber !== null && workflowNextSession !== null && sessionNumber === workflowNextSession);

    if (sessionNumber !== null && lastCompletedSession !== null && sessionNumber <= lastCompletedSession) {
        return 'completed';
    }

    if (effectiveIsNextSession && (runnerState === 'running' || runnerState === 'paused')) {
        return 'running';
    }

    return 'pending';
}

function isCurrentSessionPrompt(
    file: DashboardWorkflowFile,
    selectedWorkflow: DashboardWorkflowSummary | undefined,
    result: DriverResult | undefined,
    isNextSession: boolean,
): boolean {
    if (isNextSession) {
        return true;
    }

    const sessionNumber = parseSessionPromptNumber(file.label) ?? parseSessionPromptNumber(file.path);
    const workflowNextSession = parseNumericValue(result?.next_session) ?? selectedWorkflow?.nextSession ?? null;
    return sessionNumber !== null && workflowNextSession !== null && sessionNumber === workflowNextSession;
}

function parseSessionPromptNumber(value: string): number | null {
    const match = value.match(/session-(\d+)-prompt\.md$/);
    if (!match) {
        return null;
    }

    return Number.parseInt(match[1], 10);
}

function parseNumericValue(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function formatTimestamp(value: Date): string {
    return value.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return '-';
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

function formatTimestampValue(epochMs: number | null | undefined): string {
    if (!epochMs || !Number.isFinite(epochMs)) {
        return '-';
    }

    return formatTimestamp(new Date(epochMs));
}

function basename(filePath: string): string {
    const segments = filePath.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : filePath;
}

function compareSessionLabels(left: string, right: string): number {
    const leftMatch = left.match(/session-(\d+)-prompt\.md$/);
    const rightMatch = right.match(/session-(\d+)-prompt\.md$/);
    const leftIndex = leftMatch ? Number.parseInt(leftMatch[1], 10) : Number.MAX_SAFE_INTEGER;
    const rightIndex = rightMatch ? Number.parseInt(rightMatch[1], 10) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.localeCompare(right);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
