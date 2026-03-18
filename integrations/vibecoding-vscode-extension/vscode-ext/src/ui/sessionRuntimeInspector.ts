import * as vscode from 'vscode';
import { DashboardRunnerState } from './dashboard';
import { buildSessionStudioCommandArgs, SessionHistoryLocation } from './sessionHistory';

export const SESSION_RUNTIME_PANEL_VIEW_TYPE = 'vibeCodingSessionRuntimeInspector';

export type SessionRuntimeLatestAttempt = SessionHistoryLocation;

export interface SessionRuntimeInspection {
    workflowRoot: string;
    workflowDisplayName: string;
    filePath: string;
    fileLabel: string;
    sessionNumber: number | null;
    isCurrentSession: boolean;
    sessionStatusLabel: string;
    sessionStatusDetail: string;
    sessionStatusClass: string;
    workflowGate: string | null;
    nextSession: string | null;
    nextSessionPrompt: string | null;
    lastCompletedSession: string | null;
    lastCompletedSessionTests: string | null;
    runnerState: DashboardRunnerState;
    threadId: string | null;
    runId: string | null;
    runStatus: string | null;
    rejectionReason: string | null;
    langGraphServerUrl: string;
    studioUrl: string;
    memoryPath: string;
    summaryPath: string | null;
    manifestPath: string | null;
    latestAttempt: SessionRuntimeLatestAttempt | null;
    studioTarget: SessionHistoryLocation | null;
    canApprove: boolean;
    canReject: boolean;
    canRerun: boolean;
    canReopen: boolean;
    actionHint: string;
}

type InspectorMessage = {
    type: 'runCommand';
    command: string;
    args?: unknown[];
};

type InspectorCommandHandler = (command: string, args?: unknown[]) => Thenable<unknown> | void;

export class SessionRuntimeInspectorPanel implements vscode.Disposable {
    private static currentPanel: SessionRuntimeInspectorPanel | undefined;

    static createOrShow(
        initialState: SessionRuntimeInspection,
        onCommand: InspectorCommandHandler,
    ): SessionRuntimeInspectorPanel {
        const viewColumn = vscode.ViewColumn?.One ?? 1;
        if (SessionRuntimeInspectorPanel.currentPanel) {
            SessionRuntimeInspectorPanel.currentPanel.panel.reveal(viewColumn);
            SessionRuntimeInspectorPanel.currentPanel.update(initialState);
            return SessionRuntimeInspectorPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            SESSION_RUNTIME_PANEL_VIEW_TYPE,
            `Session Runtime · ${initialState.fileLabel}`,
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        SessionRuntimeInspectorPanel.currentPanel = new SessionRuntimeInspectorPanel(panel, initialState, onCommand);
        return SessionRuntimeInspectorPanel.currentPanel;
    }

    static updateIfOpen(state: SessionRuntimeInspection) {
        SessionRuntimeInspectorPanel.currentPanel?.update(state);
    }

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly onCommand: InspectorCommandHandler;
    private state: SessionRuntimeInspection;

    private constructor(
        panel: vscode.WebviewPanel,
        initialState: SessionRuntimeInspection,
        onCommand: InspectorCommandHandler,
    ) {
        this.panel = panel;
        this.state = initialState;
        this.onCommand = onCommand;

        this.panel.onDidDispose(() => {
            SessionRuntimeInspectorPanel.currentPanel = undefined;
            this.dispose();
        }, null, this.disposables);

        this.disposables.push(this.panel.webview.onDidReceiveMessage((message: InspectorMessage) => {
            if (message.type === 'runCommand' && typeof message.command === 'string') {
                void this.onCommand(message.command, Array.isArray(message.args) ? message.args : undefined);
            }
        }));

        this.render();
    }

    update(state: SessionRuntimeInspection) {
        this.state = state;
        this.render();
    }

    dispose() {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private render() {
        this.panel.title = `Session Runtime · ${this.state.fileLabel}`;
        this.panel.webview.html = getSessionRuntimeHtml(this.state);
    }
}

function getSessionRuntimeHtml(state: SessionRuntimeInspection): string {
    const headerStatus = renderStatusPill(state.sessionStatusLabel, state.sessionStatusClass);
    const currentBadge = state.isCurrentSession ? '<span class="pill pill-next">当前 Session</span>' : '';
    const latestAttempt = state.latestAttempt
        ? `
          <div class="meta-grid">
            <div class="meta-item"><span class="meta-label">Source</span><span class="mono">${escapeHtml(state.latestAttempt.source ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Attempt Thread</span><span class="mono">${escapeHtml(state.latestAttempt.threadId ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Last Attempt Run</span><span class="mono">${escapeHtml(state.latestAttempt.runId ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Checkpoint</span><span class="mono">${escapeHtml(state.latestAttempt.checkpointId ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Attempt Session</span><span class="mono">${escapeHtml(state.latestAttempt.sessionNumber !== null ? String(state.latestAttempt.sessionNumber) : 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Session Prompt</span><span class="mono">${escapeHtml(state.latestAttempt.sessionPrompt ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Runner Exit</span><span class="mono">${escapeHtml(state.latestAttempt.runnerExitCode ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Approval</span><span class="mono">${escapeHtml(state.latestAttempt.approvalDecision ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Summary</span><span class="mono">${escapeHtml(formatBoolean(state.latestAttempt.summaryExists))}</span></div>
            <div class="meta-item"><span class="meta-label">Manifest</span><span class="mono">${escapeHtml(state.latestAttempt.manifestPath ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Recorded At</span><span class="mono">${escapeHtml(state.latestAttempt.recordedAt ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Started At</span><span class="mono">${escapeHtml(state.latestAttempt.startedAt ?? 'n/a')}</span></div>
            <div class="meta-item"><span class="meta-label">Ended At</span><span class="mono">${escapeHtml(state.latestAttempt.endedAt ?? 'n/a')}</span></div>
          </div>
        `
        : '<div class="empty">这个 session 还没有记录到 loop log attempt。</div>';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Runtime Inspector</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .page {
      max-width: 1180px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hero, .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 18px 20px;
    }
    .hero {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .eyebrow {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.58;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.15;
    }
    .subtitle {
      font-size: 12px;
      opacity: 0.82;
      line-height: 1.6;
    }
    .hint {
      padding: 12px 14px;
      border-radius: 8px;
      background: rgba(11,99,206,0.08);
      border: 1px solid rgba(11,99,206,0.25);
      line-height: 1.6;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 14px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 16px;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.58;
    }
    .mono {
      font-family: var(--vscode-editor-font-family);
      word-break: break-all;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    button {
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.secondary {
      background: transparent;
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
    }
    button.success {
      background: #24a148;
      color: #fff;
    }
    button.warn {
      background: #da1e28;
      color: #fff;
    }
    button[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .pill-next {
      background: rgba(36,161,72,0.12);
      color: #0e6027;
      border-color: rgba(36,161,72,0.35);
    }
    .pill-completed {
      background: rgba(36,161,72,0.12);
      color: #0e6027;
      border-color: rgba(36,161,72,0.35);
    }
    .pill-running {
      background: rgba(11,99,206,0.12);
      color: #0b63ce;
      border-color: rgba(11,99,206,0.35);
    }
    .pill-starting {
      background: rgba(11,99,206,0.08);
      color: #0b63ce;
      border-color: rgba(11,99,206,0.25);
    }
    .pill-paused {
      background: rgba(93,50,193,0.12);
      color: #5d32c1;
      border-color: rgba(93,50,193,0.35);
    }
    .pill-pending-review {
      background: rgba(232,173,53,0.12);
      color: #7a4d00;
      border-color: rgba(232,173,53,0.35);
    }
    .pill-blocked {
      background: rgba(218,30,40,0.10);
      color: #a2191f;
      border-color: rgba(218,30,40,0.35);
    }
    .pill-pending {
      background: rgba(141,141,141,0.10);
      color: var(--vscode-descriptionForeground);
      border-color: rgba(141,141,141,0.25);
    }
    .link-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    a.link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a.link:hover {
      text-decoration: underline;
    }
    .empty {
      font-size: 12px;
      opacity: 0.7;
    }
    @media (max-width: 900px) {
      .cards {
        grid-template-columns: 1fr;
      }
      .meta-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="eyebrow">Session Runtime Inspector</div>
      <div class="title-row">
        <div class="title">${escapeHtml(state.fileLabel)}</div>
        ${headerStatus}
        ${currentBadge}
      </div>
      <div class="subtitle mono">${escapeHtml(state.filePath)}</div>
      <div class="subtitle">Workflow: ${escapeHtml(state.workflowDisplayName)} | Root: <span class="mono">${escapeHtml(state.workflowRoot)}</span></div>
      <div class="hint">${escapeHtml(state.actionHint)}</div>
      <div class="actions">
        ${commandButton('vibeCoding.openWorkflowFileAtPath', '打开 Prompt', [state.workflowRoot, state.filePath, state.fileLabel], 'secondary')}
        ${commandButton('vibeCoding.refreshWorkflowStatusForRoot', '刷新状态', [state.workflowRoot], 'secondary')}
        ${commandButton('vibeCoding.openWorkflowFileAtPath', '打开 Memory', [state.workflowRoot, state.memoryPath, 'memory.md'], 'secondary')}
        ${commandButton('vibeCoding.openSessionStudio', 'Open Studio', buildSessionStudioCommandArgs(state.workflowRoot, state.sessionNumber, state.studioTarget), 'secondary')}
        ${commandButton('vibeCoding.activateWorkflowRunner', '重新跑当前 Session', [state.workflowRoot], 'success', !state.canRerun)}
        ${commandButton('vibeCoding.reopenSession', '重新开放当前 Session', [state.workflowRoot], 'secondary', !state.canReopen)}
        ${commandButton('vibeCoding.approveSession', '验收通过', [state.workflowRoot], 'success', !state.canApprove)}
        ${commandButton('vibeCoding.rejectSession', '验收驳回', [state.workflowRoot], 'warn', !state.canReject)}
      </div>
      <div class="link-row">
        <a class="link" href="${escapeHtml(state.langGraphServerUrl)}">Open LangGraph Server</a>
      </div>
    </section>

    <div class="cards">
      <section class="card">
        <h2>Session / Workflow</h2>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Session Number</span><span class="mono">${escapeHtml(state.sessionNumber !== null ? String(state.sessionNumber) : 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Workflow Gate</span><span class="mono">${escapeHtml(state.workflowGate ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Next Session</span><span class="mono">${escapeHtml(state.nextSession ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Next Prompt</span><span class="mono">${escapeHtml(state.nextSessionPrompt ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Last Completed</span><span class="mono">${escapeHtml(state.lastCompletedSession ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Last Tests</span><span class="mono">${escapeHtml(state.lastCompletedSessionTests ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Dashboard State</span><span>${escapeHtml(state.sessionStatusDetail)}</span></div>
          <div class="meta-item"><span class="meta-label">Runner State</span><span class="mono">${escapeHtml(state.runnerState)}</span></div>
        </div>
      </section>

      <section class="card">
        <h2>LangGraph Runtime</h2>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Thread ID</span><span class="mono">${escapeHtml(state.threadId ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Run ID</span><span class="mono">${escapeHtml(state.runId ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Run Status</span><span class="mono">${escapeHtml(state.runStatus ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Review Notes</span><span>${escapeHtml(state.rejectionReason ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Summary Path</span><span class="mono">${escapeHtml(state.summaryPath ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Manifest Path</span><span class="mono">${escapeHtml(state.manifestPath ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Studio Target Thread</span><span class="mono">${escapeHtml(state.studioTarget?.threadId ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Studio Target Run</span><span class="mono">${escapeHtml(state.studioTarget?.runId ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Studio Target Checkpoint</span><span class="mono">${escapeHtml(state.studioTarget?.checkpointId ?? 'n/a')}</span></div>
          <div class="meta-item"><span class="meta-label">Studio Target Source</span><span class="mono">${escapeHtml(state.studioTarget?.source ?? 'n/a')}</span></div>
        </div>
      </section>

      <section class="card">
        <h2>Latest Session Attempt</h2>
        ${latestAttempt}
      </section>

      <section class="card">
        <h2>Management Rules</h2>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Approve</span><span>${escapeHtml(state.canApprove ? '可用' : '不可用')}</span></div>
          <div class="meta-item"><span class="meta-label">Reject</span><span>${escapeHtml(state.canReject ? '可用' : '不可用')}</span></div>
          <div class="meta-item"><span class="meta-label">Re-run</span><span>${escapeHtml(state.canRerun ? '可用' : '不可用')}</span></div>
          <div class="meta-item"><span class="meta-label">Reopen</span><span>${escapeHtml(state.canReopen ? '可用' : '不可用')}</span></div>
          <div class="meta-item"><span class="meta-label">Why</span><span>${escapeHtml(state.actionHint)}</span></div>
        </div>
      </section>
    </div>
  </div>

  <script>
    const vscodeApi = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const rawArgs = button.getAttribute('data-args');
        vscodeApi.postMessage({
          type: 'runCommand',
          command: button.getAttribute('data-command'),
          args: rawArgs ? JSON.parse(rawArgs) : undefined,
        });
      });
    });
  </script>
</body>
</html>`;
}

function commandButton(
    command: string,
    label: string,
    args?: unknown[],
    className = '',
    disabled = false,
): string {
    const encodedArgs = args ? ` data-args="${escapeHtml(JSON.stringify(args))}"` : '';
    const disabledAttr = disabled ? ' disabled' : '';
    const classes = ['button', className].filter(Boolean).join(' ');
    return `<button class="${escapeHtml(classes)}" data-command="${escapeHtml(command)}"${encodedArgs}${disabledAttr}>${escapeHtml(label)}</button>`;
}

function renderStatusPill(label: string, className: string): string {
    const classes = ['pill', className].filter(Boolean).join(' ');
    return `<span class="${escapeHtml(classes)}">${escapeHtml(label)}</span>`;
}

function formatBoolean(value: boolean | null): string {
    if (value === null) {
        return 'n/a';
    }
    return value ? 'yes' : 'no';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
