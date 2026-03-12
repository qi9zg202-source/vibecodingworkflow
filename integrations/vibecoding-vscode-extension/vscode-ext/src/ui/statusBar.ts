import * as vscode from 'vscode';
import { DriverResult } from '../driver/driverTypes';

export interface StatusBarContext {
    projectRoot?: string;
    result?: DriverResult;
    message?: string;
    lastUpdatedAt?: Date;
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
        this.item.text = 'Vibe: idle';
        this.item.tooltip = this.buildTooltip({
            message,
        });
        this.item.backgroundColor = undefined;
        this.item.command = 'vibeCoding.refreshWorkflowStatus';
        this.item.show();
    }

    showInvalid(message: string, command: string = 'vibeCoding.refreshWorkflowStatus') {
        this.item.text = 'Vibe: invalid';
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

        this.item.text = formatStatusText(result);
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
        this.item.text = `Vibe: S${nextSession} | ${context.runnerState}`;
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
            tooltip.appendMarkdown(`- status: \`${result.status}\`\n`);
            tooltip.appendMarkdown(`- session_gate: \`${result.session_gate ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- next_session: \`${result.next_session ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- next_session_prompt: \`${result.next_session_prompt ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- last_completed_session: \`${result.last_completed_session ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- last_completed_session_tests: \`${result.last_completed_session_tests ?? 'n/a'}\`\n`);
            tooltip.appendMarkdown(`- next_action: \`${result.next_action.type}\`\n`);
            tooltip.appendMarkdown(`- message: ${escapeMarkdown(result.message)}\n`);

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

function formatStatusText(result: DriverResult): string {
    if (result.status === 'done') {
        return 'Vibe: done';
    }

    if (result.status === 'invalid') {
        return 'Vibe: invalid';
    }

    return `Vibe: S${result.next_session ?? '?'} | ${result.status}`;
}

function getBackgroundColor(status: DriverResult['status']): vscode.ThemeColor | undefined {
    if (status === 'blocked' || status === 'invalid' || status === 'runner_failed') {
        return new vscode.ThemeColor('statusBarItem.errorBackground');
    }

    if (status === 'ready') {
        return new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    return undefined;
}

function escapeMarkdown(value: string): string {
    return value.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}
