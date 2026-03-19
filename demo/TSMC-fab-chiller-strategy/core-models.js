const objectSchemas = {
  baselineSegment: {
    label: "Baseline Segment",
    fields: [
      "segmentId",
      "timeWindow",
      "seasonTag",
      "baselineCoolingLoadMw",
      "baselinePowerMw",
      "wetBulbRange",
      "constraintProfileIds",
      "notes",
    ],
  },
  constraintProfile: {
    label: "Constraint Profile",
    fields: [
      "profileId",
      "loop",
      "supplyTempMinC",
      "supplyTempMaxC",
      "returnTempMinC",
      "returnTempMaxC",
      "minFlowTph",
      "reserveMode",
      "nPlusOneRequired",
      "heatRecoveryAvailable",
      "processSideRisk",
    ],
  },
  strategyPackage: {
    label: "Strategy Package",
    fields: [
      "packageId",
      "packageName",
      "targetLoop",
      "seasonWindow",
      "loadWindowMw",
      "applicableConditions",
      "expectedRoiRange",
      "expectedKwhSavingRange",
      "riskLevel",
      "fallbackPlan",
      "constraintProfileId",
      "lifecycleState",
      "stateHistory",
    ],
  },
  approvalTicket: {
    label: "Approval Ticket",
    fields: [
      "ticketId",
      "strategyPackageId",
      "requestedBy",
      "approver",
      "riskSummary",
      "workflowState",
      "decision",
      "decisionTime",
      "approvalWindow",
      "fallbackRequirement",
      "stateHistory",
    ],
  },
  executionRecord: {
    label: "Execution Record",
    fields: [
      "executionId",
      "strategyPackageId",
      "approvalTicketId",
      "dispatchWindow",
      "operator",
      "actualActions",
      "feedback",
      "workflowState",
      "stabilizationWindow",
      "stabilizationResult",
      "rollbackFlag",
      "rollbackReason",
      "rollbackPlan",
      "stateHistory",
    ],
  },
  auditLog: {
    label: "Audit Log",
    fields: [
      "logId",
      "entityType",
      "entityId",
      "action",
      "actor",
      "beforeState",
      "afterState",
      "timestamp",
      "comment",
    ],
  },
};

const stateMachines = {
  strategyPackage: {
    label: "Strategy Package",
    states: ["candidate", "assessed", "approved", "dispatched", "stabilized", "closed", "rolled_back"],
    allowedTransitions: {
      candidate: ["assessed", "rolled_back"],
      assessed: ["approved", "rolled_back"],
      approved: ["dispatched", "rolled_back"],
      dispatched: ["stabilized", "rolled_back"],
      stabilized: ["closed", "rolled_back"],
      closed: [],
      rolled_back: [],
    },
  },
  approvalTicket: {
    label: "Approval Ticket",
    states: ["draft", "pending", "approved", "rejected", "expired", "cancelled"],
    allowedTransitions: {
      draft: ["pending", "cancelled"],
      pending: ["approved", "rejected", "expired", "cancelled"],
      approved: [],
      rejected: [],
      expired: [],
      cancelled: [],
    },
  },
  executionRecord: {
    label: "Execution Record",
    states: ["draft", "planned", "dispatched", "stabilizing", "stabilized", "closed", "rolled_back"],
    allowedTransitions: {
      draft: ["planned", "rolled_back"],
      planned: ["dispatched", "rolled_back"],
      dispatched: ["stabilizing", "rolled_back"],
      stabilizing: ["stabilized", "rolled_back"],
      stabilized: ["closed", "rolled_back"],
      closed: [],
      rolled_back: [],
    },
  },
};

const constraintProfiles = [
  {
    profileId: "CP-MEDIUM",
    loop: "中温环路",
    supplyTempMinC: 6.3,
    supplyTempMaxC: 7.4,
    returnTempMinC: 11.6,
    returnTempMaxC: 13.4,
    minFlowTph: 1680,
    reserveMode: "N+1",
    nPlusOneRequired: true,
    heatRecoveryAvailable: "standby",
    processSideRisk: "工艺侧对供水温波动敏感，禁止越过供水上限。",
  },
  {
    profileId: "CP-LOW-TEMP",
    loop: "低温环路",
    supplyTempMinC: 4.5,
    supplyTempMaxC: 5.4,
    returnTempMinC: 8.8,
    returnTempMaxC: 10.4,
    minFlowTph: 1120,
    reserveMode: "N+1",
    nPlusOneRequired: true,
    heatRecoveryAvailable: "not_applicable",
    processSideRisk: "低温环路冻结风险高，禁止牺牲最小流量。",
  },
  {
    profileId: "CP-HEAT-RECOVERY",
    loop: "热回收协同",
    supplyTempMinC: 45,
    supplyTempMaxC: 52,
    returnTempMinC: 38,
    returnTempMaxC: 46,
    minFlowTph: 320,
    reserveMode: "process_priority",
    nPlusOneRequired: false,
    heatRecoveryAvailable: "conditional",
    processSideRisk: "热回收链路可用性受工艺排程影响，必须保留旁通恢复路径。",
  },
];

const baselineSegments = [
  {
    segmentId: "SEG-DAY-HIGH",
    timeWindow: "08:00-19:00",
    seasonTag: "summer",
    baselineCoolingLoadMw: 8.8,
    baselinePowerMw: 2.34,
    wetBulbRange: "25-28C",
    constraintProfileIds: ["CP-MEDIUM", "CP-LOW-TEMP"],
    notes: "白天高负荷段，供冷连续性优先，N+1 不允许被节能建议侵占。",
  },
  {
    segmentId: "SEG-NIGHT-LOW",
    timeWindow: "22:00-04:00",
    seasonTag: "transition",
    baselineCoolingLoadMw: 5.1,
    baselinePowerMw: 1.18,
    wetBulbRange: "13-17C",
    constraintProfileIds: ["CP-MEDIUM", "CP-LOW-TEMP"],
    notes: "夜间低负荷接近最小流量边界，只允许在审批通过后进入执行预案。",
  },
  {
    segmentId: "SEG-WEEKEND-STABLE",
    timeWindow: "Weekend 09:00-18:00",
    seasonTag: "winter",
    baselineCoolingLoadMw: 4.2,
    baselinePowerMw: 0.92,
    wetBulbRange: "7-11C",
    constraintProfileIds: ["CP-MEDIUM", "CP-HEAT-RECOVERY"],
    notes: "周末稳定工况适合验证自然冷却与热回收协同，但必须保留回退旁通。",
  },
];

const strategyPackages = [
  {
    packageId: "PKG-WINTER",
    packageName: "冬季自然冷却优先",
    targetLoop: "中温环路",
    seasonWindow: "winter",
    loadWindowMw: "3.8-5.5",
    applicableConditions: "低湿球、板换可投用、供水温稳定裕量 >= 0.6C。",
    expectedRoiRange: "18-26%",
    expectedKwhSavingRange: "280-340 kWh/h",
    riskLevel: "medium_high",
    fallbackPlan: "退出板换优先，恢复机组基线台数与供水温上限，并复核热回收旁通阀位。",
    constraintProfileId: "CP-MEDIUM",
    lifecycleState: "assessed",
    stateHistory: [
      {
        from: "candidate",
        to: "assessed",
        timestamp: "2026-03-16 13:42",
        evidence: "完成适用工况、收益范围、风险等级和回退方案审查。",
      },
    ],
  },
  {
    packageId: "PKG-TRANS",
    packageName: "过渡季混合模式",
    targetLoop: "中温环路",
    seasonWindow: "transition",
    loadWindowMw: "4.8-6.3",
    applicableConditions: "湿球 < 15C，最小流量余量 > 6%，夜间窗口可审批。",
    expectedRoiRange: "9-14%",
    expectedKwhSavingRange: "120-200 kWh/h",
    riskLevel: "medium",
    fallbackPlan: "切回单机稳定模式，锁定泵频，停止频繁切换，并恢复原值班巡检频率。",
    constraintProfileId: "CP-MEDIUM",
    lifecycleState: "approved",
    stateHistory: [
      {
        from: "candidate",
        to: "assessed",
        timestamp: "2026-03-16 13:46",
        evidence: "完成夜间窗口最小流量边界复核。",
      },
      {
        from: "assessed",
        to: "approved",
        timestamp: "2026-03-16 14:05",
        evidence: "审批人确认 N+1 与回退方案满足值班要求。",
      },
    ],
  },
  {
    packageId: "PKG-SUMMER",
    packageName: "夏季高负荷机组排序优化",
    targetLoop: "中温环路",
    seasonWindow: "summer",
    loadWindowMw: "7.5-9.2",
    applicableConditions: "高负荷、必须保留 N+1、冷凝水边界稳定且不得缩短稳态观察窗口。",
    expectedRoiRange: "4-8%",
    expectedKwhSavingRange: "20-48 kWh/h",
    riskLevel: "medium_high",
    fallbackPlan: "恢复保守排序曲线，提升冷凝水控制下限，必要时立即回切基线运行。",
    constraintProfileId: "CP-MEDIUM",
    lifecycleState: "candidate",
    stateHistory: [],
  },
];

const approvalTickets = [
  {
    ticketId: "TKT-240316-01",
    strategyPackageId: "PKG-TRANS",
    requestedBy: "节能专项工程师",
    approver: "厂务机械课长",
    riskSummary: "最小流量 Watch；30 分钟内禁止重复切换；必须保留人工回退入口。",
    workflowState: "approved",
    decision: "approved",
    decisionTime: "2026-03-16 14:05",
    approvalWindow: "2026-03-16 22:00-02:00",
    fallbackRequirement: "若最小流量余量低于 6%，直接取消下发并恢复基线值班策略。",
    stateHistory: [
      {
        from: "draft",
        to: "pending",
        timestamp: "2026-03-16 13:55",
        evidence: "审批请求已提交，等待人工签核。",
      },
      {
        from: "pending",
        to: "approved",
        timestamp: "2026-03-16 14:05",
        evidence: "审批人确认风险与回退说明完整。",
      },
    ],
  },
];

const executionRecords = [
  {
    executionId: "EXE-240316-TRANS-01",
    strategyPackageId: "PKG-TRANS",
    approvalTicketId: "TKT-240316-01",
    dispatchWindow: "2026-03-16 22:00-02:00",
    operator: "夜班值班员",
    actualActions: "锁定 2+1 机组组合，预留 1 台 N+1，逐步压降泵频并保留回切确认点。",
    feedback: "执行预案已建立，等待值班口头复核后人工下发。",
    workflowState: "planned",
    stabilizationWindow: "45 min",
    stabilizationResult: "pending",
    rollbackFlag: false,
    rollbackReason: "",
    rollbackPlan: "若供水温或最小流量越界，立即回切单机稳定模式并封存本次执行记录。",
    stateHistory: [
      {
        from: "draft",
        to: "planned",
        timestamp: "2026-03-16 14:08",
        evidence: "审批通过后仅建立执行预案，尚未进入 dispatched。",
      },
    ],
  },
];

const auditLogs = [
  {
    logId: "LOG-001",
    entityType: "strategy_package",
    entityId: "PKG-WINTER",
    action: "assessed",
    actor: "优化工程师",
    beforeState: "candidate",
    afterState: "assessed",
    timestamp: "2026-03-16 13:42",
    comment: "完成 Session 2 对象模型字段检查，并补入收益、风险、回退说明。",
  },
  {
    logId: "LOG-002",
    entityType: "approval_ticket",
    entityId: "TKT-240316-01",
    action: "approved",
    actor: "厂务机械课长",
    beforeState: "pending",
    afterState: "approved",
    timestamp: "2026-03-16 14:05",
    comment: "审批通过，但要求继续保留人工下发和人工回退入口。",
  },
  {
    logId: "LOG-003",
    entityType: "execution_record",
    entityId: "EXE-240316-TRANS-01",
    action: "planned",
    actor: "值班长占位",
    beforeState: "draft",
    afterState: "planned",
    timestamp: "2026-03-16 14:08",
    comment: "执行记录已建立，但审批和边界复核外不得提前进入 dispatched。",
  },
];

function validateRequiredFields(schemaKey, entity) {
  const schema = objectSchemas[schemaKey];
  const missingFields = schema.fields.filter((field) => entity[field] === undefined || entity[field] === null);
  return {
    name: `${schema.label} 字段完整性`,
    status: missingFields.length === 0 ? "passed" : "failed",
    detail:
      missingFields.length === 0
        ? `${entity[schema.fields[0]]} 已覆盖 ${schema.fields.length} 个必填字段。`
        : `${entity[schema.fields[0]]} 缺少字段: ${missingFields.join(", ")}。`,
  };
}

function validateStateHistory(machine, entityId, stateHistory, workflowState) {
  if (!machine.states.includes(workflowState)) {
    return {
      name: `${machine.label} 状态流转`,
      status: "failed",
      detail: `${entityId} 当前状态 ${workflowState} 不在允许状态集合内。`,
    };
  }

  const invalidStep = stateHistory.find((item) => {
    const allowedTransitions = machine.allowedTransitions[item.from] || [];
    return !allowedTransitions.includes(item.to);
  });

  if (invalidStep) {
    return {
      name: `${machine.label} 状态流转`,
      status: "failed",
      detail: `${entityId} 出现非法迁移 ${invalidStep.from} -> ${invalidStep.to}。`,
    };
  }

  const terminalState = stateHistory.length > 0 ? stateHistory[stateHistory.length - 1].to : workflowState;
  if (terminalState !== workflowState) {
    return {
      name: `${machine.label} 状态流转`,
      status: "failed",
      detail: `${entityId} 当前状态 ${workflowState} 与历史终点 ${terminalState} 不一致。`,
    };
  }

  const nextStates = machine.allowedTransitions[workflowState] || [];
  return {
    name: `${machine.label} 状态流转`,
    status: "passed",
    detail: `${entityId} 当前停留在 ${workflowState}，下一步允许 ${nextStates.length > 0 ? nextStates.join(" / ") : "终态封存"}。`,
  };
}

function validateConstraintProfile(profile) {
  const hasTempRange =
    profile.supplyTempMinC < profile.supplyTempMaxC && profile.returnTempMinC < profile.returnTempMaxC;
  const hasMinFlow = profile.minFlowTph > 0;
  const hasReserveRule = typeof profile.nPlusOneRequired === "boolean" && Boolean(profile.reserveMode);
  const hasHeatRecoveryRule = Boolean(profile.heatRecoveryAvailable);
  const isValid = hasTempRange && hasMinFlow && hasReserveRule && hasHeatRecoveryRule;

  return {
    name: `${profile.profileId} 边界覆盖`,
    status: isValid ? "passed" : "failed",
    detail: isValid
      ? `${profile.loop} 已覆盖供回水温、最小流量、N+1/备用模式和热回收可用性边界。`
      : `${profile.loop} 的边界字段不完整。`,
  };
}

function validateBaselineSegment(segment, knownProfiles) {
  const unknownProfiles = segment.constraintProfileIds.filter((profileId) => !knownProfiles.has(profileId));
  return {
    name: `${segment.segmentId} 约束映射`,
    status: unknownProfiles.length === 0 ? "passed" : "failed",
    detail:
      unknownProfiles.length === 0
        ? `${segment.segmentId} 已映射 ${segment.constraintProfileIds.join(", ")}。`
        : `${segment.segmentId} 存在未定义约束: ${unknownProfiles.join(", ")}。`,
  };
}

function validateStrategyPackage(pkg, profilesById) {
  const profile = profilesById[pkg.constraintProfileId];
  const hasFallback = typeof pkg.fallbackPlan === "string" && pkg.fallbackPlan.length > 0;
  const isValid = Boolean(profile) && hasFallback;
  return {
    name: `${pkg.packageId} 约束绑定`,
    status: isValid ? "passed" : "failed",
    detail: isValid
      ? `${pkg.packageId} 绑定 ${profile.profileId}，并保留人工回退说明。`
      : `${pkg.packageId} 缺少约束档案或回退说明。`,
  };
}

function validateApprovalExecutionGate(ticket, execution) {
  const approvalAllowsPlanning = ticket.workflowState === "approved" && execution.workflowState === "planned";
  return {
    name: "审批/执行 Gate",
    status: approvalAllowsPlanning ? "passed" : "failed",
    detail: approvalAllowsPlanning
      ? "审批已通过，执行记录只停留在 planned，未越级进入 dispatched。"
      : "审批与执行状态冲突：审批未完成前不得进入执行下发阶段。",
  };
}

function validateStrategyExecutionBinding(pkg, execution) {
  const dispatchableStates = ["approved", "dispatched", "stabilized", "closed"];
  const isValid = dispatchableStates.includes(pkg.lifecycleState) && execution.strategyPackageId === pkg.packageId;
  return {
    name: "策略/执行绑定",
    status: isValid ? "passed" : "failed",
    detail: isValid
      ? `${execution.executionId} 仅绑定到已审批策略 ${pkg.packageId}。`
      : `${execution.executionId} 未绑定已审批策略，存在越级执行风险。`,
  };
}

const knownProfiles = new Set(constraintProfiles.map((profile) => profile.profileId));
const profilesById = Object.fromEntries(constraintProfiles.map((profile) => [profile.profileId, profile]));

const fieldCompletenessChecks = [
  ...baselineSegments.map((segment) => validateRequiredFields("baselineSegment", segment)),
  ...constraintProfiles.map((profile) => validateRequiredFields("constraintProfile", profile)),
  ...strategyPackages.map((pkg) => validateRequiredFields("strategyPackage", pkg)),
  ...approvalTickets.map((ticket) => validateRequiredFields("approvalTicket", ticket)),
  ...executionRecords.map((record) => validateRequiredFields("executionRecord", record)),
  ...auditLogs.map((log) => validateRequiredFields("auditLog", log)),
];

const boundaryChecks = [
  ...constraintProfiles.map(validateConstraintProfile),
  ...baselineSegments.map((segment) => validateBaselineSegment(segment, knownProfiles)),
  ...strategyPackages.map((pkg) => validateStrategyPackage(pkg, profilesById)),
];

const stateTransitionChecks = [
  ...strategyPackages.map((pkg) =>
    validateStateHistory(stateMachines.strategyPackage, pkg.packageId, pkg.stateHistory, pkg.lifecycleState),
  ),
  ...approvalTickets.map((ticket) =>
    validateStateHistory(stateMachines.approvalTicket, ticket.ticketId, ticket.stateHistory, ticket.workflowState),
  ),
  ...executionRecords.map((record) =>
    validateStateHistory(stateMachines.executionRecord, record.executionId, record.stateHistory, record.workflowState),
  ),
  validateApprovalExecutionGate(approvalTickets[0], executionRecords[0]),
  validateStrategyExecutionBinding(strategyPackages[1], executionRecords[0]),
];

const gateChecks = [...fieldCompletenessChecks, ...boundaryChecks, ...stateTransitionChecks];

const sessionGate = {
  session: 2,
  status: gateChecks.every((check) => check.status === "passed") ? "passed" : "failed",
  requiredCoverage: ["供回水温", "最小流量", "N+1", "热回收可用性"],
};

const coreModels = {
  session: 2,
  objectSchemas,
  stateMachines,
  baselineSegments,
  constraintProfiles,
  strategyPackages,
  approvalTickets,
  executionRecords,
  auditLogs,
  gateChecks,
  sessionGate,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = coreModels;
}

if (typeof window !== "undefined") {
  window.coreModels = coreModels;
}
