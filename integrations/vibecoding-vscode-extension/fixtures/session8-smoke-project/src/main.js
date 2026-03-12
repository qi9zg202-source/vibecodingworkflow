import { createSessionRuntime } from "./runtime/session-runtime.js";
import { createWorkspaceController } from "./features/workspace-controller.js";
import { renderWorkspace } from "./features/workspace-view.js";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

const runtime = createSessionRuntime();
const controller = createWorkspaceController({ runtime });

function renderMessage(title, message) {
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Session 4</p>
        <h1>${title}</h1>
        <p class="summary">${message}</p>
      </section>
    </main>
  `;
}

function syncView() {
  app.innerHTML = renderWorkspace(controller.getState());
}

async function runAction(callback) {
  try {
    await callback();
    syncView();
  } catch (error) {
    renderMessage("Workspace action failed.", error.message);
  }
}

async function bootstrap() {
  renderMessage("Loading workspace.", "Booting Session 4 UI / API logic A from the local runtime.");
  await controller.initialize();
  syncView();
}

bootstrap().catch((error) => {
  renderMessage("Runtime boot failed.", error.message);
});

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const { action, runId } = target.dataset;
  if (action === "refresh-workspace") {
    void runAction(() => controller.refreshWorkspace());
  }

  if (action === "select-run" && runId) {
    void runAction(() => controller.selectRun(runId));
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.name === "report-status") {
    void runAction(() => controller.setReportStatus(target.value));
  }
});
