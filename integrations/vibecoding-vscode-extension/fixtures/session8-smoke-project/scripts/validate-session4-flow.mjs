import assert from "node:assert/strict";

import { createWorkspaceController } from "../src/features/workspace-controller.js";
import { renderWorkspace } from "../src/features/workspace-view.js";
import { createSessionRuntime } from "../src/runtime/session-runtime.js";

const controller = createWorkspaceController({
  runtime: createSessionRuntime()
});

let state = await controller.initialize();
let html = renderWorkspace(state);

assert.match(html, /Session 4/, "Rendered workspace should identify the active session.");
assert.match(html, /Workspace command center\./, "Workspace heading should be rendered.");
assert.match(html, /Workspace UI rehearsal/, "Default detail panel should render the active run.");

state = await controller.setReportStatus("draft");
html = renderWorkspace(state);
assert.equal(state.reportStatus, "draft", "Controller should persist the report filter.");
assert.equal(state.reports.reports.length, 1, "Draft filter should narrow the report list.");
assert.match(html, /Session 2 contract map/, "Filtered report should remain visible.");

state = await controller.selectRun("run-001");
html = renderWorkspace(state);
assert.equal(state.runDetail.run.runId, "run-001", "Run selection should reload detail data.");
assert.match(html, /Baseline objective/, "Selected run evidence should render in the detail panel.");
assert.match(html, /Smoke validation baseline/, "Selected run title should be rendered.");

console.log("Session 4 flow validation passed.");
