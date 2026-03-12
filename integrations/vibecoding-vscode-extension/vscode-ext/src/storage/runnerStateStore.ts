import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DashboardRunnerProcessInfo, DashboardRunnerState } from '../ui/dashboard';

export interface PersistedRunnerStateRecord {
    workspaceRoot: string;
    projectRoot: string;
    runnerState: DashboardRunnerState;
    processInfo: DashboardRunnerProcessInfo | null;
    updatedAtEpochMs: number;
}

interface RunnerStateRow {
    workspace_root: string;
    project_root: string;
    runner_state: DashboardRunnerState;
    process_name: string | null;
    pid: number | null;
    started_at_epoch_ms: number | null;
    updated_at_epoch_ms: number;
}

const RUNNER_STATE_DIR_NAME = '.vibecoding';
const RUNNER_STATE_FILE_NAME = 'runner-state.sqlite';

const PYTHON_SCRIPT = `
import json
import sqlite3
import sys
from pathlib import Path

db_path = sys.argv[1]
action = sys.argv[2]
Path(db_path).parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(db_path)
conn.execute("""
CREATE TABLE IF NOT EXISTS runner_process_state (
    workspace_root TEXT NOT NULL,
    project_root TEXT NOT NULL,
    runner_state TEXT NOT NULL,
    process_name TEXT,
    pid INTEGER,
    started_at_epoch_ms INTEGER,
    updated_at_epoch_ms INTEGER NOT NULL,
    PRIMARY KEY (workspace_root, project_root)
)
""")

if action == "load_project":
    project_root = sys.argv[3]
    rows = conn.execute(
        """
        SELECT
            workspace_root,
            project_root,
            runner_state,
            process_name,
            pid,
            started_at_epoch_ms,
            updated_at_epoch_ms
        FROM runner_process_state
        WHERE project_root = ?
        ORDER BY updated_at_epoch_ms DESC
        """,
        (project_root,),
    ).fetchall()
    print(json.dumps([
        {
            "workspace_root": row[0],
            "project_root": row[1],
            "runner_state": row[2],
            "process_name": row[3],
            "pid": row[4],
            "started_at_epoch_ms": row[5],
            "updated_at_epoch_ms": row[6],
        }
        for row in rows
    ]))
elif action == "load_workspace":
    workspace_root = sys.argv[3]
    rows = conn.execute(
        """
        SELECT
            workspace_root,
            project_root,
            runner_state,
            process_name,
            pid,
            started_at_epoch_ms,
            updated_at_epoch_ms
        FROM runner_process_state
        WHERE workspace_root = ?
        ORDER BY project_root ASC
        """,
        (workspace_root,),
    ).fetchall()
    print(json.dumps([
        {
            "workspace_root": row[0],
            "project_root": row[1],
            "runner_state": row[2],
            "process_name": row[3],
            "pid": row[4],
            "started_at_epoch_ms": row[5],
            "updated_at_epoch_ms": row[6],
        }
        for row in rows
    ]))
elif action == "upsert":
    payload = json.loads(sys.argv[3])
    conn.execute(
        """
        INSERT INTO runner_process_state (
            workspace_root,
            project_root,
            runner_state,
            process_name,
            pid,
            started_at_epoch_ms,
            updated_at_epoch_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_root, project_root) DO UPDATE SET
            runner_state = excluded.runner_state,
            process_name = excluded.process_name,
            pid = excluded.pid,
            started_at_epoch_ms = excluded.started_at_epoch_ms,
            updated_at_epoch_ms = excluded.updated_at_epoch_ms
        """,
        (
            payload["workspaceRoot"],
            payload["projectRoot"],
            payload["runnerState"],
            payload["processInfo"]["processName"] if payload.get("processInfo") else None,
            payload["processInfo"]["pid"] if payload.get("processInfo") else None,
            payload["processInfo"]["startedAtEpochMs"] if payload.get("processInfo") else None,
            payload["updatedAtEpochMs"],
        ),
    )
    conn.commit()

conn.close()
`.trim();

export class RunnerStateStore implements vscode.Disposable {
    constructor(private readonly legacyDbPath: string | null) {
        if (this.legacyDbPath) {
            fs.mkdirSync(path.dirname(this.legacyDbPath), { recursive: true });
            this.runPython(this.legacyDbPath, ['load_workspace', '__bootstrap__']);
        }
    }

    static create(context: vscode.ExtensionContext, workspaceRoot: string | null): RunnerStateStore {
        return new RunnerStateStore(resolveLegacyRunnerStateDbPath(context, workspaceRoot));
    }

    loadForProject(projectRoot: string): PersistedRunnerStateRecord[] {
        const projectDbPath = resolveRunnerStateDbPath(projectRoot);
        const projectRows = this.loadRows(projectDbPath, ['load_project', projectRoot]);
        if (projectRows.length > 0) {
            return projectRows.map((row) => mapRowToRecord(row));
        }

        if (!this.legacyDbPath || !fs.existsSync(this.legacyDbPath)) {
            return [];
        }

        const legacyRows = this.loadRows(this.legacyDbPath, ['load_project', projectRoot]);
        if (legacyRows.length === 0) {
            return [];
        }

        for (const row of legacyRows) {
            const record = mapRowToRecord(row);
            this.upsert(record);
        }

        return legacyRows.map((row) => mapRowToRecord(row));
    }

    upsert(record: PersistedRunnerStateRecord) {
        const dbPath = resolveRunnerStateDbPath(record.projectRoot);
        this.runPython(dbPath, ['upsert', JSON.stringify(record)]);
    }

    dispose() {
        return;
    }

    private loadRows(dbPath: string, args: string[]): RunnerStateRow[] {
        if (!fs.existsSync(dbPath)) {
            return [];
        }
        const output = this.runPython(dbPath, args);
        return JSON.parse(output || '[]') as RunnerStateRow[];
    }

    private runPython(dbPath: string, args: string[]): string {
        return childProcess.execFileSync('python3', ['-c', PYTHON_SCRIPT, dbPath, ...args], {
            encoding: 'utf8',
        }).trim();
    }
}

export function resolveRunnerStateDbPath(projectRoot: string): string {
    return path.join(projectRoot, RUNNER_STATE_DIR_NAME, RUNNER_STATE_FILE_NAME);
}

export function resolveLegacyRunnerStateDbPath(context: vscode.ExtensionContext, workspaceRoot: string | null): string | null {
    const storageRoot = context.globalStorageUri?.fsPath
        ?? path.join(os.tmpdir(), 'vibecoding-vscode-extension');
    const workspaceKey = workspaceRoot ? hashWorkspaceRoot(workspaceRoot) : 'default';
    return path.join(storageRoot, `runner-state-${workspaceKey}.sqlite`);
}

function hashWorkspaceRoot(workspaceRoot: string): string {
    return crypto.createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 12);
}

function mapRowToRecord(row: RunnerStateRow): PersistedRunnerStateRecord {
    return {
        workspaceRoot: row.workspace_root,
        projectRoot: row.project_root,
        runnerState: row.runner_state,
        processInfo: row.process_name || row.pid !== null || row.started_at_epoch_ms !== null
            ? {
                processName: row.process_name ?? 'n/a',
                pid: row.pid,
                startedAtEpochMs: row.started_at_epoch_ms,
                heartbeatAtEpochMs: row.updated_at_epoch_ms,
            }
            : null,
        updatedAtEpochMs: row.updated_at_epoch_ms,
    };
}
