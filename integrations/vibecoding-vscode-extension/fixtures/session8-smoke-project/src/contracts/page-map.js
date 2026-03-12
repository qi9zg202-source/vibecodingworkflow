export const pageMap = {
  appId: "session8-smoke-project",
  session: 2,
  rootRouteId: "dashboard",
  navigation: [
    { routeId: "dashboard", label: "Workspace" },
    { routeId: "run-detail", label: "Run Detail" },
    { routeId: "reports", label: "Reports" },
    { routeId: "settings", label: "Settings" }
  ],
  routes: [
    {
      id: "dashboard",
      path: "/",
      title: "Workspace Dashboard",
      purpose: "Summarize current project context, active runs, and quality posture.",
      sections: ["hero", "project-context", "active-runs", "quality-summary"],
      primaryActions: ["refresh-context", "open-run", "review-checks"],
      dataDependencies: ["dashboardSnapshot"]
    },
    {
      id: "run-detail",
      path: "/runs/:runId",
      title: "Run Detail",
      purpose: "Inspect one run with evidence, checks, and generated artifacts.",
      sections: ["run-overview", "evidence-timeline", "quality-checks", "artifact-links"],
      primaryActions: ["reload-run", "open-report", "return-dashboard"],
      dataDependencies: ["runDetail"]
    },
    {
      id: "reports",
      path: "/reports",
      title: "Report Library",
      purpose: "Browse generated artifacts and their readiness for delivery.",
      sections: ["report-summary", "report-list", "delivery-readiness"],
      primaryActions: ["filter-reports", "open-report", "export-report"],
      dataDependencies: ["reportLibrary"]
    },
    {
      id: "settings",
      path: "/settings",
      title: "Project Settings",
      purpose: "Edit stable project-level preferences used by later sessions.",
      sections: ["project-profile", "preference-editor", "validation-state"],
      primaryActions: ["save-preferences", "reset-preferences"],
      dataDependencies: ["settingsSnapshot"]
    }
  ]
};

export function getRouteById(routeId) {
  return pageMap.routes.find((route) => route.id === routeId) ?? null;
}
