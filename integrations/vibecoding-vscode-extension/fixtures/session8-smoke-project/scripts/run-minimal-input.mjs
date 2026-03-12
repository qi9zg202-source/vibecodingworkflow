import assert from "node:assert/strict";

import { createSessionRuntime } from "../src/runtime/session-runtime.js";

const runtime = createSessionRuntime();

const dashboard = await runtime.loadRouteData();
assert.equal(dashboard.operationId, "loadDashboard", "Default route should load dashboard.");
assert.equal(dashboard.context.projectId, runtime.config.defaultProjectId, "Default project should be used.");
assert.equal(dashboard.data.context.projectId, runtime.config.defaultProjectId, "Dashboard payload should match project.");
assert.ok(dashboard.data.activeRuns.length > 0, "Dashboard should expose at least one run.");

const runDetail = await runtime.loadRouteData({
  routeId: "run-detail",
  runId: "run-001"
});
assert.equal(runDetail.operationId, "loadRunDetail", "Run detail route should select the detail loader.");
assert.equal(runDetail.data.run.runId, "run-001", "Run detail should return the requested run.");

const reports = await runtime.execute("listReports", {
  projectId: runtime.config.defaultProjectId
});
assert.ok(Array.isArray(reports.reports), "Reports output should be an array.");

console.log("Minimal runtime check passed.");

