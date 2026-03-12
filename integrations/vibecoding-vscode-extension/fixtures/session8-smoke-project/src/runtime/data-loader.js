import { sessionSeed } from "../data/session-seed.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesProject(record, projectId) {
  return !Object.hasOwn(record, "projectId") || record.projectId === projectId;
}

export function createDataLoader({ seed = sessionSeed } = {}) {
  const state = clone(seed);

  function getProjectContext(projectId) {
    const context = state.entities.projectContext;
    if (!context || context.projectId !== projectId) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    return clone(context);
  }

  function getRuns(projectId) {
    return state.entities.runRecord.filter((run) => matchesProject({ projectId }, projectId) && true);
  }

  function getChecksByIds(checkIds) {
    return state.entities.qualityCheck.filter((check) => checkIds.includes(check.checkId));
  }

  function getReportsByProject(projectId, status) {
    return state.entities.reportArtifact.filter((report) => {
      if (status && report.status !== status) {
        return false;
      }
      const run = state.entities.runRecord.find((item) => item.runId === report.runId);
      return run ? matchesProject({ projectId }, projectId) : false;
    });
  }

  function requireRun(projectId, runId) {
    const run = state.entities.runRecord.find((item) => item.runId === runId);
    if (!run) {
      throw new Error("RUN_NOT_FOUND");
    }
    getProjectContext(projectId);
    return run;
  }

  return {
    loadDashboard({ projectId }) {
      const context = getProjectContext(projectId);
      const activeRuns = clone(getRuns(projectId));
      const openChecks = clone(
        state.entities.qualityCheck.filter((check) => check.status !== "pass")
      );
      const fallbackReport = state.entities.reportArtifact[0] ?? null;
      const activeRun = activeRuns.find((run) => run.runId === context.activeRunId) ?? activeRuns[0] ?? null;
      const latestReport = clone(
        state.entities.reportArtifact.find((report) => report.runId === activeRun?.runId) ?? fallbackReport
      );

      return {
        context,
        activeRuns,
        openChecks,
        latestReport
      };
    },

    loadRunDetail({ projectId, runId }) {
      const run = clone(requireRun(projectId, runId));
      const evidence = clone(
        state.entities.evidenceItem.filter((item) => item.runId === runId)
      );
      const checks = clone(getChecksByIds(run.qualityCheckIds));
      const relatedReports = clone(
        state.entities.reportArtifact.filter((report) => report.runId === runId)
      );

      return {
        run,
        evidence,
        checks,
        relatedReports
      };
    },

    listReports({ projectId, status }) {
      return {
        context: getProjectContext(projectId),
        reports: clone(getReportsByProject(projectId, status))
      };
    },

    loadSettings({ projectId }) {
      return {
        context: getProjectContext(projectId),
        preferences: clone(state.entities.projectPreference)
      };
    },

    saveProjectSettings({ projectId, preferences }) {
      getProjectContext(projectId);
      state.entities.projectPreference = {
        ...state.entities.projectPreference,
        ...clone(preferences),
        projectId
      };
      return clone(state.entities.projectPreference);
    },

    inspect() {
      return {
        entityCounts: {
          runs: state.entities.runRecord.length,
          evidence: state.entities.evidenceItem.length,
          checks: state.entities.qualityCheck.length,
          reports: state.entities.reportArtifact.length
        }
      };
    }
  };
}

