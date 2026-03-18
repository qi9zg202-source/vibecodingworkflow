import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import { DriverResult, LangGraphDaemonInfo, LangGraphDaemonLifecycle, LangGraphDaemonManager } from './driverTypes';

const DEFAULT_LANGGRAPH_SERVER_URL = 'http://localhost:2024';
const LANGGRAPH_SCHEMA_VERSION = 'langgraph-runtime-contract/2026-03-17';
const VIBECODING_ASSISTANT_ID = 'vibecoding_workflow';

export interface LangGraphServerConfig {
    serverUrl: string;
}

export interface LangGraphServerProbeResult {
    ok: boolean;
    serverUrl: string;
    statusCode?: number;
    errorMessage?: string;
}

export interface LangGraphRunResult {
    threadId: string;
    runId: string | null;
    status: string | null;
}

export type LangGraphResumeDecision = 'approve' | 'reject';
export type LangGraphCancelAction = 'interrupt' | 'rollback';

interface LangGraphStatePayload {
    values?: Record<string, unknown>;
    next?: unknown[];
    metadata?: Record<string, unknown>;
    tasks?: Array<Record<string, unknown>>;
}

interface LangGraphRunPayload {
    status?: unknown;
}

interface LangGraphDaemonStatusPayload {
    manager?: unknown;
    lifecycle?: unknown;
    server_url?: unknown;
    port?: unknown;
    pid?: unknown;
    pid_source?: unknown;
    launchd_pid?: unknown;
    workdir?: unknown;
    pid_file?: unknown;
    stdout_log?: unknown;
    stderr_log?: unknown;
    launchd_stdout_log?: unknown;
    launchd_stderr_log?: unknown;
    launchd_label?: unknown;
    launchd_plist?: unknown;
    launchd_loaded?: unknown;
    autostart_installed?: unknown;
    started_at_epoch_ms?: unknown;
    summary?: unknown;
}

export class LangGraphIntegrationError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'LangGraphIntegrationError';
        this.code = code;
        this.details = details;
    }
}

export function getLangGraphServerConfig(): LangGraphServerConfig {
    const config = vscode.workspace.getConfiguration('vibeCoding');
    const configuredServerUrl = (config.get<string>('langGraphServerUrl') ?? '').trim();

    return {
        serverUrl: configuredServerUrl || DEFAULT_LANGGRAPH_SERVER_URL,
    };
}

export async function probeLangGraphServer(config: LangGraphServerConfig): Promise<LangGraphServerProbeResult> {
    let okEndpoint: URL;
    try {
        okEndpoint = new URL('/ok', ensureTrailingSlash(config.serverUrl));
    } catch (error) {
        return {
            ok: false,
            serverUrl: config.serverUrl,
            errorMessage: error instanceof Error ? error.message : String(error),
        };
    }

    return performHealthRequest(okEndpoint);
}

export async function inspectWorkflowViaLangGraph(projectRoot: string, config: LangGraphServerConfig): Promise<DriverResult> {
    const { taskIdentifier, threadId } = resolveLangGraphThread(projectRoot);
    const stateEndpoint = new URL(`/threads/${threadId}/state`, ensureTrailingSlash(config.serverUrl));
    const daemonInfo = getLangGraphDaemonInfo(config);
    const payload = await requestJson(stateEndpoint, 'GET');

    if (!payload || typeof payload !== 'object') {
        throw new LangGraphIntegrationError('langgraph_invalid_payload', 'LangGraph state response is not an object.');
    }

    const statePayload = payload as LangGraphStatePayload;
    const runStatus = await resolveLangGraphRunStatus(threadId, statePayload, config);
    return mapLangGraphStateToDriverResult(projectRoot, taskIdentifier, threadId, statePayload, daemonInfo, runStatus);
}

export async function startWorkflowRunViaLangGraph(
    projectRoot: string,
    runnerCommandTemplate: string | null,
    preferredRunner: string | null,
    config: LangGraphServerConfig,
): Promise<LangGraphRunResult> {
    const { threadId } = resolveLangGraphThread(projectRoot);
    const baseUrl = ensureTrailingSlash(config.serverUrl);

    await requestJson(new URL('/threads', baseUrl), 'POST', {
        thread_id: threadId,
        if_exists: 'do_nothing',
    });

    const runPayload = await requestJson(new URL(`/threads/${threadId}/runs`, baseUrl), 'POST', {
        assistant_id: VIBECODING_ASSISTANT_ID,
        input: {
            project_root: projectRoot,
            runner_command_template: runnerCommandTemplate,
            preferred_runner: preferredRunner,
            approval_required: true,
        },
    });

    if (!runPayload || typeof runPayload !== 'object') {
        throw new LangGraphIntegrationError('langgraph_invalid_payload', 'LangGraph run response is not an object.');
    }

    const runRecord = runPayload as Record<string, unknown>;
    return {
        threadId,
        runId: asNullableString(runRecord.run_id),
        status: asNullableString(runRecord.status),
    };
}

export async function resumeWorkflowRunViaLangGraph(
    projectRoot: string,
    runId: string,
    decision: LangGraphResumeDecision,
    reason: string | null,
    config: LangGraphServerConfig,
): Promise<LangGraphRunResult> {
    const { threadId } = resolveLangGraphThread(projectRoot);
    const resumeCommand = reason
        ? {
            decision,
            reason,
        }
        : {
            decision,
        };
    let resumePayload: unknown;

    try {
        resumePayload = await requestJson(
            new URL(`/threads/${threadId}/runs/${runId}/resume`, ensureTrailingSlash(config.serverUrl)),
            'POST',
            {
                resume: resumeCommand,
            }
        );
    } catch (error) {
        const statusCode = error instanceof LangGraphIntegrationError ? error.details?.status_code : undefined;
        if (statusCode !== 404) {
            throw error;
        }

        resumePayload = await requestJson(
            new URL(`/threads/${threadId}/runs`, ensureTrailingSlash(config.serverUrl)),
            'POST',
            {
                assistant_id: VIBECODING_ASSISTANT_ID,
                command: {
                    resume: resumeCommand,
                },
            }
        );
    }

    if (!resumePayload || typeof resumePayload !== 'object') {
        throw new LangGraphIntegrationError('langgraph_invalid_payload', 'LangGraph resume response is not an object.');
    }

    const runRecord = resumePayload as Record<string, unknown>;
    return {
        threadId,
        runId: asNullableString(runRecord.run_id) ?? runId,
        status: asNullableString(runRecord.status),
    };
}

export async function cancelWorkflowRunViaLangGraph(
    projectRoot: string,
    runId: string,
    config: LangGraphServerConfig,
    action: LangGraphCancelAction = 'interrupt',
): Promise<void> {
    const { threadId } = resolveLangGraphThread(projectRoot);
    const cancelUrl = new URL(`/threads/${threadId}/runs/${runId}/cancel`, ensureTrailingSlash(config.serverUrl));
    cancelUrl.searchParams.set('wait', 'true');
    cancelUrl.searchParams.set('action', action);
    await requestJson(cancelUrl, 'POST');
}

export function getLangGraphDaemonInfo(config: LangGraphServerConfig): LangGraphDaemonInfo {
    const scriptPath = resolveLangGraphStartScriptPath();
    if (!scriptPath) {
        return buildFallbackDaemonInfo(config, null, 'No LangGraph daemon script was found.');
    }

    try {
        const output = childProcess.execFileSync('bash', [scriptPath, 'status-json'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        if (!output) {
            return buildFallbackDaemonInfo(config, scriptPath, 'LangGraph daemon script returned an empty status payload.');
        }

        const payload = JSON.parse(output) as LangGraphDaemonStatusPayload;
        return mapDaemonStatusPayload(config, scriptPath, payload);
    } catch (error) {
        return buildFallbackDaemonInfo(config, scriptPath, error instanceof Error ? error.message : String(error));
    }
}

export function resolveLangGraphThreadId(projectRoot: string): string {
    return resolveLangGraphThread(projectRoot).threadId;
}

export async function doesLangGraphThreadExist(threadId: string, config: LangGraphServerConfig): Promise<boolean> {
    try {
        await requestJson(new URL(`/threads/${threadId}/state`, ensureTrailingSlash(config.serverUrl)), 'GET');
        return true;
    } catch (error) {
        const statusCode = error instanceof LangGraphIntegrationError ? error.details?.status_code : undefined;
        if (statusCode === 404) {
            return false;
        }
        throw error;
    }
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
}

function performHealthRequest(okEndpoint: URL): Promise<LangGraphServerProbeResult> {
    const transport = okEndpoint.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
        const request = transport.request(okEndpoint, { method: 'GET', timeout: 2000 }, (response) => {
            response.resume();

            resolve({
                ok: response.statusCode === 200,
                serverUrl: `${okEndpoint.protocol}//${okEndpoint.host}`,
                statusCode: response.statusCode,
                errorMessage: response.statusCode === 200 ? undefined : `Unexpected status code: ${response.statusCode ?? 'unknown'}`,
            });
        });

        request.on('timeout', () => {
            request.destroy(new Error('Request timed out after 2000ms'));
        });

        request.on('error', (error) => {
            resolve({
                ok: false,
                serverUrl: `${okEndpoint.protocol}//${okEndpoint.host}`,
                errorMessage: error.message,
            });
        });

        request.end();
    });
}

function resolveTaskIdentifier(projectRoot: string): string {
    const taskPath = path.join(projectRoot, 'task.md');
    if (fs.existsSync(taskPath)) {
        const text = fs.readFileSync(taskPath, 'utf-8');
        const lines = text.split(/\r?\n/);
        let inTitle = false;
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line === '## Title') {
                inTitle = true;
                continue;
            }
            if (inTitle && line.startsWith('## ')) {
                break;
            }
            if (inTitle && line) {
                return line.replace(/^-+\s*/, '').trim();
            }
        }
    }

    return path.basename(projectRoot);
}

function resolveLangGraphThread(projectRoot: string): { taskIdentifier: string; threadId: string } {
    const taskIdentifier = resolveTaskIdentifier(projectRoot);
    return {
        taskIdentifier,
        threadId: buildThreadId(projectRoot, taskIdentifier),
    };
}

function buildThreadId(projectRoot: string, taskIdentifier: string): string {
    const digest = crypto.createHash('sha1').update(`${projectRoot}:${taskIdentifier}`).digest();
    const bytes = Buffer.from(digest.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

function requestJson(target: URL, method: 'GET' | 'POST', payload?: unknown): Promise<unknown> {
    const transport = target.protocol === 'https:' ? https : http;
    const body = payload === undefined ? undefined : JSON.stringify(payload);

    return new Promise((resolve, reject) => {
        const request = transport.request(target, {
            method,
            timeout: 3000,
            headers: body
                ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                }
                : undefined,
        }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                if ((response.statusCode ?? 500) >= 400) {
                    reject(
                        new LangGraphIntegrationError(
                            response.statusCode === 404 ? 'langgraph_thread_not_found' : 'langgraph_http_error',
                            `LangGraph request failed with status ${response.statusCode ?? 'unknown'}`,
                            {
                                url: target.toString(),
                                status_code: response.statusCode,
                                body_preview: body.slice(0, 400),
                            }
                        )
                    );
                    return;
                }

                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(
                        new LangGraphIntegrationError(
                            'langgraph_invalid_json',
                            `Failed to parse LangGraph JSON response: ${error instanceof Error ? error.message : String(error)}`,
                            {
                                url: target.toString(),
                                body_preview: body.slice(0, 400),
                            }
                        )
                    );
                }
            });
        });

        request.on('timeout', () => {
            request.destroy(new Error('Request timed out after 3000ms'));
        });

        request.on('error', (error) => {
            reject(
                new LangGraphIntegrationError(
                    'langgraph_request_failed',
                    `LangGraph request failed: ${error.message}`,
                    {
                        url: target.toString(),
                    }
                )
            );
        });

        if (body !== undefined) {
            request.write(body);
        }
        request.end();
    });
}

function mapLangGraphStateToDriverResult(
    projectRoot: string,
    taskIdentifier: string,
    threadId: string,
    payload: LangGraphStatePayload,
    daemonInfo: LangGraphDaemonInfo,
    liveRunStatus: string | null,
): DriverResult {
    const values = payload.values ?? {};
    const currentPhase = asNullableString(values.current_phase);
    const sessionGate = asNullableString(values.session_gate);
    const nextSession = asNullableString(values.next_session);
    const nextSessionPrompt = asNullableString(values.next_session_prompt);
    const lastCompletedSession = asNullableString(values.last_completed_session);
    const lastCompletedSessionTests = asNullableString(values.last_completed_session_tests);
    const approvalRequired = typeof values.approval_required === 'boolean' ? values.approval_required : null;
    const approvalDecision = asNullableString(values.approval_decision);
    const rejectionReason = asNullableString(values.rejection_reason);
    const runtimeRunId = asNullableString(values.run_id);
    const runtimeRunStatus = hasInterruptTask(payload)
        ? 'interrupted'
        : liveRunStatus ?? asNullableString(values.run_status);

    const status = normalizeWorkflowStatus(sessionGate);
    const nextSessionPromptPath = nextSessionPrompt ? path.join(projectRoot, nextSessionPrompt) : null;

    return {
        schema_version: LANGGRAPH_SCHEMA_VERSION,
        status,
        message: buildStatusMessage(status, nextSession, approvalRequired, runtimeRunStatus),
        exit_code: status === 'invalid' ? 1 : 0,
        requested_action: 'inspect',
        effective_action: 'inspect',
        project_root: projectRoot,
        session_gate: sessionGate,
        next_session: nextSession,
        next_session_prompt: nextSessionPrompt,
        last_completed_session: lastCompletedSession,
        last_completed_session_tests: lastCompletedSessionTests,
        inputs: {
            runtime: 'langgraph',
            current_phase: currentPhase,
            thread_id: threadId,
            task_identifier: taskIdentifier,
            run_id: runtimeRunId,
            run_status: runtimeRunStatus,
            approval_decision: approvalDecision,
            rejection_reason: rejectionReason,
            daemon_manager: daemonInfo.manager,
            daemon_lifecycle: daemonInfo.lifecycle,
            daemon_pid: daemonInfo.pid !== null ? String(daemonInfo.pid) : null,
            daemon_summary: daemonInfo.summary,
        },
        artifacts: {
            startup_prompt_path: path.join(projectRoot, 'startup-prompt.md'),
            memory_path: path.join(projectRoot, 'memory.md'),
            loop_log_path: path.join(projectRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl'),
            next_session_prompt_path: nextSessionPromptPath,
            runner_command: null,
            startup_prompt_contents: null,
        },
        checks: {
            source: 'langgraph_state',
            approval_required: approvalRequired,
            run_status: runtimeRunStatus,
            daemon_source: daemonInfo.source,
            daemon_lifecycle: daemonInfo.lifecycle,
            daemon_manager: daemonInfo.manager,
        },
        risks: [],
        next_action: buildNextAction(status, runtimeRunStatus),
        error: status === 'invalid'
            ? {
                code: 'langgraph_invalid_state',
                message: 'LangGraph state payload is missing a valid workflow gate.',
                details: {
                    thread_id: threadId,
                    session_gate: sessionGate,
                },
            }
            : null,
        daemon: daemonInfo,
    };
}

async function resolveLangGraphRunStatus(
    threadId: string,
    payload: LangGraphStatePayload,
    config: LangGraphServerConfig,
): Promise<string | null> {
    const metadataRunId = asNullableString(payload.metadata?.run_id);
    const valueRunId = asNullableString(payload.values?.run_id);
    const runId = metadataRunId ?? valueRunId;
    if (!runId) {
        return null;
    }

    try {
        const runPayload = await requestJson(
            new URL(`/threads/${threadId}/runs/${runId}`, ensureTrailingSlash(config.serverUrl)),
            'GET',
        );
        if (!runPayload || typeof runPayload !== 'object') {
            return null;
        }

        const status = asNullableString((runPayload as LangGraphRunPayload).status);
        if (status === 'pending' || status === 'running' || status === 'error') {
            return status;
        }
        return null;
    } catch {
        return null;
    }
}

function normalizeWorkflowStatus(sessionGate: string | null): DriverResult['status'] {
    if (sessionGate === 'ready' || sessionGate === 'blocked' || sessionGate === 'in_progress' || sessionGate === 'done') {
        return sessionGate;
    }
    return 'invalid';
}

function buildStatusMessage(
    status: DriverResult['status'],
    nextSession: string | null,
    approvalRequired: boolean | null,
    runtimeRunStatus: string | null,
): string {
    if (runtimeRunStatus === 'interrupted') {
        return `LangGraph run is waiting for customer review. next_session=${nextSession ?? 'n/a'}`;
    }
    if (status === 'ready') {
        return approvalRequired
            ? `Workflow is ready for review or the next session. next_session=${nextSession ?? 'n/a'}`
            : `Workflow is ready. next_session=${nextSession ?? 'n/a'}`;
    }
    if (status === 'blocked') {
        return `Workflow is blocked. next_session=${nextSession ?? 'n/a'}`;
    }
    if (status === 'in_progress') {
        return `Workflow session is currently in progress. next_session=${nextSession ?? 'n/a'}`;
    }
    if (status === 'done') {
        return 'Workflow is complete.';
    }
    return 'LangGraph returned an invalid workflow state payload.';
}

function buildNextAction(status: DriverResult['status'], runtimeRunStatus: string | null): DriverResult['next_action'] {
    if (runtimeRunStatus === 'interrupted') {
        return {
            type: 'review_session',
            message: 'Approve or reject the interrupted LangGraph run.',
        };
    }

    if (status === 'ready') {
        return {
            type: 'start_session',
            message: 'Current session can be triggered via LangGraph.',
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
            message: 'Wait for the current session attempt to finish or refresh again.',
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
        message: 'Check LangGraph state payload and workflow files.',
    };
}

function asNullableString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function hasInterruptTask(payload: LangGraphStatePayload): boolean {
    if (!Array.isArray(payload.tasks)) {
        return false;
    }

    return payload.tasks.some((task) => {
        if (!task || typeof task !== 'object') {
            return false;
        }
        const interrupts = (task as Record<string, unknown>).interrupts;
        return Array.isArray(interrupts) && interrupts.length > 0;
    });
}

function resolveLangGraphStartScriptPath(): string | null {
    const configuredScript = (vscode.workspace.getConfiguration('vibeCoding').get<string>('langGraphStartScript') ?? '').trim();
    if (configuredScript && fs.existsSync(configuredScript)) {
        return configuredScript;
    }

    const candidates = [
        'start-langgraph-dev.sh',
        'scripts/start-langgraph-dev.sh',
        'scripts/start-langgraph-dev.command',
    ];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const candidate of candidates) {
            const fullPath = path.join(folder.uri.fsPath, candidate);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }
    }

    return null;
}

function mapDaemonStatusPayload(
    config: LangGraphServerConfig,
    scriptPath: string,
    payload: LangGraphDaemonStatusPayload,
): LangGraphDaemonInfo {
    const lifecycle = normalizeDaemonLifecycle(payload.lifecycle);
    const manager = normalizeDaemonManager(payload.manager);
    const pid = asNullableInteger(payload.pid);
    const launchdPid = asNullableInteger(payload.launchd_pid);
    const serverUrl = asNullableString(payload.server_url) ?? config.serverUrl;
    const port = asNullableInteger(payload.port) ?? derivePortFromServerUrl(serverUrl);
    const autostartInstalled = Boolean(payload.autostart_installed);
    const launchdLoaded = Boolean(payload.launchd_loaded);
    const summary = asNullableString(payload.summary)
        ?? buildDaemonSummary(manager, lifecycle, pid, autostartInstalled);

    return {
        manager,
        lifecycle,
        serverUrl,
        port,
        pid,
        pidSource: asNullableString(payload.pid_source),
        launchdPid,
        workdir: asNullableString(payload.workdir),
        scriptPath,
        pidFilePath: asNullableString(payload.pid_file),
        stdoutLogPath: asNullableString(payload.stdout_log),
        stderrLogPath: asNullableString(payload.stderr_log),
        launchdStdoutLogPath: asNullableString(payload.launchd_stdout_log),
        launchdStderrLogPath: asNullableString(payload.launchd_stderr_log),
        launchdLabel: asNullableString(payload.launchd_label),
        launchdPlistPath: asNullableString(payload.launchd_plist),
        launchdLoaded,
        autostartInstalled,
        startedAtEpochMs: asNullableInteger(payload.started_at_epoch_ms),
        summary,
        source: 'script',
        errorMessage: null,
    };
}

function buildFallbackDaemonInfo(
    config: LangGraphServerConfig,
    scriptPath: string | null,
    errorMessage: string,
): LangGraphDaemonInfo {
    const lifecycle = probeLifecycleWithoutScript(config.serverUrl);
    const port = derivePortFromServerUrl(config.serverUrl);
    const manager: LangGraphDaemonManager = lifecycle === 'online' ? 'manual' : 'unknown';

    return {
        manager,
        lifecycle,
        serverUrl: config.serverUrl,
        port,
        pid: null,
        pidSource: null,
        launchdPid: null,
        workdir: scriptPath ? path.dirname(scriptPath) : null,
        scriptPath,
        pidFilePath: null,
        stdoutLogPath: null,
        stderrLogPath: null,
        launchdStdoutLogPath: null,
        launchdStderrLogPath: null,
        launchdLabel: null,
        launchdPlistPath: null,
        launchdLoaded: false,
        autostartInstalled: false,
        startedAtEpochMs: null,
        summary: lifecycle === 'online'
            ? 'server online, but daemon metadata could not be resolved'
            : 'daemon metadata unavailable',
        source: 'fallback',
        errorMessage,
    };
}

function probeLifecycleWithoutScript(serverUrl: string): LangGraphDaemonLifecycle {
    try {
        const okEndpoint = new URL('/ok', ensureTrailingSlash(serverUrl));
        childProcess.execFileSync('curl', ['-sf', okEndpoint.toString()], {
            stdio: ['ignore', 'ignore', 'ignore'],
        });
        return 'online';
    } catch {
        return 'offline';
    }
}

function derivePortFromServerUrl(serverUrl: string): number | null {
    try {
        const parsed = new URL(serverUrl);
        if (parsed.port) {
            const port = Number.parseInt(parsed.port, 10);
            return Number.isNaN(port) ? null : port;
        }
        return parsed.protocol === 'https:' ? 443 : 80;
    } catch {
        return null;
    }
}

function normalizeDaemonManager(value: unknown): LangGraphDaemonManager {
    return value === 'launchd' || value === 'nohup' || value === 'manual' || value === 'unknown'
        ? value
        : 'unknown';
}

function normalizeDaemonLifecycle(value: unknown): LangGraphDaemonLifecycle {
    return value === 'online' || value === 'offline' || value === 'starting' || value === 'error'
        ? value
        : 'offline';
}

function buildDaemonSummary(
    manager: LangGraphDaemonManager,
    lifecycle: LangGraphDaemonLifecycle,
    pid: number | null,
    autostartInstalled: boolean,
): string {
    const parts = [
        lifecycle,
        manager === 'unknown' ? 'daemon=unknown' : `daemon=${manager}`,
    ];

    if (pid !== null) {
        parts.push(`pid=${pid}`);
    }
    if (autostartInstalled) {
        parts.push('autostart=installed');
    }

    return parts.join(' | ');
}

function asNullableInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : null;
}
