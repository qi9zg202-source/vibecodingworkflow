const sidebarSections = [
  {
    title: "Session 1 Deliverable",
    items: [
      "四大业务区域页面骨架",
      "最小导航入口与区域锚点",
      "与 PRD / Work Plan 对齐的模块边界说明",
    ],
  },
  {
    title: "Test Gate",
    items: [
      "页面骨架可验证",
      "四大工作区导航结构可验证",
      "模块边界与 PRD.md / work-plan.md 对齐",
    ],
  },
  {
    title: "Out Of Scope",
    items: [
      "不实现复杂 ROI 算法",
      "不接真实 BMS / historian / 审批系统",
      "不引入 Session 2 对象模型与状态机逻辑",
    ],
  },
];

const workspaceMap = [
  {
    id: "overview",
    title: "Operations Overview",
    owner: "值班运行工程师",
    scope: "先看当前负荷、边界占用和待处理动作，判断现在是否具备策略调整窗口。",
  },
  {
    id: "workbench",
    title: "Strategy Workbench",
    owner: "节能优化工程师",
    scope: "查看候选策略包、适用工况、收益范围占位、风险等级与回退说明入口。",
  },
  {
    id: "execution",
    title: "Approval & Execution",
    owner: "审批人与执行人",
    scope: "确认审批、下发、稳态观察和回退路径的页面边界，本轮不输出自动执行动作。",
  },
  {
    id: "audit",
    title: "Audit & Evidence",
    owner: "课长 / 审查方",
    scope: "核对证据清单、审计轨迹和 Session 产物入口，确保每次动作都有留痕。",
  },
];

const boundaryLedger = [
  {
    area: "Operations Overview",
    sessionScope: "保留运行总览、边界占用、值班待办和告警摘要入口骨架。",
    deferredScope: "真实指标结构与异常映射延后到 Session 3。",
    alignment: "对应 PRD 的制冷站运行概览，以及 work-plan 的 Session 1 / Session 3 边界。",
  },
  {
    area: "Strategy Workbench",
    sessionScope: "保留策略包入口、工况匹配占位、收益范围占位、风险与回退说明入口。",
    deferredScope: "不做 ROI 算法、推荐编排和真实策略包样例，分别延后到 Session 4 / 5。",
    alignment: "对应 PRD 的策略包目录与详情、ROI / 风险 / 回退展示。",
  },
  {
    area: "Approval & Execution",
    sessionScope: "保留审批、下发、稳态观察和回退闭环的流程骨架。",
    deferredScope: "不接真实审批系统，不落执行状态机，详细闭环延后到 Session 6。",
    alignment: "对应 PRD 的审批、下发、反馈与稳态验证范围。",
  },
  {
    area: "Audit & Evidence",
    sessionScope: "保留审计轨迹、证据清单、角色说明和交付物挂载区入口。",
    deferredScope: "不接真实身份系统与审计平台，模块联通延后到 Session 8，业务样例延后到 Session 9。",
    alignment: "对应 PRD 的异常工况与审计记录，以及 work-plan 的 Session 8 / 9 承接。",
  },
];

const workspaceContent = {
  overview: {
    entry: [
      {
        title: "值班入口",
        detail: "从当前负荷、供回水温、流量、机组台数和告警摘要进入工作台。",
      },
      {
        title: "本区回答的问题",
        detail: "现在能不能动、哪条边界最紧、有哪些动作仍卡在审批前。",
      },
    ],
    details: [
      {
        label: "核心视图骨架",
        body: "运行总览卡片、边界占用面板、值班待办列表、告警摘要。",
      },
      {
        label: "业务边界",
        body: "只保留 Fab CUS 制冷站范围，不延伸到全厂其他公辅系统。",
      },
      {
        label: "下一 Session 承接",
        body: "Session 3 才补入真实指标结构和异常提示映射。",
      },
    ],
  },
  workbench: {
    entry: [
      {
        title: "策略入口",
        detail: "按季节、负荷、湿球条件进入策略包目录与详情占位。",
      },
      {
        title: "本区回答的问题",
        detail: "此刻有哪些候选策略、适用工况是否匹配、风险和回退说明在哪里看。",
      },
    ],
    details: [
      {
        label: "核心视图骨架",
        body: "策略包列表、工况匹配提示、收益区间占位、风险等级与回退说明。",
      },
      {
        label: "业务边界",
        body: "本轮只搭骨架，不计算 ROI，不下结论，不做推荐编排。",
      },
      {
        label: "下一 Session 承接",
        body: "Session 2 补对象模型，Session 4 才沉淀策略包样例与匹配细节。",
      },
    ],
  },
  execution: {
    entry: [
      {
        title: "审批与执行入口",
        detail: "从策略建议进入待审批、待下发、稳态观察、完成或回退的流程骨架。",
      },
      {
        title: "本区回答的问题",
        detail: "谁来审批、谁来下发、何时进入稳态观察、什么条件触发回退。",
      },
    ],
    details: [
      {
        label: "核心视图骨架",
        body: "审批步骤条、下发窗口占位、执行反馈入口、回退触发条件卡片。",
      },
      {
        label: "业务边界",
        body: "所有动作仍保留人工审批，页面不输出任何自动执行指令。",
      },
      {
        label: "下一 Session 承接",
        body: "Session 6 才实现审批、下发、稳态验证与回退闭环状态流。",
      },
    ],
  },
  audit: {
    entry: [
      {
        title: "证据入口",
        detail: "从审批记录、边界检查、稳态结论和 Session 产物进入审计骨架。",
      },
      {
        title: "本区回答的问题",
        detail: "谁做了什么、依据是什么、是否满足风险审查和交付留痕要求。",
      },
    ],
    details: [
      {
        label: "核心视图骨架",
        body: "审计轨迹列表、证据清单、交付物挂载区和角色说明。",
      },
      {
        label: "业务边界",
        body: "本轮不接真实身份系统与审计平台，只保留页面入口与占位说明。",
      },
      {
        label: "下一 Session 承接",
        body: "Session 8 才做模块联通，Session 9 才补真实业务样例与边界验证。",
      },
    ],
  },
};

function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (content) {
    element.textContent = content;
  }
  return element;
}

function renderSidebar() {
  const root = document.querySelector("#sidebar");
  sidebarSections.forEach((section) => {
    const card = createElement("section", "sidebar-card");
    card.append(createElement("p", "card-label", section.title));

    const list = createElement("ul", "sidebar-list");
    section.items.forEach((item) => {
      const listItem = createElement("li", "", item);
      list.append(listItem);
    });

    card.append(list);
    root.append(card);
  });
}

function renderWorkspaceMap() {
  const root = document.querySelector("#workspace-map");

  workspaceMap.forEach((item) => {
    const card = createElement("a", "map-card");
    card.href = `#${item.id}`;
    card.dataset.target = item.id;
    card.append(
      createElement("p", "card-label", "Business Entry"),
      createElement("h3", "", item.title),
      createElement("p", "map-owner", item.owner),
      createElement("p", "panel-copy", item.scope),
    );
    root.append(card);
  });
}

function renderBoundaryLedger() {
  const root = document.querySelector("#boundary-ledger");

  boundaryLedger.forEach((item) => {
    const card = createElement("article", "ledger-card");
    card.append(
      createElement("p", "card-label", "Module Boundary"),
      createElement("h3", "", item.area),
      createElement("p", "panel-copy", item.sessionScope),
      createElement("p", "ledger-deferred", item.deferredScope),
      createElement("p", "ledger-alignment", item.alignment),
    );
    root.append(card);
  });
}

function renderWorkspaceSection(areaId) {
  const content = workspaceContent[areaId];
  const entryRoot = document.querySelector(`#${areaId}-entry`);
  const detailRoot = document.querySelector(`#${areaId}-details`);

  content.entry.forEach((item) => {
    const panel = createElement("article", "panel panel-entry");
    panel.append(
      createElement("p", "card-label", "Entry"),
      createElement("h3", "", item.title),
      createElement("p", "panel-copy", item.detail),
    );
    entryRoot.append(panel);
  });

  content.details.forEach((item) => {
    const panel = createElement("article", "panel");
    panel.append(
      createElement("p", "card-label", item.label),
      createElement("p", "panel-copy", item.body),
    );
    detailRoot.append(panel);
  });
}

function setupNav() {
  const navLinks = document.querySelectorAll("[data-target]");

  const setActiveLink = (targetId) => {
    navLinks.forEach((link) => {
      const isActive = link.dataset.target === targetId;
      link.classList.toggle("is-active", isActive);

      if (link.classList.contains("nav-link")) {
        link.setAttribute("aria-current", isActive ? "page" : "false");
      }
    });
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const section = document.getElementById(link.dataset.target);
      if (!section) {
        return;
      }

      event.preventDefault();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveLink(link.dataset.target);
      history.replaceState(null, "", `#${link.dataset.target}`);
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        setActiveLink(entry.target.id);
      });
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: 0.15,
    },
  );

  document.querySelectorAll("[data-workspace-area]").forEach((section) => observer.observe(section));

  const initialTarget = window.location.hash.replace("#", "");
  if (initialTarget && document.getElementById(initialTarget)) {
    setActiveLink(initialTarget);
  }
}

renderSidebar();
renderWorkspaceMap();
renderBoundaryLedger();
Object.keys(workspaceContent).forEach(renderWorkspaceSection);
setupNav();
