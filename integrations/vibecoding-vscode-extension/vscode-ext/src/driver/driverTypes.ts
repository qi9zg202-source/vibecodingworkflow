export type WorkflowStatus = 'ready' | 'blocked' | 'in_progress' | 'done' | 'invalid' | 'dry_run' | 'runner_finished' | 'runner_failed';

export interface DriverNextAction {
    type: string;
    message: string;
}

export type LangGraphDaemonManager = 'launchd' | 'nohup' | 'manual' | 'unknown';
export type LangGraphDaemonLifecycle = 'online' | 'offline' | 'starting' | 'error';

export interface LangGraphDaemonInfo {
    manager: LangGraphDaemonManager;
    lifecycle: LangGraphDaemonLifecycle;
    serverUrl: string;
    port: number | null;
    pid: number | null;
    pidSource: string | null;
    launchdPid: number | null;
    workdir: string | null;
    scriptPath: string | null;
    pidFilePath: string | null;
    stdoutLogPath: string | null;
    stderrLogPath: string | null;
    launchdStdoutLogPath: string | null;
    launchdStderrLogPath: string | null;
    launchdLabel: string | null;
    launchdPlistPath: string | null;
    launchdLoaded: boolean;
    autostartInstalled: boolean;
    startedAtEpochMs: number | null;
    summary: string;
    source: 'script' | 'fallback';
    errorMessage?: string | null;
}

export interface DriverErrorPayload {
    code: string;
    message: string;
    details: Record<string, unknown>;
}

export interface DriverResult {
    schema_version: string;
    status: WorkflowStatus;
    message: string;
    exit_code: number;
    requested_action: string;
    effective_action: string;
    project_root: string;
    session_gate: string | null;
    next_session: string | null;
    next_session_prompt: string | null;
    last_completed_session: string | null;
    last_completed_session_tests: string | null;
    inputs: Record<string, unknown>;
    artifacts: {
        startup_prompt_path: string | null;
        memory_path: string | null;
        loop_log_path: string | null;
        next_session_prompt_path: string | null;
        runner_command: string | null;
        startup_prompt_contents: string | null;
    };
    checks: Record<string, unknown>;
    risks: string[];
    next_action: DriverNextAction;
    error: DriverErrorPayload | null;
    runner_exit_code?: number;
    daemon?: LangGraphDaemonInfo | null;
}
