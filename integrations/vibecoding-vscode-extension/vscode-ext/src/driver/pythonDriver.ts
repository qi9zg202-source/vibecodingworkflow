import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DriverResult } from './driverTypes';

const DEFAULT_DRIVER_PATH = '/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/scripts/run-vibecoding-loop.py';

export interface DriverConfig {
    pythonPath: string;
    driverPath: string;
}

export interface InvokeDriverOptions {
    action: 'inspect' | 'prepare';
}

export class DriverIntegrationError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'DriverIntegrationError';
        this.code = code;
        this.details = details;
    }
}

export function getDriverConfig(): DriverConfig {
    const config = vscode.workspace.getConfiguration('vibeCoding');
    const pythonPath = (config.get<string>('pythonPath') ?? 'python3').trim() || 'python3';
    const configuredDriverPath = (config.get<string>('driverPath') ?? '').trim();

    return {
        pythonPath,
        driverPath: configuredDriverPath || DEFAULT_DRIVER_PATH,
    };
}

export function validateDriverConfig(config: DriverConfig): string | null {
    if (isPathLike(config.pythonPath) && !fs.existsSync(config.pythonPath)) {
        return `Python executable not found: ${config.pythonPath}`;
    }

    if (!fs.existsSync(config.driverPath)) {
        return `Python driver not found: ${config.driverPath}`;
    }

    return null;
}

export async function inspectWorkflow(projectRoot: string, config: DriverConfig): Promise<DriverResult> {
    return invokeDriver(projectRoot, config, { action: 'inspect' });
}

export async function prepareWorkflow(projectRoot: string, config: DriverConfig): Promise<DriverResult> {
    return invokeDriver(projectRoot, config, { action: 'prepare' });
}

export function buildRunDriverCommand(projectRoot: string, config: DriverConfig, runnerCommandTemplate: string): string {
    const args = [
        config.driverPath,
        projectRoot,
        '--action',
        'run',
        '--runner-cmd',
        runnerCommandTemplate,
    ];

    return [shellQuote(config.pythonPath), ...args.map(shellQuote)].join(' ');
}

async function invokeDriver(projectRoot: string, config: DriverConfig, options: InvokeDriverOptions): Promise<DriverResult> {
    const args = [
        config.driverPath,
        projectRoot,
        '--action',
        options.action,
        '--json',
    ];

    const { stdout, stderr } = await execFileAsync(config.pythonPath, args, {
        cwd: projectRoot,
    });

    const stdoutText = stdout.trim();
    if (!stdoutText) {
        throw new Error(`Driver returned empty stdout.${stderr ? ` stderr: ${stderr.trim()}` : ''}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(stdoutText);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DriverIntegrationError(
            'driver_invalid_json',
            `Failed to parse driver JSON output: ${message}`,
            {
                stdout_preview: stdoutText.slice(0, 400),
                stderr_preview: stderr.trim().slice(0, 400),
            }
        );
    }

    return validateDriverResult(parsed);
}

function execFileAsync(
    command: string,
    args: string[],
    options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile(command, args, { cwd: options.cwd }, (error, stdout, stderr) => {
            const stdoutText = String(stdout);
            const stderrText = String(stderr);

            if (error) {
                // JSON mode still returns structured stdout for blocked/invalid states.
                if (stdoutText.trim()) {
                    resolve({ stdout: stdoutText, stderr: stderrText });
                    return;
                }

                const errorWithCode = error as NodeJS.ErrnoException;
                if (errorWithCode.code === 'ENOENT') {
                    reject(
                        new DriverIntegrationError(
                            'python_not_found',
                            `Python executable not found: ${command}`,
                            {
                                python_path: command,
                            }
                        )
                    );
                    return;
                }

                reject(
                    new DriverIntegrationError(
                        'driver_execution_failed',
                        `Failed to execute Python driver (${command} ${args.map((arg) => path.basename(arg) === arg ? arg : JSON.stringify(arg)).join(' ')}): ${error.message}${stderrText ? `; stderr: ${stderrText.trim()}` : ''}`,
                        {
                            python_path: command,
                            driver_args: args,
                            stderr: stderrText.trim(),
                        }
                    )
                );
                return;
            }

            resolve({ stdout: stdoutText, stderr: stderrText });
        });
    });
}

function shellQuote(value: string): string {
    if (value.length === 0) {
        return "''";
    }

    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function validateDriverResult(value: unknown): DriverResult {
    if (!value || typeof value !== 'object') {
        throw new DriverIntegrationError('driver_invalid_payload', 'Driver JSON payload is not an object.');
    }

    const record = value as Record<string, unknown>;
    const requiredStringFields = [
        'schema_version',
        'status',
        'message',
        'requested_action',
        'effective_action',
        'project_root',
    ];

    for (const field of requiredStringFields) {
        if (typeof record[field] !== 'string' || record[field] === '') {
            throw new DriverIntegrationError(
                'driver_invalid_payload',
                `Driver JSON payload is missing required string field: ${field}`,
                { field }
            );
        }
    }

    if (typeof record.exit_code !== 'number') {
        throw new DriverIntegrationError(
            'driver_invalid_payload',
            'Driver JSON payload is missing required numeric field: exit_code',
            { field: 'exit_code' }
        );
    }

    if (!record.artifacts || typeof record.artifacts !== 'object') {
        throw new DriverIntegrationError(
            'driver_invalid_payload',
            'Driver JSON payload is missing required object field: artifacts',
            { field: 'artifacts' }
        );
    }

    if (!record.next_action || typeof record.next_action !== 'object') {
        throw new DriverIntegrationError(
            'driver_invalid_payload',
            'Driver JSON payload is missing required object field: next_action',
            { field: 'next_action' }
        );
    }

    return record as unknown as DriverResult;
}

function isPathLike(value: string): boolean {
    return value.includes('/') || value.startsWith('.');
}
