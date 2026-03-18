const resolvedCoreModels =
  (typeof window !== "undefined" && window.coreModels) ||
  (typeof require === "function" ? require("./core-models.js") : null) ||
  {};

const sidebarSections = [
  {
    title: "Session 3 Deliverable",
    items: [
      "运行概览 KPI：负荷、供回水温、流量、机组台数、EER/COP、湿球条件",
      "约束映射：中温、低温、热回收三类边界快照",
      "值班结论：回答现在能不能动，以及必须保留的人工 gate",
    ],
  },
  {
    title: "Test Gate",
    items: [
      "关键指标结构完整",
      "异常提示与约束对象一致",
      "值班视角可以解释当前是否允许动作",
    ],
  },
  {
    title: "Out Of Scope",
    items: [
      "不推进策略推荐和 ROI 编排",
      "不补审批闭环交互细节",
      "不改写 Session 2 的对象模型和状态机",
    ],
  },
];

const workspaceContent = {
  workbench: {
    entry: [
      {
        title: "策略入口",
        detail: "仍保留季节、负荷和湿球条件入口，但本轮不做策略匹配计算与推荐排序。",
      },
      {
        title: "本区回答的问题",
        detail: "先从运行概览确认边界，再进入策略包目录查看适用工况、风险和回退说明。",
      },
    ],
    details: [
      {
        label: "下一 Session 承接",
        body: "Session 4 才补策略包样例、工况匹配结果和风险分级展示。",
      },
      {
        label: "当前边界",
        body: "本区继续保持骨架，不提前落推荐逻辑，也不输出可直接执行的策略结论。",
      },
      {
        label: "值班关联",
        body: "只有运行概览确认当前约束有余量，策略工作台才具备进一步讨论价值。",
      },
    ],
  },
  execution: {
    entry: [
      {
        title: "审批与执行入口",
        detail: "保留人工审批、人工下发、稳态观察和回退入口，当前只显示概念边界。",
      },
      {
        title: "本区回答的问题",
        detail: "谁来签核、何时可下发、什么情况下必须回退，这些问题留给后续 Session 细化。",
      },
    ],
    details: [
      {
        label: "当前边界",
        body: "Session 3 只在运行概览里提示存在已审批但未下发的预案，不延伸到执行流细节。",
      },
      {
        label: "人工 Gate",
        body: "页面继续强调审批不可绕过、回退路径必须存在，避免把概览误解为自动执行入口。",
      },
      {
        label: "下一 Session 承接",
        body: "Session 6 才正式补审批、下发、稳态验证与回退闭环状态流。",
      },
    ],
  },
  audit: {
    entry: [
      {
        title: "证据入口",
        detail: "仍保留审计轨迹、边界检查与 Session 产物入口，作为后续联调的证据挂载位。",
      },
      {
        title: "本区回答的问题",
        detail: "当前运行判断依据来自哪些约束对象、哪些告警和哪些审批 gate，可以在这里回溯。",
      },
    ],
    details: [
      {
        label: "当前边界",
        body: "本轮只建立概览到约束对象的可解释性，不接真实身份系统和审计平台。",
      },
      {
        label: "值班关联",
        body: "告警摘要会明确引用约束对象，方便后续审计追踪当前结论基于什么边界得出。",
      },
      {
        label: "下一 Session 承接",
        body: "Session 8 才做模块联通，Session 9 再补真实业务样例与边界验证证据。",
      },
    ],
  },
};

const CURRENT_SEGMENT_ID = "SEG-NIGHT-LOW";
const CURRENT_APPROVAL_TICKET_ID = "TKT-240316-01";
const CURRENT_EXECUTION_ID = "EXE-240316-TRANS-01";

function round(value, digits = 1) {
  return Number.parseFloat(value).toFixed(digits);
}

function ratioToPercent(value, digits = 1) {
  return `${round(value * 100, digits)}%`;
}

function findById(items, key, expected) {
  return (items || []).find((item) => item[key] === expected);
}

function severityWeight(severity) {
  if (severity === "critical") {
    return 3;
  }
  if (severity === "watch") {
    return 2;
  }
  if (severity === "manual_only") {
    return 1;
  }
  return 0;
}

function deriveLoopSnapshot(profile, reading) {
  const flowMargin = (reading.flowTph - profile.minFlowTph) / profile.minFlowTph;
  return {
    profileId: profile.profileId,
    loop: profile.loop,
    status: reading.status,
    supplyTempC: reading.supplyTempC,
    returnTempC: reading.returnTempC,
    flowTph: reading.flowTph,
    minFlowTph: profile.minFlowTph,
    flowMargin,
    supplyBand: `${round(profile.supplyTempMinC)}-${round(profile.supplyTempMaxC)} C`,
    returnBand: `${round(profile.returnTempMinC)}-${round(profile.returnTempMaxC)} C`,
    reserveMode: profile.reserveMode,
    heatRecoveryAvailable: profile.heatRecoveryAvailable,
    reserveNote: reading.reserveNote,
    note: reading.note,
  };
}

function summarizeDecision(checks, currentSegment) {
  const criticalChecks = checks.filter((check) => check.status === "critical");
  const watchChecks = checks.filter((check) => check.status === "watch");
  const manualChecks = checks.filter((check) => check.status === "manual_only");

  if (criticalChecks.length > 0) {
    return {
      badge: "Do Not Move",
      tone: "critical",
      title: "现在不能动，必须先解除关键边界风险。",
      detail: `当前时窗 ${currentSegment.timeWindow} 存在 ${criticalChecks.length} 项关键限制，任何动作都必须先回到人工复核。`,
    };
  }

  if (watchChecks.length > 0 || manualChecks.length > 0) {
    return {
      badge: "Manual Window",
      tone: "watch",
      title: "可以动，但只能按已审批窗口人工下发。",
      detail:
        "当前没有越界项，但中温最小流量余量偏紧，且执行记录仍停留在 planned，值班口头复核和回退入口都必须保留。",
    };
  }

  return {
    badge: "Ready",
    tone: "ok",
    title: "当前可以按审批窗口推进人工动作。",
    detail: `当前时窗 ${currentSegment.timeWindow} 的关键边界均有余量，但仍需保留人工审批和人工回退。`,
  };
}

function buildOverviewState(coreModels) {
  const baselineSegments = coreModels.baselineSegments || [];
  const constraintProfiles = coreModels.constraintProfiles || [];
  const approvalTickets = coreModels.approvalTickets || [];
  const executionRecords = coreModels.executionRecords || [];

  const currentSegment =
    findById(baselineSegments, "segmentId", CURRENT_SEGMENT_ID) ||
    baselineSegments[0] || {
      segmentId: "UNKNOWN",
      timeWindow: "N/A",
      seasonTag: "unknown",
      baselineCoolingLoadMw: 0,
      baselinePowerMw: 1,
      wetBulbRange: "N/A",
      notes: "",
    };

  const mediumProfile = findById(constraintProfiles, "profileId", "CP-MEDIUM");
  const lowTempProfile = findById(constraintProfiles, "profileId", "CP-LOW-TEMP");
  const heatRecoveryProfile = findById(constraintProfiles, "profileId", "CP-HEAT-RECOVERY");

  const approvalTicket = findById(approvalTickets, "ticketId", CURRENT_APPROVAL_TICKET_ID);
  const executionRecord = findById(executionRecords, "executionId", CURRENT_EXECUTION_ID);

  const loopSnapshots = [
    deriveLoopSnapshot(mediumProfile, {
      status: "watch",
      supplyTempC: 6.9,
      returnTempC: 12.4,
      flowTph: 1786,
      reserveNote: "2 开 1 备，N+1 备用机组锁定。",
      note: "流量余量仅高于最小值 6.3%，可人工试动，但禁止连续切换机组排序。",
    }),
    deriveLoopSnapshot(lowTempProfile, {
      status: "ok",
      supplyTempC: 4.9,
      returnTempC: 9.6,
      flowTph: 1214,
      reserveNote: "2 开 1 备，冻结风险下禁止挪用备用机组。",
      note: "低温环路温差稳定，当前不构成阻断，但任何动作都不能牺牲最小流量。",
    }),
    deriveLoopSnapshot(heatRecoveryProfile, {
      status: "watch",
      supplyTempC: 46.2,
      returnTempC: 40.6,
      flowTph: 334,
      reserveNote: "旁通待命，需工艺排程放行后才能切入。",
      note: "热回收链路当前处于条件可用状态，只能保持旁通待命，不能作为当前节能动作前提。",
    }),
  ];

  const cop = currentSegment.baselineCoolingLoadMw / currentSegment.baselinePowerMw;
  const eer = cop * 3.412;
  const chillersOnline = 2;
  const standbyChillers = 1;

  const alerts = [
    {
      severity: "watch",
      title: "中温环路接近最小流量边界",
      detail: `当前 1786 tph，对比最小流量 ${mediumProfile.minFlowTph} tph，仅保留 ${ratioToPercent(
        loopSnapshots[0].flowMargin / 1,
      )} 余量。`,
      profileId: mediumProfile.profileId,
      metric: "minFlowTph",
    },
    {
      severity: "watch",
      title: "热回收链路未放行切入",
      detail: "热回收当前仅条件可用，工艺未释放前必须保持旁通，不能作为当前动作收益前提。",
      profileId: heatRecoveryProfile.profileId,
      metric: "heatRecoveryAvailable",
    },
    {
      severity: "manual_only",
      title: "执行预案仍停留在 planned",
      detail: "审批已通过，但仍需值班口头复核后人工下发，禁止把概览结论等同于自动执行许可。",
      profileId: mediumProfile.profileId,
      metric: "reserveMode",
    },
  ];

  const decisionChecks = [
    {
      label: "审批与下发 Gate",
      status: approvalTicket && executionRecord && executionRecord.workflowState === "planned" ? "manual_only" : "critical",
      detail:
        approvalTicket && executionRecord && executionRecord.workflowState === "planned"
          ? "审批已通过，但执行记录仍在 planned，人工下发前必须保留班长复核。"
          : "审批或执行状态异常，当前不允许推进任何动作。",
    },
    {
      label: "中温最小流量",
      status: loopSnapshots[0].flowMargin <= 0.065 ? "watch" : "ok",
      detail: `中温环路流量余量 ${ratioToPercent(loopSnapshots[0].flowMargin)}，接近值班 watch 线。`,
    },
    {
      label: "低温 N+1 冗余",
      status: standbyChillers >= 1 ? "ok" : "critical",
      detail: `${chillersOnline} 开 ${standbyChillers} 备，低温环路备用机组已锁定，不允许挪作节能实验。`,
    },
    {
      label: "热回收可用性",
      status: "watch",
      detail: "热回收链路仅条件可用，当前不能把其作为动作收益兜底。",
    },
  ];

  const operatorDecision = summarizeDecision(decisionChecks, currentSegment);

  const systemMetrics = [
    {
      label: "当前负荷",
      value: `${round(currentSegment.baselineCoolingLoadMw)} MW`,
      hint: `${currentSegment.timeWindow} ${currentSegment.seasonTag} 基线段`,
    },
    {
      label: "供水温",
      value: `${round(loopSnapshots[0].supplyTempC)} C / ${round(loopSnapshots[1].supplyTempC)} C`,
      hint: "中温 / 低温环路",
    },
    {
      label: "回水温",
      value: `${round(loopSnapshots[0].returnTempC)} C / ${round(loopSnapshots[1].returnTempC)} C`,
      hint: "中温 / 低温环路",
    },
    {
      label: "总流量",
      value: `${loopSnapshots[0].flowTph + loopSnapshots[1].flowTph} tph`,
      hint: "中温 + 低温当前流量",
    },
    {
      label: "机组台数",
      value: `${chillersOnline} 开 ${standbyChillers} 备`,
      hint: "N+1 备用机组已保留",
    },
    {
      label: "EER / COP",
      value: `${round(eer, 1)} / ${round(cop, 2)}`,
      hint: `基于 ${round(currentSegment.baselinePowerMw, 2)} MW 基线功率估算`,
    },
    {
      label: "湿球条件",
      value: "14.2 C",
      hint: `基线范围 ${currentSegment.wetBulbRange}`,
    },
    {
      label: "告警摘要",
      value: `${alerts.filter((alert) => severityWeight(alert.severity) >= 2).length} 项 watch`,
      hint: "无 critical，存在人工下发 gate",
    },
  ];

  const heroChips = [
    "人工审批不可绕过",
    "N+1 冗余必须保留",
    "策略建议必须可回退",
  ];

  const heroMeta = {
    label: "值班入口结论",
    title: operatorDecision.title,
    detail: `${currentSegment.timeWindow} 时窗内当前负荷 ${round(
      currentSegment.baselineCoolingLoadMw,
    )} MW，已存在审批通过但未下发的夜间预案。`,
  };

  const baselineTimeline = baselineSegments.map((segment) => ({
    segmentId: segment.segmentId,
    label: segment.timeWindow,
    seasonTag: segment.seasonTag,
    load: `${round(segment.baselineCoolingLoadMw)} MW`,
    wetBulbRange: segment.wetBulbRange,
    active: segment.segmentId === currentSegment.segmentId,
    note: segment.notes,
  }));

  return {
    currentSegment,
    approvalTicket,
    executionRecord,
    heroChips,
    heroMeta,
    systemMetrics,
    loopSnapshots,
    alerts,
    decisionChecks,
    operatorDecision,
    baselineTimeline,
  };
}

function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (content !== undefined && content !== null) {
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
      list.append(createElement("li", "", item));
    });

    card.append(list);
    root.append(card);
  });
}

function renderHero(overviewState) {
  const chipRoot = document.querySelector("#hero-chips");
  const metaRoot = document.querySelector("#hero-meta");

  overviewState.heroChips.forEach((chip) => {
    chipRoot.append(createElement("div", "hero-chip", chip));
  });

  metaRoot.append(
    createElement("span", "", overviewState.heroMeta.label),
    createElement("strong", "", overviewState.heroMeta.title),
    createElement("p", "hero-meta-copy", overviewState.heroMeta.detail),
  );
}

function renderOverviewMetrics(overviewState) {
  const root = document.querySelector("#overview-kpis");
  overviewState.systemMetrics.forEach((metric) => {
    const card = createElement("article", "panel metric-card");
    card.append(
      createElement("p", "card-label", metric.label),
      createElement("h3", "metric-value", metric.value),
      createElement("p", "panel-copy metric-hint", metric.hint),
    );
    root.append(card);
  });
}

function renderDecisionPanel(overviewState) {
  const root = document.querySelector("#operator-decision");
  const toneClass = `decision-badge is-${overviewState.operatorDecision.tone}`;
  root.append(
    createElement("p", "card-label", "值班结论"),
    createElement("div", toneClass, overviewState.operatorDecision.badge),
    createElement("h3", "", overviewState.operatorDecision.title),
    createElement("p", "panel-copy", overviewState.operatorDecision.detail),
  );

  const list = createElement("ul", "decision-list");
  overviewState.decisionChecks.forEach((check) => {
    const item = createElement("li", "decision-item");
    item.append(
      createElement("strong", "decision-item-title", check.label),
      createElement("p", "decision-item-copy", check.detail),
    );
    list.append(item);
  });

  root.append(list);
}

function renderAlertPanel(overviewState) {
  const root = document.querySelector("#alert-summary");
  root.append(
    createElement("p", "card-label", "告警摘要"),
    createElement("h3", "", "异常提示与约束对象映射"),
  );

  const list = createElement("div", "alert-list");
  overviewState.alerts.forEach((alert) => {
    const item = createElement("article", `alert-item is-${alert.severity}`);
    item.append(
      createElement("p", "card-label", `${alert.profileId} / ${alert.metric}`),
      createElement("h3", "", alert.title),
      createElement("p", "panel-copy", alert.detail),
    );
    list.append(item);
  });

  root.append(list);
}

function renderLoopSnapshots(overviewState) {
  const root = document.querySelector("#constraint-snapshots");
  overviewState.loopSnapshots.forEach((snapshot) => {
    const card = createElement("article", `panel loop-card is-${snapshot.status}`);
    const stats = createElement("div", "loop-stats");

    [
      { label: "供水温", value: `${round(snapshot.supplyTempC)} C`, hint: snapshot.supplyBand },
      { label: "回水温", value: `${round(snapshot.returnTempC)} C`, hint: snapshot.returnBand },
      {
        label: "流量",
        value: `${snapshot.flowTph} tph`,
        hint: `最小 ${snapshot.minFlowTph} tph / 余量 ${ratioToPercent(snapshot.flowMargin)}`,
      },
    ].forEach((stat) => {
      const statCard = createElement("div", "loop-stat");
      statCard.append(
        createElement("p", "card-label", stat.label),
        createElement("strong", "loop-stat-value", stat.value),
        createElement("span", "loop-stat-hint", stat.hint),
      );
      stats.append(statCard);
    });

    card.append(
      createElement("p", "card-label", snapshot.profileId),
      createElement("h3", "", snapshot.loop),
      createElement("p", "panel-copy", snapshot.note),
      stats,
      createElement("p", "loop-footnote", snapshot.reserveNote),
    );
    root.append(card);
  });
}

function renderBaselineTimeline(overviewState) {
  const root = document.querySelector("#baseline-strip");
  root.append(
    createElement("p", "card-label", "基线窗口"),
    createElement("h3", "", "当前运行判断对应的基线段"),
  );

  const rail = createElement("div", "baseline-rail");
  overviewState.baselineTimeline.forEach((segment) => {
    const card = createElement("article", `baseline-card${segment.active ? " is-active" : ""}`);
    card.append(
      createElement("p", "card-label", `${segment.segmentId} / ${segment.seasonTag}`),
      createElement("strong", "baseline-title", `${segment.label} · ${segment.load}`),
      createElement("span", "baseline-meta", `湿球 ${segment.wetBulbRange}`),
      createElement("p", "panel-copy", segment.note),
    );
    rail.append(card);
  });

  root.append(rail);
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
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach((button) => {
    button.addEventListener("click", () => {
      const section = document.getElementById(button.dataset.target);
      if (!section) {
        return;
      }

      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        navLinks.forEach((button) => {
          button.classList.toggle("is-active", button.dataset.target === entry.target.id);
        });
      });
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: 0.15,
    },
  );

  document.querySelectorAll("[data-workspace-area]").forEach((section) => observer.observe(section));
}

const overviewState = buildOverviewState(resolvedCoreModels);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    sidebarSections,
    workspaceContent,
    buildOverviewState,
    overviewState,
  };
}

if (typeof window !== "undefined") {
  window.session3Overview = overviewState;
}

if (typeof document !== "undefined") {
  renderSidebar();
  renderHero(overviewState);
  renderOverviewMetrics(overviewState);
  renderDecisionPanel(overviewState);
  renderAlertPanel(overviewState);
  renderLoopSnapshots(overviewState);
  renderBaselineTimeline(overviewState);
  Object.keys(workspaceContent).forEach(renderWorkspaceSection);
  setupNav();
}
