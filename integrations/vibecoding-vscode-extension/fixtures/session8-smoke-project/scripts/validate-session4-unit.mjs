import assert from "node:assert/strict";

import {
  createWorkspaceController,
  deriveReportStatusOptions,
  deriveWorkspaceSummary,
  normalizeReportStatus
} from "../src/features/workspace-controller.js";
import { createSessionRuntime } from "../src/runtime/session-runtime.js";

const runtime = createSessionRuntime();
const controller = createWorkspaceController({ runtime });
const initialState = await controller.initialize();

assert.equal(initialState.dashboard.operationId, "loadDashboard", "Workspace should boot from the dashboard route.");
assert.equal(initialState.selectedRunId, "run-002", "Active run should follow project context.");
assert.equal(initialState.summary.openCheckCount, 2, "Two non-pass checks should be surfaced.");

const summary = deriveWorkspaceSummary(initialState);
assert.equal(summary.runCount, 2, "Summary should expose all runs.");
assert.equal(summary.selectedRunStatus, "in_review", "Selected run status should be derived from detail payload.");

const reportOptions = deriveReportStatusOptions(initialState.reports.reports);
assert.deepEqual(
  reportOptions.map((option) => option.value),
  ["all", "draft", "published"],
  "Report status options should include all available filters."
);

assert.equal(normalizeReportStatus(undefined), "all", "Missing filter should normalize to all.");
assert.equal(normalizeReportStatus("draft"), "draft", "Explicit filters should be preserved.");

console.log("Session 4 unit validation passed.");
