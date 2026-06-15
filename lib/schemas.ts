import { z } from "zod";

const ClassificationSourceSchema = z.enum(["rules", "ai", "fallback", "manual", "simulated-ai"]);
const ConfidenceSchema = z.enum(["low", "medium", "high"]);
const PrioritySchema = z.enum(["low", "medium", "high"]);
const NodeStatusSchema = z.enum([
  "neutral",
  "unknown",
  "checking",
  "healthy",
  "warning",
  "failed"
]);
const NodeTypeSchema = z.enum([
  "user",
  "service",
  "app",
  "gateway",
  "database",
  "network",
  "identity",
  "security",
  "check",
  "output",
  "unknown"
]);
const CategorySchema = z.enum(["dns", "network", "auth", "config", "service", "generic"]);
const CausalGraphNodeKindSchema = z.enum([
  "source",
  "dependency",
  "failure",
  "target",
  "result"
]);
const CausalGraphNodeStatusSchema = z.enum([
  "neutral",
  "checking",
  "passing",
  "failing",
  "unknown"
]);
const CausalGraphEdgeKindSchema = z.enum(["request", "dependency", "blocks", "causes"]);
const CausalGraphBranchToneSchema = z.enum(["green", "blue", "purple", "neutral"]);

export const ClassificationResultSchema = z.object({
  mode: z.enum(["understand", "build", "fix", "artifact"]),
  confidence: z.number().min(0).max(1),
  source: ClassificationSourceSchema,
  reason: z.string(),
  topic: z.string()
});

export const DiagnosisSchema = z.object({
  title: z.string(),
  answer: z.string(),
  confidence: ConfidenceSchema,
  why: z.array(z.string()),
  likelyCauses: z.array(
    z.object({
      label: z.string(),
      reason: z.string(),
      priority: PrioritySchema
    })
  )
});

export const IssueMapSchema = z.object({
  title: z.string(),
  summary: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: NodeTypeSchema,
      detail: z.string().optional(),
      risk: PrioritySchema.optional(),
      status: NodeStatusSchema.optional(),
      reason: z.string().optional(),
      check: z.string().optional()
    })
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().optional(),
      status: NodeStatusSchema.optional()
    })
  ),
  likelyFailureZones: z.array(z.string())
});

export const QuickTestSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string(),
  commands: z.array(z.string()),
  successSignal: z.string(),
  failureMeaning: z.string(),
  category: CategorySchema.optional()
});

export const DecisionPathItemSchema = z.object({
  id: z.string(),
  condition: z.string(),
  meaning: z.string(),
  nextAction: z.string()
});

export const FailureBranchSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  signals: z.array(z.string()),
  checks: z.array(z.string()),
  priority: PrioritySchema
});

export const CausalGraphSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  confidence: ConfidenceSchema,
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      subtitle: z.string().optional(),
      kind: CausalGraphNodeKindSchema,
      status: CausalGraphNodeStatusSchema,
      x: z.number().optional(),
      y: z.number().optional()
    })
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().optional(),
      kind: CausalGraphEdgeKindSchema.optional()
    })
  ),
  branches: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      nodeIds: z.array(z.string()),
      tone: CausalGraphBranchToneSchema
    })
  ).optional(),
  simulationSteps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      activeNodeIds: z.array(z.string()),
      failingNodeIds: z.array(z.string()).optional(),
      passingNodeIds: z.array(z.string()).optional(),
      branchId: z.string().optional()
    })
  )
});

export const PathUpdateSchema = z.object({
  status: z.enum(["initial", "narrowed", "resolved", "needs_more_evidence"]),
  title: z.string(),
  description: z.string(),
  nextBestAction: z.object({
    title: z.string(),
    description: z.string(),
    commands: z.array(z.string()).optional()
  })
});

export const ScratchpadVariableSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  source: z.enum(["prompt", "ai", "evidence", "user"])
});

export const TimelineEntrySchema = z.object({
  id: z.string(),
  type: z.enum([
    "initial_diagnosis",
    "evidence_received",
    "path_recalibrated",
    "next_action",
    "artifact_created",
    "resolved"
  ]),
  title: z.string(),
  summary: z.string(),
  timestampLabel: z.string()
});

export const EvidenceSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: z.enum(["info", "success", "warning", "critical"]),
  matchedText: z.string(),
  meaning: z.string(),
  affectedNodeId: z.string().optional(),
  affectedBranchId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export const EvidenceBranchSchema = z.object({
  id: z.string(),
  title: z.string(),
  branchType: z.enum(["rbac", "network", "token", "identity", "configuration", "unknown"]),
  status: z.enum(["active", "new", "confirmed", "dismissed"]),
  confidence: z.number().min(0),
  evidenceScore: z.number().optional(),
  summary: z.string(),
  explanation: z.object({
    meaning: z.string(),
    whyThisBranch: z.string(),
    likelyRootCause: z.string()
  }).optional(),
  cliSteps: z.array(
    z.object({
      label: z.string(),
      command: z.string(),
      expected: z.string().optional()
    })
  ).optional(),
  fixSteps: z.array(z.string()).optional(),
  followUpQuestions: z.array(z.string()).optional(),
  evidenceExcerpt: z.string(),
  preview: z.string().optional(),
  signals: z.array(EvidenceSignalSchema),
  nextAction: z.string(),
  createdAt: z.string()
});

export const EnvironmentComparisonSchema = z.object({
  leftLabel: z.string(),
  rightLabel: z.string(),
  rows: z.array(
    z.object({
      field: z.string(),
      leftValue: z.string(),
      rightValue: z.string(),
      status: z.enum(["match", "mismatch", "unknown"]),
      impact: z.string().optional()
    })
  )
});

export const DiagnosticTerminalSchema = z.object({
  title: z.string(),
  shell: z.enum(["powershell", "bash", "sql", "generic"]),
  commands: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      command: z.string(),
      category: CategorySchema.optional()
    })
  ),
  notes: z.array(z.string()).optional()
});

export const ArtifactActionSchema = z.object({
  type: z.enum(["ticket_update", "runbook", "save_journey", "share", "checklist", "summary"]),
  label: z.string()
});

const ResultSectionSchema = z.union([
  z.object({
    type: z.literal("checklist"),
    title: z.string(),
    items: z.array(z.string())
  }),
  z.object({
    type: z.enum(["diagnostic_step", "implementation_step", "explanation"]),
    title: z.string(),
    description: z.string()
  })
]);

export const FixWorkspaceResultSchema = z.object({
  id: z.string(),
  mode: z.literal("fix"),
  originalPrompt: z.string(),
  title: z.string(),
  summary: z.string(),
  classification: ClassificationResultSchema,
  diagnosis: DiagnosisSchema,
  issueMap: IssueMapSchema,
  quickTests: z.array(QuickTestSchema),
  failureBranches: z.array(FailureBranchSchema).optional(),
  causalGraph: CausalGraphSchema.optional(),
  decisionPath: z.array(DecisionPathItemSchema),
  pathUpdate: PathUpdateSchema,
  scratchpad: z.array(ScratchpadVariableSchema),
  timeline: z.array(TimelineEntrySchema),
  diagnosticTerminal: DiagnosticTerminalSchema,
  environmentComparison: EnvironmentComparisonSchema.optional(),
  evidenceBranches: z.array(EvidenceBranchSchema).optional(),
  activeEvidenceBranchId: z.string().optional(),
  artifacts: z.array(ArtifactActionSchema),
  visualFlow: z.array(z.string()).default([]),
  sections: z.array(ResultSectionSchema).default([]),
  actions: z.array(z.object({ label: z.string(), action: z.string() })).default([])
});

export const FollowUpResultSchema = z.object({
  id: z.string(),
  parentResultId: z.string(),
  userMessage: z.string(),
  signals: z.array(EvidenceSignalSchema),
  scratchpadUpdates: z.array(ScratchpadVariableSchema),
  updatedDiagnosis: DiagnosisSchema.extend({
    status: PathUpdateSchema.shape.status
  }),
  issueMapUpdates: z.array(
    z.object({
      nodeId: z.string(),
      status: NodeStatusSchema,
      reason: z.string()
    })
  ),
  nextBestAction: PathUpdateSchema.shape.nextBestAction,
  timelineEntries: z.array(TimelineEntrySchema),
  activeEvidenceBranch: EvidenceBranchSchema.optional(),
  updatedEvidenceBranches: z.array(EvidenceBranchSchema).optional(),
  pathUpdate: PathUpdateSchema.optional(),
  diagnosticTerminal: DiagnosticTerminalSchema.optional(),
  environmentComparison: EnvironmentComparisonSchema.optional(),
  shouldPromoteDiagnosis: z.boolean().optional().default(false),
  resolved: z.boolean().optional().default(false)
});

const UnderstandMentalModelStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional()
});

const UnderstandBuildingBlockSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  blockType: z.enum(["principle", "component", "mechanism", "term", "pattern", "output", "result", "process", "concept", "constraint", "risk", "input"]).optional(),
  confidence: z.number().min(0).max(100).optional()
});

const UnderstandMisconceptionSchema = z.object({
  id: z.string(),
  misconception: z.string(),
  reality: z.string()
});

const UnderstandNextActionSchema = z.object({
  label: z.string(),
  targetMode: z.enum(["understand", "build", "fix", "artifact"]),
  prompt: z.string()
});

const UnderstandUserLevelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  selected: z.boolean().optional()
});

const UnderstandAnalogySchema = z.object({
  id: z.string(),
  label: z.string(),
  analogyTitle: z.string(),
  explanation: z.string(),
  keyTakeaway: z.string(),
  isDefault: z.boolean().optional()
});

const UnderstandThinkingSparkSchema = z.object({
  id: z.string(),
  type: z.enum(["challenge", "scenario", "what_if", "compare"]),
  prompt: z.string(),
  targetPrompt: z.string()
});

const UnderstandBlindSpotSchema = z.object({
  title: z.string(),
  description: z.string(),
  whyItMatters: z.string(),
  revealPrompt: z.string().optional()
});

const UnderstandConfidenceItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(100),
  reason: z.string().optional(),
  suggestedAction: z.string().optional()
});

const UnderstandResultGuideSchema = z.object({
  sectionExplanations: z.array(z.object({ section: z.string(), explanation: z.string() })),
  differentiation: z.object({ title: z.string(), description: z.string() }),
  promptDepth: z.object({ level: z.enum(["shallow", "moderate", "deep"]), suggestion: z.string() }),
  refinementOptions: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() }))
});

export const UnderstandWorkspaceResultSchema = z.object({
  id: z.string(),
  mode: z.literal("understand"),
  originalPrompt: z.string(),
  title: z.string(),
  summary: z.string(),
  domain: z.string(),
  classification: ClassificationResultSchema,
  clarity: z.object({
    level: z.enum(["high", "medium", "low"]),
    score: z.number().min(0).max(100).optional()
  }),
  mentalModel: z.object({
    title: z.string(),
    steps: z.array(UnderstandMentalModelStepSchema).min(1)
  }),
  coreBuildingBlocks: z.array(UnderstandBuildingBlockSchema).min(1),
  misconceptions: z.array(UnderstandMisconceptionSchema),
  realWorldExample: z.object({
    title: z.string(),
    scenario: z.string(),
    explanation: z.string()
  }),
  decisionQuestions: z.array(z.string()),
  nextActions: z.array(UnderstandNextActionSchema),
  userLevelCheck: z.object({
    question: z.string(),
    options: z.array(UnderstandUserLevelOptionSchema)
  }).optional(),
  analogySwitcher: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    analogies: z.array(UnderstandAnalogySchema)
  }).optional(),
  thinkingSparks: z.array(UnderstandThinkingSparkSchema).optional(),
  blindSpot: UnderstandBlindSpotSchema.optional(),
  conceptConfidenceMap: z.object({
    title: z.string(),
    items: z.array(UnderstandConfidenceItemSchema),
    lowestConfidenceAction: z.object({ label: z.string(), prompt: z.string() }).optional()
  }).optional(),
  teachBack: z.object({
    challenge: z.string(),
    placeholder: z.string(),
    expertVersion: z.string().optional()
  }).optional(),
  shareableInsight: z.object({
    title: z.string(),
    insight: z.string(),
    supportingLine: z.string().optional(),
    tags: z.array(z.string()),
    actions: z.array(z.object({
      label: z.string(),
      type: z.enum(["copy", "notion", "linkedin", "save", "post"])
    }))
  }).optional(),
  resultGuide: UnderstandResultGuideSchema.optional(),
  visualFlow: z.array(z.string()).default([]),
  sections: z.array(ResultSectionSchema).default([]),
  actions: z.array(z.object({ label: z.string(), action: z.string() })).default([])
});

const BuildNextActionSchema = z.object({
  label: z.string(),
  targetMode: z.enum(["build", "artifact", "understand", "fix"]),
  prompt: z.string()
});

export const BuildWorkspaceResultSchema = z.object({
  id: z.string(),
  mode: z.literal("build"),
  originalPrompt: z.string(),
  title: z.string(),
  summary: z.string(),
  domain: z.string(),
  workspaceType: z.string().default("business_plan_builder"),
  classification: ClassificationResultSchema,
  requiredInputs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      whyNeeded: z.string(),
      placeholder: z.string().optional(),
      status: z.enum(["missing", "provided", "assumed"]).optional()
    })
  ),
  buildFlow: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string()
    })
  ),
  draftingSteps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      outputHint: z.string()
    })
  ),
  sectionBlueprint: z.array(
    z.object({
      id: z.string(),
      sectionName: z.string(),
      purpose: z.string(),
      keyQuestions: z.array(z.string()),
      outputExpected: z.string().optional()
    })
  ),
  qualityChecklist: z.array(
    z.object({
      id: z.string(),
      item: z.string(),
      reason: z.string(),
      status: z.enum(["pending", "passed", "needs_work"]).optional()
    })
  ),
  buildNextActions: z.array(BuildNextActionSchema),
  visualFlow: z.array(z.string()).default([]),
  sections: z.array(ResultSectionSchema).default([]),
  actions: z.array(z.object({ label: z.string(), action: z.string() })).default([])
});

const ArtifactFormatSchema = z.enum(["markdown", "document", "email", "ticket", "checklist", "code"]);
const ArtifactWorkspaceTypeSchema = z.enum([
  "business_plan_artifact",
  "runbook_artifact",
  "ticket_update",
  "implementation_plan",
  "checklist",
  "summary",
  "generic_artifact"
]);

export const ArtifactWorkspaceResultSchema = z.object({
  id: z.string(),
  mode: z.literal("artifact"),
  originalPrompt: z.string(),
  title: z.string(),
  summary: z.string(),
  domain: z.string().default("general"),
  workspaceType: ArtifactWorkspaceTypeSchema.default("generic_artifact"),
  classification: ClassificationResultSchema,
  sourceContext: z.object({
    sourceMode: z.enum(["understand", "build", "fix", "artifact"]).optional(),
    sourceTitle: z.string().optional(),
    keyInputs: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional(),
    evidence: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional()
  }).optional(),
  missingDetails: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      whyNeeded: z.string(),
      placeholder: z.string().optional(),
      status: z.enum(["missing", "provided", "assumed"])
    })
  ).optional(),
  outline: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      purpose: z.string()
    })
  ),
  artifactPreview: z.object({
    format: ArtifactFormatSchema,
    title: z.string(),
    body: z.string()
  }),
  formatOptions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      targetFormat: ArtifactFormatSchema
    })
  ),
  exportActions: z.array(
    z.object({
      label: z.string(),
      action: z.enum(["copy", "download", "save", "share", "regenerate"])
    })
  ),
  visualFlow: z.array(z.string()).default([]),
  sections: z.array(ResultSectionSchema).default([]),
  actions: z.array(z.object({ label: z.string(), action: z.string() })).default([])
});

export const FollowUpAIResponseSchema = z.object({
  activeEvidenceBranch: z.unknown().optional(),
  updatedEvidenceBranches: z.array(z.unknown()).optional(),
  pathUpdate: z.unknown().optional(),
  diagnosticTerminal: z.unknown().optional(),
  timelineEntries: z.array(z.unknown()).optional(),
  shouldPromoteDiagnosis: z.boolean().optional(),
  updatedDiagnosis: z.unknown().optional()
}).passthrough();
