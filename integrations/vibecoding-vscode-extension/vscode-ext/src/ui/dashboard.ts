import * as vscode from 'vscode';
import { DriverResult } from '../driver/driverTypes';

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
    private state: DashboardState;
    private view: vscode.WebviewView | undefined;

    constructor(initialState: DashboardState, onCommand: DashboardCommandHandler) {
        this.state = initialState;
        this.onCommand = onCommand;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        attachDashboardMessageListener(webviewView.webview, this.onCommand, this.disposables);
        this.render();
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
        this.view.webview.html = getDashboardHtml(this.state, 'sidebar');
    }
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

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeCoding Workflow Dashboard</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 24px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .wrap {
      max-width: 1240px;
      margin: 0 auto;
    }
    .hero {
      padding: 24px;
      border-radius: 20px;
      border: 1px solid var(--vscode-panel-border);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent), transparent 36%),
        linear-gradient(135deg, color-mix(in srgb, var(--vscode-editorWidget-background) 94%, transparent), var(--vscode-editor-background));
    }
    .hero-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.72;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.15;
    }
    .grid,
    .workflow-grid,
    .snapshot-grid {
      display: grid;
      gap: 16px;
    }
    .grid {
      grid-template-columns: 1.2fr 1fr;
      margin-top: 20px;
    }
    .workflow-grid {
      grid-template-columns: ${isPanelMode ? 'minmax(320px, 0.95fr) minmax(540px, 1.25fr)' : '1fr'};
      margin-top: 20px;
      align-items: start;
    }
    .snapshot-grid {
      grid-template-columns: 1.1fr 1fr;
      margin-top: 20px;
      align-items: start;
    }
    .session-panel {
      margin-top: 20px;
    }
    .panel,
    .issue {
      border-radius: 18px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      padding: 18px;
    }
    .active-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 13px;
      border: 1px solid transparent;
    }
    .active-pill {
      color: #136c37;
      background: rgba(73, 180, 112, 0.24);
      border-color: rgba(73, 180, 112, 0.42);
    }
    .next-pill {
      color: #7a4d00;
      background: rgba(232, 173, 53, 0.18);
      border-color: rgba(232, 173, 53, 0.28);
    }
    button {
      width: 100%;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    button.secondary,
    button.tree-button {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border-color: var(--vscode-panel-border);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary:hover,
    .tree-button:hover {
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .panel-heading {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .panel-heading h2 {
      margin: 0;
    }
    .panel-heading-path {
      font-size: 12px;
      opacity: 0.72;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family);
    }
    h3 {
      margin: 0;
      font-size: 16px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .carbon-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 82%, var(--vscode-foreground) 18%);
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 92%, transparent);
      font-size: 13px;
    }
    .carbon-table th,
    .carbon-table td {
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 76%, var(--vscode-foreground) 24%);
      vertical-align: top;
      text-align: left;
    }
    .carbon-table th {
      background: color-mix(in srgb, var(--vscode-editor-background) 78%, black 22%);
      color: var(--vscode-foreground);
      opacity: 0.9;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .carbon-table td {
      background: color-mix(in srgb, var(--vscode-sideBar-background) 94%, transparent);
    }
    .carbon-table tbody tr:hover td {
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 86%, var(--vscode-textLink-foreground) 14%);
    }
    .carbon-table-row-selected td {
      background: color-mix(in srgb, rgba(73, 180, 112, 0.18) 78%, var(--vscode-sideBar-background));
    }
    .carbon-table-row-selected:hover td {
      background: color-mix(in srgb, rgba(73, 180, 112, 0.24) 80%, var(--vscode-sideBar-background));
    }
    .carbon-table-cell-index {
      width: 64px;
      text-align: center;
      white-space: nowrap;
    }
    .carbon-table-cell-status,
    .carbon-table-cell-progress,
    .carbon-table-cell-runtime {
      white-space: nowrap;
    }
    .carbon-table-cell-actions {
      width: 150px;
    }
    .carbon-table-cell-actions button {
      width: auto;
      min-width: 88px;
      border-radius: 0;
    }
    .process-cell-mono {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .process-name-stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .process-name-primary {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .process-name-secondary {
      font-size: 12px;
      opacity: 0.72;
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .process-cell-status {
      width: 240px;
      min-width: 240px;
      max-width: 240px;
    }
    .process-status-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .process-status-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      font-size: 12px;
      line-height: 1.4;
      width: 100%;
    }
    .process-status-label {
      opacity: 0.72;
      white-space: nowrap;
    }
    .process-status-value {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .process-cell-actions {
      width: 168px;
      min-width: 168px;
      max-width: 168px;
    }
    .process-pid-stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .process-pid-primary {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .process-pid-secondary {
      font-size: 12px;
      opacity: 0.72;
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .process-table.carbon-table {
      border: 2px solid color-mix(in srgb, var(--vscode-foreground) 52%, var(--vscode-editor-background) 48%);
      background: color-mix(in srgb, var(--vscode-sideBar-background) 96%, var(--vscode-editor-background));
    }
    .process-table.carbon-table th,
    .process-table.carbon-table td {
      border: 1px solid color-mix(in srgb, var(--vscode-foreground) 38%, var(--vscode-editor-background) 62%);
    }
    .process-table.carbon-table th {
      color: #ffffff;
      background: #1f3a5f;
      border-bottom: 2px solid #162a45;
    }
    .process-table.carbon-table td {
      background: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--vscode-editor-background) 8%);
    }
    .process-table.carbon-table tbody tr:hover td {
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 82%, var(--vscode-textLink-foreground) 18%);
    }
    .process-table.carbon-table .runner-controls button {
      min-width: 64px;
      padding: 10px 10px;
    }
    .issue {
      margin-top: 20px;
      border-color: ${issue?.level === 'error' ? 'rgba(255, 99, 71, 0.35)' : 'rgba(220, 145, 44, 0.35)'};
      display: ${issue ? 'block' : 'none'};
    }
    .issue strong {
      display: inline-block;
      margin-bottom: 8px;
    }
    .tips {
      margin: 0;
      padding-left: 18px;
      line-height: 1.7;
    }
    .runner-state-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .runner-state-idle {
      color: #f4f4f4;
      background: #525252;
      border-color: #8d8d8d;
    }
    .runner-state-starting {
      color: #261700;
      background: #ffd7a0;
      border-color: #ffb84d;
    }
    .runner-state-running {
      color: #04351e;
      background: #a7f0ba;
      border-color: #24a148;
    }
    .runner-state-paused {
      color: #4c2d00;
      background: #f1c21b;
      border-color: #8a3c00;
    }
    .runner-state-completed {
      color: #04351e;
      background: #a7f0ba;
      border-color: #24a148;
    }
    .startup-row-title {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.35;
    }
    .startup-row-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .startup-status-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .startup-status-not_started {
      color: var(--vscode-foreground);
      background: var(--vscode-badge-background);
      border-color: var(--vscode-panel-border);
    }
    .startup-status-in_progress {
      color: #0b63ce;
      background: rgba(32, 125, 255, 0.15);
      border-color: rgba(32, 125, 255, 0.24);
    }
    .startup-status-done {
      color: #1f6f43;
      background: rgba(73, 180, 112, 0.18);
      border-color: rgba(73, 180, 112, 0.28);
    }
    .startup-progress {
      font-size: 12px;
      opacity: 0.76;
      white-space: nowrap;
    }
    .workflow-path {
      font-size: 12px;
      opacity: 0.7;
      word-break: break-word;
    }
    .session-file-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .runner-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .runner-controls button {
      width: auto;
      min-width: 88px;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
      color: var(--vscode-disabledForeground);
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
      border-color: var(--vscode-panel-border);
    }
    .danger {
      color: #ffffff;
      background: #a2191f;
      border-color: #da1e28;
    }
    .danger:hover {
      background: #c21f2b;
    }
    .session-file-actions button {
      width: auto;
      min-width: 92px;
    }
    .session-time-cell {
      white-space: nowrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .session-row-running {
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 74%, rgba(73, 180, 112, 0.20));
    }
    @keyframes session-row-breathe {
      0% {
        box-shadow: inset 4px 0 0 rgba(73, 180, 112, 0.28);
        background: color-mix(in srgb, var(--vscode-editorWidget-background) 74%, rgba(73, 180, 112, 0.16));
      }
      50% {
        box-shadow: inset 6px 0 0 rgba(73, 180, 112, 0.92);
        background: color-mix(in srgb, var(--vscode-editorWidget-background) 60%, rgba(73, 180, 112, 0.34));
      }
      100% {
        box-shadow: inset 4px 0 0 rgba(73, 180, 112, 0.28);
        background: color-mix(in srgb, var(--vscode-editorWidget-background) 74%, rgba(73, 180, 112, 0.16));
      }
    }
    @keyframes session-pill-pulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(73, 180, 112, 0.00);
        filter: brightness(1);
      }
      50% {
        transform: scale(1.04);
        box-shadow: 0 0 0 6px rgba(73, 180, 112, 0.18);
        filter: brightness(1.08);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(73, 180, 112, 0.00);
        filter: brightness(1);
      }
    }
    @keyframes session-dot-ping {
      0% {
        transform: scale(0.9);
        box-shadow: 0 0 0 0 rgba(73, 180, 112, 0.55);
        opacity: 0.95;
      }
      70% {
        transform: scale(1.08);
        box-shadow: 0 0 0 10px rgba(73, 180, 112, 0.00);
        opacity: 1;
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(73, 180, 112, 0.00);
        opacity: 0.92;
      }
    }
    .session-row-completed {
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 80%, rgba(32, 125, 255, 0.14));
    }
    .session-row-pending {
      background: transparent;
    }
    .session-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .session-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      display: inline-block;
      flex: 0 0 auto;
    }
    .session-status-dot-running {
      background: #49b470;
      box-shadow: 0 0 0 0 rgba(73, 180, 112, 0.55);
      animation: session-dot-ping 1.6s ease-out infinite;
    }
    .session-status-dot-completed {
      background: #207dff;
    }
    .session-status-dot-pending {
      background: color-mix(in srgb, var(--vscode-foreground) 55%, transparent);
    }
    .session-status-running {
      color: #136c37;
      background: rgba(73, 180, 112, 0.24);
      border-color: rgba(73, 180, 112, 0.42);
      animation: session-pill-pulse 1.8s ease-in-out infinite;
    }
    .session-status-completed {
      color: #0b63ce;
      background: rgba(32, 125, 255, 0.15);
      border-color: rgba(32, 125, 255, 0.24);
    }
    .session-status-pending {
      color: var(--vscode-foreground);
      background: var(--vscode-badge-background);
      border-color: var(--vscode-panel-border);
    }
    .session-status-cell {
      min-width: 220px;
    }
    .session-status-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .session-status-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      font-size: 12px;
      line-height: 1.4;
      width: 100%;
    }
    .session-status-label {
      opacity: 0.72;
      white-space: nowrap;
    }
    .session-status-value {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .session-prompt-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .session-prompt-check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 7px;
      border-radius: 999px;
      color: #ffffff;
      background: linear-gradient(135deg, #24a148, #49b470);
      box-shadow: 0 0 0 2px rgba(73, 180, 112, 0.18);
      font-size: 13px;
      font-weight: 900;
      line-height: 1;
    }
    .session-row-current td:first-child {
      box-shadow: inset 4px 0 0 rgba(73, 180, 112, 0.72);
    }
    .session-row-current td {
      font-weight: 600;
    }
    .session-row-running.session-row-current td {
      animation: session-row-breathe 2.1s ease-in-out infinite;
    }
    .muted {
      opacity: 0.72;
    }
    .cell-warning {
      color: #b42318;
      font-weight: 600;
    }
    code {
      font-family: var(--vscode-editor-font-family);
    }
	    @media (max-width: ${isPanelMode ? '640px' : '99999px'}) {
	      .grid,
	      .workflow-grid,
	      .snapshot-grid {
	        grid-template-columns: 1fr;
	      }
	    }
	  </style>
	</head>
	<body>
	  <div class="wrap">
	    <section class="hero">
	      <div class="hero-header">
	        <h1>Dashboard</h1>
	        <div class="eyebrow">- VibeCoding Workflow</div>
	      </div>
	    </section>

    <section class="panel session-panel">
      <div class="panel-heading">
        <h2>脚本进程</h2>
      </div>
      <div class="process-table-wrap">
        <table class="process-table carbon-table">
          <thead>
            <tr>
              <th>进程名称</th>
              <th>进程状态</th>
              <th>进程 PID</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="process-cell-mono">${renderProcessNameCell(processTableRunnerProcess?.processName, processTableRunnerDbPath)}</td>
              <td class="process-cell-status">${renderRunnerProcessStatus(processTableRunnerState, processTableRunnerProcess, processTableWorkflow, result)}</td>
              <td class="process-cell-mono">${renderProcessPidCell(processTableRunnerProcess?.pid, processTableRunnerLogPath)}</td>
              <td class="process-cell-actions">${renderRunnerControls(processTableWorkflowRoot, processTableRunnerState, processTableWorkflow, result)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="issue">
      <strong>${escapeHtml(issue?.level?.toUpperCase() ?? '')}</strong>
      <div>${escapeHtml(issue?.message ?? '')}</div>
      <div style="margin-top:8px; opacity:0.78;">${escapeHtml(issue?.details ?? '')}</div>
    </section>

    <section class="workflow-grid">
      <div class="panel">
        <h2>StartupPrompt Tree</h2>
        <div class="table-wrap">
          <table class="carbon-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Startup Prompt</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Runtime</th>
                <th>Path</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${workflows.length > 0 ? workflows.map((workflow, index) => renderWorkflowTreeItem(workflow, selectedWorkflowRoot, state.runnerStateByWorkflow ?? {}, selectedRunnerState, index)).join('') : '<tr><td colspan="7">No startup-prompt.md was found under the current project root.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-heading">
          <h2>Session Prompt Table</h2>
          <div class="panel-heading-path">: ${escapeHtml(selectedStartupFile?.path ?? 'n/a')}</div>
        </div>
        <div class="table-wrap">
          <table class="carbon-table">
            <thead>
              <tr>
                <th>Session Prompt</th>
                <th>State</th>
                <th>Status</th>
                <th>Path</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${selectedSessionPromptFiles.length > 0 ? selectedSessionPromptFiles.map((file) => renderSessionPromptFileRow(file, selectedWorkflow, selectedWorkflowRoot, nextSessionPromptPath, nextSessionPromptLabel, result, selectedRunnerState, processTableRunnerProcess)).join('') : '<tr><td colspan="5">No session prompt files were found for the selected startup node.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </section>

  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const formatTimestamp = (epochMs) => {
      const parsed = Number(epochMs);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return '-';
      }
      return new Date(parsed).toLocaleString();
    };
    const formatDuration = (durationMs) => {
      const parsed = Number(durationMs);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return '-';
      }
      const totalSeconds = Math.floor(parsed / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) {
        return String(hours) + 'h ' + String(minutes) + 'm ' + String(seconds) + 's';
      }
      if (minutes > 0) {
        return String(minutes) + 'm ' + String(seconds) + 's';
      }
      return String(seconds) + 's';
    };
    const refreshProcessMetrics = () => {
      document.querySelectorAll('[data-timestamp-epoch]').forEach((node) => {
        const epoch = node.getAttribute('data-timestamp-epoch');
        if (!epoch) {
          node.textContent = '-';
          return;
        }
        node.textContent = formatTimestamp(epoch);
      });
      document.querySelectorAll('[data-duration-from-epoch]').forEach((node) => {
        const epoch = Number(node.getAttribute('data-duration-from-epoch'));
        if (!Number.isFinite(epoch) || epoch <= 0) {
          node.textContent = '-';
          return;
        }
        node.textContent = formatDuration(Date.now() - epoch);
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
    const rowClasses = isSelected ? 'carbon-table-row-selected' : '';
    const missingFiles = workflow.missingFiles.length > 0
        ? `<div class="cell-warning">缺少: ${escapeHtml(workflow.missingFiles.map((filePath) => basename(filePath)).join(', '))}</div>`
        : '';
    const actionCell = commandButton('vibeCoding.selectWorkflow', isSelected ? 'Selected' : 'Select', isSelected, [workflow.projectRoot], {
        disabled: workflow.statusLabel === '完成',
    });
    const completedCheck = workflow.statusLabel === '完成'
        ? '<span class="session-prompt-check" aria-label="Completed">&#10003;</span>'
        : '';

    return `<tr class="${rowClasses}">
      <td class="carbon-table-cell-index"><strong>${index + 1}</strong></td>
      <td>
        <div class="startup-row-title"><span class="session-prompt-label">${escapeHtml(startupLabel)}${completedCheck}</span></div>
        ${missingFiles}
      </td>
      <td class="carbon-table-cell-status"><span class="startup-status-pill startup-status-${escapeHtml(workflowStatusClassName(workflow.statusLabel))}">${escapeHtml(workflow.statusLabel === '完成' ? '✓ 完成' : workflow.statusLabel)}</span></td>
      <td class="carbon-table-cell-progress"><span class="startup-progress">${escapeHtml(workflow.progressLabel)}</span></td>
      <td class="carbon-table-cell-runtime">${renderWorkflowRuntimePill(workflow.statusLabel, runnerState)}</td>
      <td><span class="workflow-path process-cell-mono">${escapeHtml(startupPath)}</span></td>
      <td class="carbon-table-cell-actions">${actionCell}</td>
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
    const rowClasses = [`session-row-${executionStatus}`];
    if (isCurrentSessionPrompt(file, selectedWorkflow, result, isNextSession)) {
        rowClasses.push('session-row-current');
    }
    const timing = resolveSessionPromptTiming(file, executionStatus, runnerProcess);
    const completedCheck = executionStatus === 'completed'
        ? '<span class="session-prompt-check" aria-label="Completed">&#10003;</span>'
        : '';

    return `<tr class="${rowClasses.join(' ')}">
      <td><span class="session-prompt-label"><strong>${escapeHtml(file.label)}</strong>${completedCheck}</span></td>
      <td>${isNextSession ? '<span class="active-pill next-pill">Next Session</span>' : '<span class="muted">Manual</span>'}</td>
      <td class="session-status-cell">${renderSessionPromptStatusCell(executionStatus, timing, runnerProcess)}</td>
      <td><span class="muted process-cell-mono">${escapeHtml(file.path)}</span></td>
      <td class="carbon-table-cell-actions">
        <div class="session-file-actions">
          ${commandButton('vibeCoding.openWorkflowFileAtPath', 'Open', true, [selectedWorkflowRoot, file.path, file.label])}
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

function renderProcessNameCell(processName: string | undefined, runnerDbPath: string): string {
    return `<div class="process-name-stack">
      <span class="process-name-primary">${escapeHtml(processName ?? 'n/a')}</span>
      <span class="process-name-secondary">${escapeHtml(runnerDbPath)}</span>
    </div>`;
}

function renderProcessPidCell(pid: number | null | undefined, runnerLogPath: string): string {
    return `<div class="process-pid-stack">
      <span class="process-pid-primary">${escapeHtml(pid?.toString() ?? 'n/a')}</span>
      <span class="process-pid-secondary">${escapeHtml(runnerLogPath)}</span>
    </div>`;
}

function renderRunnerStatePill(runnerState: DashboardRunnerState): string {
    if (runnerState === 'starting') {
        return '<span class="runner-state-pill runner-state-starting">启动中</span>';
    }

    if (runnerState === 'running') {
        return '<span class="runner-state-pill runner-state-running">执行中</span>';
    }

    if (runnerState === 'paused') {
        return '<span class="runner-state-pill runner-state-paused">已暂停</span>';
    }

    return '<span class="runner-state-pill runner-state-idle">未启动</span>';
}

function renderWorkflowRuntimePill(statusLabel: string, runnerState: DashboardRunnerState): string {
    if (statusLabel === '完成') {
        return '<span class="runner-state-pill runner-state-completed">已完成</span>';
    }

    return renderRunnerStatePill(runnerState);
}

function renderRunnerProcessStatus(
    runnerState: DashboardRunnerState,
    runnerProcess: DashboardRunnerProcessInfo | undefined,
    _selectedWorkflow: DashboardWorkflowSummary | undefined,
    _result: DriverResult | undefined,
): string {
    let statePill = '<span class="runner-state-pill runner-state-idle">停止</span>';
    if (runnerState === 'starting') {
        statePill = '<span class="runner-state-pill runner-state-starting">未知</span>';
    } else if (runnerState === 'running') {
        statePill = '<span class="runner-state-pill runner-state-running">运行</span>';
    } else if (runnerState === 'paused') {
        statePill = '<span class="runner-state-pill runner-state-paused">停止</span>';
    }

    const runtimeMs = runnerProcess?.startedAtEpochMs ? Math.max(Date.now() - runnerProcess.startedAtEpochMs, 0) : null;
    return `<div class="process-status-stack">
      ${statePill}
      <div class="process-status-meta">
        <span class="process-status-label">启动时间</span>
        <span class="process-status-value" data-timestamp-epoch="${escapeHtml(String(runnerProcess?.startedAtEpochMs ?? ''))}">${escapeHtml(formatTimestampValue(runnerProcess?.startedAtEpochMs ?? null))}</span>
        <span class="process-status-label">运行时长</span>
        <span class="process-status-value" data-duration-from-epoch="${escapeHtml(String(runnerProcess?.startedAtEpochMs ?? ''))}">${escapeHtml(runtimeMs === null ? '-' : formatDuration(runtimeMs))}</span>
        <span class="process-status-label">心跳时间</span>
        <span class="process-status-value" data-timestamp-epoch="${escapeHtml(String(runnerProcess?.heartbeatAtEpochMs ?? ''))}">${escapeHtml(formatTimestampValue(runnerProcess?.heartbeatAtEpochMs ?? null))}</span>
      </div>
    </div>`;
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

function renderSessionPromptExecutionStatus(status: SessionPromptExecutionStatus): string {
    if (status === 'running') {
        return '<span class="session-status-pill session-status-running"><span class="session-status-dot session-status-dot-running"></span><span>执行中</span></span>';
    }

    if (status === 'completed') {
        return '<span class="session-status-pill session-status-completed"><span class="session-status-dot session-status-dot-completed"></span><span>&#10003; 完成</span></span>';
    }

    return '<span class="session-status-pill session-status-pending"><span class="session-status-dot session-status-dot-pending"></span><span>未执行</span></span>';
}

function renderSessionPromptStatusCell(
    status: SessionPromptExecutionStatus,
    timing: { startedAtLabel: string; endedAtLabel: string; durationLabel: string },
    runnerProcess: DashboardRunnerProcessInfo | undefined,
): string {
    const startedAtValue = status === 'running' && runnerProcess?.startedAtEpochMs
        ? `<span class="session-status-value" data-timestamp-epoch="${escapeHtml(String(runnerProcess.startedAtEpochMs))}">${escapeHtml(timing.startedAtLabel)}</span>`
        : `<span class="session-status-value">${escapeHtml(timing.startedAtLabel)}</span>`;
    const durationValue = status === 'running' && runnerProcess?.startedAtEpochMs
        ? `<span class="session-status-value" data-duration-from-epoch="${escapeHtml(String(runnerProcess.startedAtEpochMs))}">${escapeHtml(timing.durationLabel)}</span>`
        : `<span class="session-status-value">${escapeHtml(timing.durationLabel)}</span>`;

    return `<div class="session-status-stack">
      ${renderSessionPromptExecutionStatus(status)}
      <div class="session-status-meta">
        <span class="session-status-label">开始时间</span>
        ${startedAtValue}
        <span class="session-status-label">结束时间</span>
        <span class="session-status-value">${escapeHtml(timing.endedAtLabel)}</span>
        <span class="session-status-label">耗时</span>
        ${durationValue}
      </div>
    </div>`;
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

function workflowStatusClassName(statusLabel: string): string {
    if (statusLabel === '完成') {
        return 'done';
    }
    if (statusLabel === '执行中') {
        return 'in_progress';
    }
    return 'not_started';
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
