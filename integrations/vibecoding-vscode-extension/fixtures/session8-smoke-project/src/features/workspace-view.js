function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace(".000Z", "Z");
}

function renderNavigation(items) {
  return items
    .map(
      (item) => `
        <li class="nav-chip">
          <span>${escapeHtml(item.label)}</span>
          <code>${escapeHtml(item.routeId)}</code>
        </li>
      `
    )
    .join("");
}

function renderRuns(runs = [], selectedRunId) {
  return runs
    .map(
      (run) => `
        <button
          class="run-card${run.runId === selectedRunId ? " run-card--selected" : ""}"
          type="button"
          data-action="select-run"
          data-run-id="${escapeHtml(run.runId)}"
        >
          <span class="panel-kicker">${escapeHtml(run.runId)}</span>
          <strong>${escapeHtml(run.title)}</strong>
          <span class="status-pill">${escapeHtml(run.status)}</span>
          <span class="supporting-text">Started ${escapeHtml(formatTimestamp(run.startedAt))}</span>
        </button>
      `
    )
    .join("");
}

function renderChecks(checks = []) {
  if (checks.length === 0) {
    return '<p class="empty-state">No quality checks are linked to the selected run.</p>';
  }

  return `
    <ul class="stack-list">
      ${checks
        .map(
          (check) => `
            <li class="stack-row">
              <strong>${escapeHtml(check.label)}</strong>
              <span class="supporting-text">${escapeHtml(check.status)} / ${escapeHtml(check.severity)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderEvidence(evidence = []) {
  if (evidence.length === 0) {
    return '<p class="empty-state">No evidence items are available.</p>';
  }

  return `
    <ul class="timeline">
      ${evidence
        .map(
          (item) => `
            <li class="timeline-item">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.summary ?? "No summary provided.")}</p>
              <span class="supporting-text">${escapeHtml(item.layer)} | ${escapeHtml(item.sourcePath)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderReports(reports = []) {
  if (reports.length === 0) {
    return '<p class="empty-state">No reports match the current filter.</p>';
  }

  return `
    <ul class="stack-list">
      ${reports
        .map(
          (report) => `
            <li class="stack-row">
              <div>
                <strong>${escapeHtml(report.title)}</strong>
                <p class="supporting-text">${escapeHtml(report.outputPath)}</p>
              </div>
              <span class="status-pill">${escapeHtml(report.status)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

export function renderWorkspace(state) {
  const dashboard = state.dashboard?.data;
  const runDetail = state.runDetail;
  const reports = state.reports?.reports ?? [];

  return `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Session 4</p>
        <h1>Workspace command center.</h1>
        <p class="summary">
          Core UI / API logic A now hydrates a local workspace shell, drills into run detail,
          and filters report artifacts without leaving the embedded runtime chain.
        </p>
      </section>

      <section class="toolbar" aria-label="Workspace actions">
        <button class="toolbar-button" type="button" data-action="refresh-workspace">Refresh workspace</button>
        <label class="toolbar-select">
          <span>Report status</span>
          <select name="report-status">
            ${state.reportStatusOptions
              .map(
                (option) => `
                  <option value="${escapeHtml(option.value)}"${option.value === state.reportStatus ? " selected" : ""}>
                    ${escapeHtml(option.label)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>
      </section>

      <section class="overview-grid" aria-label="Session 4 summary">
        <article class="summary-tile">
          <span class="metric">${state.summary.runCount}</span>
          <h2>Runs in scope</h2>
          <p>The dashboard snapshot exposes the local run inventory.</p>
        </article>
        <article class="summary-tile">
          <span class="metric">${state.summary.openCheckCount}</span>
          <h2>Open checks</h2>
          <p>Non-pass quality checks remain visible before final integration.</p>
        </article>
        <article class="summary-tile">
          <span class="metric">${state.summary.reportCount}</span>
          <h2>Reports listed</h2>
          <p>Report filtering stays on the local module transport.</p>
        </article>
        <article class="summary-tile">
          <span class="metric">${state.summary.evidenceCount}</span>
          <h2>Evidence items</h2>
          <p>The selected run detail includes evidence and checks.</p>
        </article>
      </section>

      <section class="section-block" aria-labelledby="nav-title">
        <div class="section-heading">
          <p class="eyebrow">Navigation</p>
          <h2 id="nav-title">Session route map</h2>
        </div>
        <ul class="nav-strip">${renderNavigation(state.navigation)}</ul>
      </section>

      <section class="content-grid">
        <article class="panel" aria-labelledby="runs-title">
          <div class="section-heading">
            <p class="eyebrow">Dashboard</p>
            <h2 id="runs-title">${escapeHtml(dashboard?.context?.projectName ?? "Unknown project")}</h2>
          </div>
          <p class="supporting-text">
            Active run: <code>${escapeHtml(dashboard?.context?.activeRunId ?? "n/a")}</code>
            | Last sync: <code>${escapeHtml(formatTimestamp(dashboard?.context?.lastSyncedAt))}</code>
          </p>
          <div class="run-grid">
            ${renderRuns(dashboard?.activeRuns ?? [], state.selectedRunId)}
          </div>
        </article>

        <article class="panel" aria-labelledby="detail-title">
          <div class="section-heading">
            <p class="eyebrow">Run Detail</p>
            <h2 id="detail-title">${escapeHtml(runDetail?.run?.title ?? "Select a run")}</h2>
          </div>
          <dl class="meta-list">
            <div>
              <dt>Run ID</dt>
              <dd><code>${escapeHtml(runDetail?.run?.runId ?? "n/a")}</code></dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>${escapeHtml(state.summary.selectedRunStatus)}</dd>
            </div>
            <div>
              <dt>Latest Report</dt>
              <dd>${escapeHtml(state.summary.latestReportTitle)}</dd>
            </div>
          </dl>
          <div class="detail-grid">
            <section>
              <h3>Evidence timeline</h3>
              ${renderEvidence(runDetail?.evidence ?? [])}
            </section>
            <section>
              <h3>Quality checks</h3>
              ${renderChecks(runDetail?.checks ?? [])}
            </section>
          </div>
        </article>
      </section>

      <section class="section-block" aria-labelledby="reports-title">
        <div class="section-heading">
          <p class="eyebrow">Reports</p>
          <h2 id="reports-title">Filtered report library</h2>
        </div>
        <article class="panel">
          ${renderReports(reports)}
        </article>
      </section>
    </main>
  `;
}
