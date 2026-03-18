import * as vscode from 'vscode';
import { DriverResult, LangGraphDaemonInfo } from '../driver/driverTypes';

export interface StatusBarContext {
    projectRoot?: string;
    result?: DriverResult;
    message?: string;
    lastUpdatedAt?: Date;
    daemon?: LangGraphDaemonInfo | null;
}

export type RunnerStatusBarState = 'starting' | 'running' | 'paused';

export class WorkflowStatusBar {
    private readonly item: vscode.StatusBarItem;
    private readonly dashboardItem: vscode.StatusBarItem;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.name = 'VibeCoding Workflow';
        this.item.command = 'vibeCoding.prepareFreshSession';

        this.dashboardItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
        this.dashboardItem.name = 'VibeCoding Dashboard';
        this.dashboardItem.text = '$(dashboard) Vibe Dashboard';
        this.dashboardItem.tooltip = 'Open the VibeCoding workflow dashboard';
        this.dashboardItem.command = 'vibeCoding.openDashboard';
        this.dashboardItem.show();
    }

    showIdle(message = 'Run Refresh Workflow Status to inspect memory.md') {
        this.item.text = 'Vibe: workflow idle';
        this.item.tooltip = this.buildTooltip({
            message,
        });
        this.item.backgroundColor = undefined;
        this.item.command = 'vibeCoding.refreshWorkflowStatus';
        this.item.show();
    }

    showInvalid(message: string, command: string = 'vibeCoding.refreshWorkflowStatus') {
        this.item.text = 'Vibe: workflow invalid';
        this.item.tooltip = this.buildTooltip({
            message,
            lastUpdatedAt: new Date(),
        });
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.item.command = command;
        this.item.show();
    }

    showResult(context: StatusBarContext) {
        const result = context.result;
        if (!result) {
            this.showInvalid(context.message ?? 'No workflow result available.');
            return;
        }

        this.item.text = formatStatusText(result, context.daemon ?? result.daemon ?? null);
        this.item.tooltip = this.buildTooltip({
            ...context,
            lastUpdatedAt: context.lastUpdatedAt ?? new Date(),
        });
        this.item.backgroundColor = getBackgroundColor(result.status);
        this.item.command = result.status === 'ready'
            ? 'vibeCoding.prepareFreshSession'
            : 'vibeCoding.refreshWorkflowStatus';
        this.item.show();
    }

    showRuntime(context: StatusBarContext & { runnerState: RunnerStatusBarState }) {
        const result = context.result;
        const nextSession = result?.next_session ?? '?';
        const workflowStatus = result?.status ?? 'n/a';
        const daemonInfo = context.daemon ?? result?.daemon ?? null;
        const daemonText = daemonInfo ? ` | D ${formatDaemonPillText(daemonInfo)}` : '';
        this.item.text = `Vibe: W ${workflowStatus} | R ${context.runnerState}${daemonText} | S${nextSession}`;
        this.item.tooltip = this.buildTooltip({
            ...context,
            message: context.message ?? `Workflow runner is ${context.runnerState}.`,
            lastUpdatedAt: context.lastUpdatedAt ?? new Date(),
        });
        this.item.backgroundColor = context.runnerState === 'running'
            ? new vscode.ThemeColor('statusBarItem.prominentBackground')
            : new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.command = 'vibeCoding.openDashboard';
        this.item.show();
    }

    dispose() {
        this.item.dispose();
        this.dashboardItem.dispose();
    }

    private buildTooltip(context: StatusBarContext): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString(undefined, true);
        tooltip.isTrusted = false;

        if (context.result) {
            const result = context.result;
            tooltip.appendMarkdown(`**VibeCoding Workflow**\n\n`);
            tooltip.appendMarkdown(`- workflow_status: \`${result.status}\`\n`);
            tooltip.appendMarkdown(`- workflow_gate: \`${result.session_gate ?? 'n/a'}\` (business gate)\n`);
            tooltip.appendMarkdown(`- next_session: \`${result.next_session ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- next_session_prompt: \`${result.next_session_prompt ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- last_completed_session: \`${result.last_completed_session ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- last_completed_session_tests: \`${result.last_completed_session_tests ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- next_action: \`${result.next_action.type}\`\n`);
            tooltip.appendMarkdown(`- message: ${escapeMarkdown(result.message)}\n`);
            if (context.daemon ?? result.daemon) {
                const daemon = context.daemon ?? result.daemon!;
                tooltip.appendMarkdown(`- daemon: \`${escapeMarkdown(formatDaemonPillText(daemon))}\`\n`);
                tooltip.appendMarkdown(`- daemon_lifecycle: \`${daemon.lifecycle}\`\n`);
                tooltip.appendMarkdown(`- daemon_pid: \`${daemon.pid !== null ? String(daemon.pid) : 'n/a'}\`\n`);
            }

            if (context.projectRoot) {
                tooltip.appendMarkdown(`- project_root: \`${context.projectRoot}\`\n`);
            }
        } else {
            tooltip.appendMarkdown(`**VibeCoding Workflow**\n\n`);
            tooltip.appendMarkdown(`${escapeMarkdown(context.message ?? 'No workflow result available.')}\n`);
        }

        if (context.lastUpdatedAt) {
            tooltip.appendMarkdown(`\nLast updated: ${context.lastUpdatedAt.toLocaleString()}`);
        }

        return tooltip;
    }
}

function formatStatusText(result: DriverResult, daemon: LangGraphDaemonInfo | null): string {
    if (result.status === 'done') {
        return daemon ? `Vibe: workflow done | D ${formatDaemonPillText(daemon)}` : 'Vibe: workflow done';
    }

    if (result.status === 'invalid') {
        return daemon ? `Vibe: workflow invalid | D ${formatDaemonPillText(daemon)}` : 'Vibe: workflow invalid';
    }

    if (result.status === 'in_progress') {
        return daemon
            ? `Vibe: W in_progress | D ${formatDaemonPillText(daemon)} | S${result.next_session ?? '?'}`
            : `Vibe: W in_progress | S${result.next_session ?? '?'}`;
    }

    return daemon
        ? `Vibe: W ${result.status} | D ${formatDaemonPillText(daemon)} | S${result.next_session ?? '?'}`
        : `Vibe: W ${result.status} | S${result.next_session ?? '?'}`;
}

function getBackgroundColor(status: DriverResult['status']): vscode.ThemeColor | undefined {
    if (status === 'blocked' || status === 'invalid' || status === 'runner_failed') {
        return new vscode.ThemeColor('statusBarItem.errorBackground');
    }

    if (status === 'ready') {
        return new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    if (status === 'in_progress') {
        return new vscode.ThemeColor('statusBarItem.prominentBackground');
    }

    return undefined;
}

function escapeMarkdown(value: string): string {
    return value.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}

function formatDaemonPillText(daemon: LangGraphDaemonInfo): string {
    const manager = daemon.manager === 'unknown' ? daemon.lifecycle : daemon.manager;
    return daemon.lifecycle === 'online'
        ? manager
        : `${manager}/${daemon.lifecycle}`;
}
