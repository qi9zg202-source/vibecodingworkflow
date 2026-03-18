import * as vscode from 'vscode';
import { DashboardRunnerState } from './dashboard';
import { SessionRuntimeLatestAttempt } from './sessionRuntimeInspector';
import { buildSessionStudioCommandArgs, SessionHistoryLocation } from './sessionHistory';

export const LANGGRAPH_MANAGER_PANEL_VIEW_TYPE = 'vibeCodingLangGraphManager';

export interface LangGraphSessionNodeState {
    workflowRoot: string;
    filePath: string;
    fileLabel: string;
    sessionNumber: number | null;
    isCurrentSession: boolean;
    sessionStatusLabel: string;
    sessionStatusDetail: string;
    sessionStatusClass: string;
    workflowGate: string | null;
    nextSession: string | null;
    lastCompletedSession: string | null;
    runnerState: DashboardRunnerState;
    threadId: string | null;
    runId: string | null;
    runStatus: string | null;
    rejectionReason: string | null;
    startedAtLabel: string;
    endedAtLabel: string;
    durationLabel: string;
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

export interface LangGraphManagerState {
    workflowRoot: string;
    workflowDisplayName: string;
    totalSessionCount: number;
    currentSessionNumber: number | null;
    selectedSessionNumber: number | null;
    workflowGate: string | null;
    threadId: string | null;
    runId: string | null;
    runStatus: string | null;
    langGraphServerUrl: string;
    externalStudioUrl: string;
    nodes: LangGraphSessionNodeState[];
}

type ManagerMessage = {
    type: 'runCommand';
    command: string;
    args?: unknown[];
};

type ManagerCommandHandler = (command: string, args?: unknown[]) => Thenable<unknown> | void;

export class LangGraphManagerPanel implements vscode.Disposable {
    private static currentPanel: LangGraphManagerPanel | undefined;

    static createOrShow(
        initialState: LangGraphManagerState,
        onCommand: ManagerCommandHandler,
    ): LangGraphManagerPanel {
        const viewColumn = vscode.ViewColumn?.One ?? 1;
        if (LangGraphManagerPanel.currentPanel) {
            LangGraphManagerPanel.currentPanel.panel.reveal(viewColumn);
            LangGraphManagerPanel.currentPanel.update(initialState);
            return LangGraphManagerPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            LANGGRAPH_MANAGER_PANEL_VIEW_TYPE,
            `LangGraph Manager · ${initialState.workflowDisplayName}`,
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        LangGraphManagerPanel.currentPanel = new LangGraphManagerPanel(panel, initialState, onCommand);
        return LangGraphManagerPanel.currentPanel;
    }

    static updateIfOpen(state: LangGraphManagerState) {
        LangGraphManagerPanel.currentPanel?.update(state);
    }

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly onCommand: ManagerCommandHandler;
    private state: LangGraphManagerState;

    private constructor(
        panel: vscode.WebviewPanel,
        initialState: LangGraphManagerState,
        onCommand: ManagerCommandHandler,
    ) {
        this.panel = panel;
        this.state = initialState;
        this.onCommand = onCommand;

        this.panel.onDidDispose(() => {
            LangGraphManagerPanel.currentPanel = undefined;
            this.dispose();
        }, null, this.disposables);

        this.disposables.push(this.panel.webview.onDidReceiveMessage((message: ManagerMessage) => {
            if (message.type === 'runCommand' && typeof message.command === 'string') {
                void this.onCommand(message.command, Array.isArray(message.args) ? message.args : undefined);
            }
        }));

        this.render();
    }

    update(state: LangGraphManagerState) {
        this.state = state;
        this.render();
    }

    dispose() {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private render() {
        this.panel.title = `LangGraph Manager · ${this.state.workflowDisplayName}`;
        this.panel.webview.html = getLangGraphManagerHtml(this.state);
    }
}

function getLangGraphManagerHtml(state: LangGraphManagerState): string {
    const serializedState = escapeScriptJson(JSON.stringify(state));

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LangGraph Manager</title>
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
      max-width: 1440px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hero, .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 14px;
    }
    .hero {
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .eyebrow {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.58;
    }
    .hero-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .hero-title {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .title {
      font-size: 26px;
      font-weight: 700;
      line-height: 1.1;
    }
    .subtitle {
      font-size: 12px;
      opacity: 0.8;
      line-height: 1.6;
      word-break: break-all;
    }
    .hero-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.95fr);
      gap: 16px;
      align-items: start;
    }
    .graph-card {
      padding: 18px 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .graph-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
    }
    .card-copy {
      font-size: 12px;
      opacity: 0.75;
      line-height: 1.5;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .stat {
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
      border-radius: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 35%, transparent);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.6;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.1;
    }
    .graph-scroll {
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .graph-flow {
      display: flex;
      align-items: stretch;
      gap: 12px;
      min-width: max-content;
      padding: 4px 2px 2px;
    }
    .node-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .connector {
      width: 34px;
      min-width: 34px;
      height: 2px;
      background: linear-gradient(90deg, rgba(73,180,112,0.45), rgba(11,99,206,0.45));
      position: relative;
      top: -10px;
    }
    .connector::after {
      content: '';
      position: absolute;
      right: -1px;
      top: -4px;
      border-left: 7px solid rgba(11,99,206,0.45);
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
    }
    .node {
      width: 190px;
      min-height: 148px;
      border-radius: 16px;
      border: 1px solid var(--vscode-panel-border);
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--vscode-sideBar-background) 90%, white 3%),
        color-mix(in srgb, var(--vscode-editor-background) 88%, transparent)
      );
      color: inherit;
      text-align: left;
      padding: 14px 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      font: inherit;
    }
    .node:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--vscode-textLink-foreground) 42%, var(--vscode-panel-border));
    }
    .node.is-selected {
      border-color: rgba(11,99,206,0.55);
      box-shadow: 0 0 0 2px rgba(11,99,206,0.18);
    }
    .node.is-current {
      box-shadow: 0 0 0 2px rgba(36,161,72,0.14);
    }
    .node-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .node-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .node-name {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
    }
    .node-file {
      font-size: 11px;
      opacity: 0.7;
      word-break: break-word;
    }
    .node-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .node-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 8px;
      font-size: 11px;
      line-height: 1.45;
    }
    .node-meta-label {
      opacity: 0.56;
      white-space: nowrap;
    }
    .node-meta-value {
      word-break: break-word;
    }
    .detail-card {
      padding: 18px 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: sticky;
      top: 24px;
    }
    .detail-empty {
      font-size: 12px;
      opacity: 0.7;
      line-height: 1.6;
    }
    .detail-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .detail-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .detail-title {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.1;
    }
    .detail-subtitle {
      font-size: 12px;
      opacity: 0.78;
      line-height: 1.55;
      word-break: break-all;
    }
    .hint {
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(11,99,206,0.08);
      border: 1px solid rgba(11,99,206,0.2);
      line-height: 1.55;
      font-size: 12px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    button.action {
      border: 1px solid transparent;
      border-radius: 7px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.action.secondary {
      background: transparent;
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
    }
    button.action.success {
      background: #24a148;
      color: #fff;
    }
    button.action.warn {
      background: #da1e28;
      color: #fff;
    }
    button.action[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .meta-section {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
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
      opacity: 0.56;
    }
    .meta-value {
      word-break: break-word;
      line-height: 1.5;
    }
    .mono {
      font-family: var(--vscode-editor-font-family);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
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
    .pill-completed, .pill-done {
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
      background: rgba(218,30,40,0.1);
      color: #a2191f;
      border-color: rgba(218,30,40,0.35);
    }
    .pill-pending, .pill-idle {
      background: rgba(141,141,141,0.1);
      color: var(--vscode-descriptionForeground);
      border-color: rgba(141,141,141,0.25);
    }
    .link-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-size: 12px;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      font: inherit;
    }
    .link:hover {
      text-decoration: underline;
    }
    .latest-attempt {
      padding-top: 6px;
      border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 78%, transparent);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    @media (max-width: 1120px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .detail-card {
        position: static;
      }
    }
    @media (max-width: 860px) {
      body {
        padding: 16px;
      }
      .stats-row, .meta-section {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 560px) {
      .stats-row, .meta-section {
        grid-template-columns: 1fr;
      }
      .node {
        width: 170px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="eyebrow">LangGraph Session Manager</div>
      <div class="hero-top">
        <div class="hero-title">
          <div class="title">${escapeHtml(state.workflowDisplayName)}</div>
          <div class="subtitle mono">${escapeHtml(state.workflowRoot)}</div>
        </div>
        <div class="hero-meta">
          <span class="pill ${escapeHtml(resolveRunPillClass(state.runStatus))}">Run ${escapeHtml(state.runStatus ?? 'idle')}</span>
          ${state.currentSessionNumber !== null ? `<span class="pill pill-next">当前节点 session-${escapeHtml(String(state.currentSessionNumber))}</span>` : ''}
        </div>
      </div>
      <div class="stats-row">
        <div class="stat">
          <span class="stat-label">Session Nodes</span>
          <span class="stat-value">${escapeHtml(String(state.nodes.length))}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Workflow Gate</span>
          <span class="stat-value">${escapeHtml(state.workflowGate ?? 'n/a')}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Thread ID</span>
          <span class="stat-value mono">${escapeHtml(state.threadId ?? 'n/a')}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Run ID</span>
          <span class="stat-value mono">${escapeHtml(state.runId ?? 'n/a')}</span>
        </div>
      </div>
    </section>

    <div class="layout">
      <section class="card graph-card">
        <div class="graph-card-header">
          <div>
            <div class="card-title">Session Flow</div>
            <div class="card-copy">按流程顺序展示 session 节点。点击节点查看该 session 的 runtime 状态、产物和重跑 / 验收动作。</div>
          </div>
          <div class="link-row">
            <button id="openSelectedStudio" class="link" data-command="vibeCoding.openSessionStudio" data-args="${escapeHtml(JSON.stringify(buildSessionStudioCommandArgs(state.workflowRoot, state.selectedSessionNumber, null)))}">Open LangSmith Studio</button>
            <a class="link" href="${escapeHtml(state.langGraphServerUrl)}">Open LangGraph Server</a>
          </div>
        </div>
        <div class="graph-scroll">
          <div id="graphFlow" class="graph-flow"></div>
        </div>
      </section>

      <aside id="detailCard" class="card detail-card"></aside>
    </div>
  </div>

  <script id="langgraph-manager-state" type="application/json">${serializedState}</script>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const state = JSON.parse(document.getElementById('langgraph-manager-state').textContent || '{}');
    let selectedSessionNumber = state.selectedSessionNumber;

    const graphFlow = document.getElementById('graphFlow');
    const detailCard = document.getElementById('detailCard');
    const openSelectedStudio = document.getElementById('openSelectedStudio');

    const resolveNode = () => {
      if (!Array.isArray(state.nodes) || state.nodes.length === 0) {
        return null;
      }
      const selected = state.nodes.find((node) => node.sessionNumber === selectedSessionNumber);
      if (selected) {
        return selected;
      }
      const current = state.nodes.find((node) => node.isCurrentSession);
      if (current) {
        selectedSessionNumber = current.sessionNumber;
        return current;
      }
      selectedSessionNumber = state.nodes[0].sessionNumber;
      return state.nodes[0];
    };

    const escapeHtml = (value) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const renderPill = (label, className) => {
      const classes = ['pill', className || 'pill-pending'].filter(Boolean).join(' ');
      return '<span class="' + escapeHtml(classes) + '">' + escapeHtml(label || 'n/a') + '</span>';
    };

    const buildStudioArgs = (workflowRoot, sessionNumber, studioTarget) => {
      const normalizedSessionNumber = typeof sessionNumber === 'number' && Number.isFinite(sessionNumber)
        ? sessionNumber
        : null;
      if (!studioTarget) {
        return [workflowRoot, normalizedSessionNumber];
      }
      return [workflowRoot, normalizedSessionNumber, {
        source: studioTarget.source || null,
        sessionNumber: normalizedSessionNumber,
        sessionPrompt: studioTarget.sessionPrompt || null,
        threadId: studioTarget.threadId || null,
        runId: studioTarget.runId || null,
        checkpointId: studioTarget.checkpointId || null,
        parentCheckpointId: studioTarget.parentCheckpointId || null,
      }];
    };

    const renderNode = (node, index) => {
      const selectedClass = node.sessionNumber === selectedSessionNumber ? 'is-selected' : '';
      const currentClass = node.isCurrentSession ? 'is-current' : '';
      const currentBadge = node.isCurrentSession ? '<span class="pill pill-next">当前</span>' : '';
      const connector = index > 0 ? '<div class="connector" aria-hidden="true"></div>' : '';
      return ''
        + '<div class="node-wrap">'
        + connector
        + '<button class="node ' + escapeHtml([selectedClass, currentClass].filter(Boolean).join(' ')) + '"'
        + ' data-session-number="' + escapeHtml(node.sessionNumber === null ? '' : String(node.sessionNumber)) + '">'
        + '<div class="node-top">'
        +   '<div class="node-title">'
        +     '<div class="node-name">' + escapeHtml(node.sessionNumber !== null ? 'session-' + node.sessionNumber : node.fileLabel) + '</div>'
        +     '<div class="node-file">' + escapeHtml(node.fileLabel) + '</div>'
        +   '</div>'
        +   currentBadge
        + '</div>'
        + '<div class="node-body">'
        +   renderPill(node.sessionStatusLabel, node.sessionStatusClass)
        +   '<div class="node-meta">'
        +     '<span class="node-meta-label">Run</span><span class="node-meta-value">' + escapeHtml(node.runStatus || 'n/a') + '</span>'
        +     '<span class="node-meta-label">Gate</span><span class="node-meta-value">' + escapeHtml(node.workflowGate || 'n/a') + '</span>'
        +     '<span class="node-meta-label">耗时</span><span class="node-meta-value">' + escapeHtml(node.durationLabel || '-') + '</span>'
        +   '</div>'
        + '</div>'
        + '</button>'
        + '</div>';
    };

    const renderActionButton = (command, label, args, className, disabled) => {
      const disabledAttr = disabled ? ' disabled' : '';
      return '<button class="action ' + escapeHtml(className || '') + '"'
        + ' data-command="' + escapeHtml(command) + '"'
        + ' data-args="' + escapeHtml(JSON.stringify(args || [])) + '"'
        + disabledAttr + '>'
        + escapeHtml(label)
        + '</button>';
    };

    const bindCommandButtons = (root) => {
      if (!root) {
        return;
      }
      root.querySelectorAll('[data-command]').forEach((button) => {
        button.addEventListener('click', () => {
          const rawArgs = button.getAttribute('data-args');
          vscodeApi.postMessage({
            type: 'runCommand',
            command: button.getAttribute('data-command'),
            args: rawArgs ? JSON.parse(rawArgs) : undefined,
          });
        });
      });
    };

    const renderLatestAttempt = (node) => {
      if (!node.latestAttempt) {
        return '<div class="detail-empty">这个 session 还没有记录到 loop log attempt。</div>';
      }
      return ''
        + '<div class="latest-attempt">'
        +   '<div class="meta-section">'
        +     '<div class="meta-item"><span class="meta-label">Source</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.source || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Attempt Thread</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.threadId || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Attempt Run</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.runId || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Checkpoint</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.checkpointId || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Approval</span><span class="meta-value">' + escapeHtml(node.latestAttempt.approvalDecision || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Runner Exit</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.runnerExitCode || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Summary</span><span class="meta-value">' + escapeHtml(node.latestAttempt.summaryExists === null ? 'n/a' : (node.latestAttempt.summaryExists ? 'yes' : 'no')) + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Manifest</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.manifestPath || 'n/a') + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Attempt Session</span><span class="meta-value">' + escapeHtml(node.latestAttempt.sessionNumber === null ? 'n/a' : String(node.latestAttempt.sessionNumber)) + '</span></div>'
        +     '<div class="meta-item"><span class="meta-label">Recorded At</span><span class="meta-value mono">' + escapeHtml(node.latestAttempt.recordedAt || 'n/a') + '</span></div>'
        +   '</div>'
        + '</div>';
    };

    const renderDetail = (node) => {
      if (!node) {
        detailCard.innerHTML = '<div class="detail-empty">没有可展示的 session 节点。</div>';
        if (openSelectedStudio) {
          openSelectedStudio.setAttribute('data-args', JSON.stringify(buildStudioArgs(state.workflowRoot, null, null)));
        }
        return;
      }

      if (openSelectedStudio) {
        openSelectedStudio.setAttribute('data-args', JSON.stringify(buildStudioArgs(node.workflowRoot, node.sessionNumber, node.studioTarget)));
      }

      detailCard.innerHTML = ''
        + '<div class="detail-header">'
        +   '<div class="eyebrow">Node Detail</div>'
        +   '<div class="detail-title-row">'
        +     '<div class="detail-title">' + escapeHtml(node.sessionNumber !== null ? 'session-' + node.sessionNumber : node.fileLabel) + '</div>'
        +     renderPill(node.sessionStatusLabel, node.sessionStatusClass)
        +     (node.isCurrentSession ? '<span class="pill pill-next">当前 Session</span>' : '')
        +   '</div>'
        +   '<div class="detail-subtitle mono">' + escapeHtml(node.filePath) + '</div>'
        +   '<div class="hint">' + escapeHtml(node.actionHint) + '</div>'
        + '</div>'
        + '<div class="actions">'
        +   renderActionButton('vibeCoding.openWorkflowFileAtPath', '打开 Prompt', [node.workflowRoot, node.filePath, node.fileLabel], 'secondary', false)
        +   renderActionButton('vibeCoding.openSessionRuntimeInspector', '打开详情页', [node.workflowRoot, node.filePath, node.fileLabel], 'secondary', false)
        +   renderActionButton('vibeCoding.refreshWorkflowStatusForRoot', '刷新状态', [node.workflowRoot], 'secondary', false)
        +   renderActionButton('vibeCoding.activateWorkflowRunner', '重新跑当前 Session', [node.workflowRoot], 'success', !node.canRerun)
        +   renderActionButton('vibeCoding.reopenSession', '重新开放当前 Session', [node.workflowRoot], 'secondary', !node.canReopen)
        +   renderActionButton('vibeCoding.approveSession', '验收通过', [node.workflowRoot], 'success', !node.canApprove)
        +   renderActionButton('vibeCoding.rejectSession', '验收驳回', [node.workflowRoot], 'warn', !node.canReject)
        + '</div>'
        + '<div class="meta-section">'
        +   '<div class="meta-item"><span class="meta-label">Thread ID</span><span class="meta-value mono">' + escapeHtml(node.threadId || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Run ID</span><span class="meta-value mono">' + escapeHtml(node.runId || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Run Status</span><span class="meta-value mono">' + escapeHtml(node.runStatus || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Workflow Gate</span><span class="meta-value mono">' + escapeHtml(node.workflowGate || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Last Completed</span><span class="meta-value mono">' + escapeHtml(node.lastCompletedSession || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Next Session</span><span class="meta-value mono">' + escapeHtml(node.nextSession || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">开始</span><span class="meta-value">' + escapeHtml(node.startedAtLabel || '-') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">结束</span><span class="meta-value">' + escapeHtml(node.endedAtLabel || '-') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">耗时</span><span class="meta-value">' + escapeHtml(node.durationLabel || '-') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Review Notes</span><span class="meta-value">' + escapeHtml(node.rejectionReason || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Summary Path</span><span class="meta-value mono">' + escapeHtml(node.summaryPath || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Manifest Path</span><span class="meta-value mono">' + escapeHtml(node.manifestPath || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Studio Thread</span><span class="meta-value mono">' + escapeHtml(node.studioTarget?.threadId || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Studio Run</span><span class="meta-value mono">' + escapeHtml(node.studioTarget?.runId || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Studio Checkpoint</span><span class="meta-value mono">' + escapeHtml(node.studioTarget?.checkpointId || 'n/a') + '</span></div>'
        +   '<div class="meta-item"><span class="meta-label">Studio Source</span><span class="meta-value mono">' + escapeHtml(node.studioTarget?.source || 'n/a') + '</span></div>'
        + '</div>'
        + '<div class="link-row">'
        +   '<button class="link" data-command="vibeCoding.openSessionStudio" data-args="' + escapeHtml(JSON.stringify(buildSessionStudioCommandArgs(node.workflowRoot, node.sessionNumber, node.studioTarget))) + '">Open LangSmith Studio</button>'
        +   '<a class="link" href="' + escapeHtml(state.langGraphServerUrl) + '">Open LangGraph Server</a>'
        + '</div>'
        + '<div>'
        +   '<div class="card-title" style="font-size:13px;">Latest Attempt</div>'
        +   renderLatestAttempt(node)
        + '</div>';

      bindCommandButtons(detailCard);
    };

    const render = () => {
      graphFlow.innerHTML = Array.isArray(state.nodes) ? state.nodes.map(renderNode).join('') : '';
      graphFlow.querySelectorAll('[data-session-number]').forEach((nodeButton) => {
        nodeButton.addEventListener('click', () => {
          const rawSessionNumber = nodeButton.getAttribute('data-session-number');
          selectedSessionNumber = rawSessionNumber ? Number(rawSessionNumber) : null;
          render();
          vscodeApi.postMessage({
            type: 'runCommand',
            command: 'vibeCoding.selectLangGraphSessionNode',
            args: [state.workflowRoot, selectedSessionNumber],
          });
        });
      });
      renderDetail(resolveNode());
    };

    render();
    bindCommandButtons(openSelectedStudio ? openSelectedStudio.parentElement : null);
  </script>
</body>
</html>`;
}

function resolveRunPillClass(runStatus: string | null): string {
    if (runStatus === 'running') {
        return 'pill-running';
    }
    if (runStatus === 'pending') {
        return 'pill-starting';
    }
    if (runStatus === 'interrupted') {
        return 'pill-pending-review';
    }
    if (runStatus === 'success') {
        return 'pill-done';
    }
    if (runStatus === 'error') {
        return 'pill-blocked';
    }
    return 'pill-idle';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeScriptJson(value: string): string {
    return value
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}
