export type PlanId = "free" | "starter" | "pro" | "team" | "enterprise";

/** A numeric cap, or "custom" for negotiated Enterprise limits. */
export type PlanLimitValue = number | "custom";

export type PlanLimitKey =
  | "workspaces"
  | "projects"
  | "promptRunsPerMonth"
  | "artifactsPerMonth"
  | "audioGuidesPerMonth"
  | "exportsPerMonth"
  | "teamMembers";

export type PlanLimits = Record<PlanLimitKey, PlanLimitValue>;

/** Boolean capabilities checked by `canUseFeature`. */
export type BooleanFeature =
  | "markdownExport"
  | "jsonExport"
  | "pdfExport"
  | "docxExport"
  | "customTemplates"
  | "sharedProjects"
  | "sharedArtifactLibrary"
  | "adminControls"
  | "bringYourOwnModel"
  | "azureOpenAI"
  | "sso"
  | "auditLogs"
  | "dataRetentionControls"
  | "customBranding"
  | "privateDeployment";

export type PlanFeatures = Record<BooleanFeature, boolean> & {
  templates: "basic" | "advanced" | "team" | "custom";
  workspaceExport: "limited" | "full";
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  description: string;
  priceMonthly: number | null;
  priceLabel: string;
  isPublic: boolean;
  isContactSales: boolean;
  highlight?: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
};

const NO_BOOLEAN_FEATURES: Record<BooleanFeature, boolean> = {
  markdownExport: true,
  jsonExport: false,
  pdfExport: false,
  docxExport: false,
  customTemplates: false,
  sharedProjects: false,
  sharedArtifactLibrary: false,
  adminControls: false,
  bringYourOwnModel: false,
  azureOpenAI: false,
  sso: false,
  auditLogs: false,
  dataRetentionControls: false,
  customBranding: false,
  privateDeployment: false
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "team", "enterprise"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try Doc/ReDefined",
    description: "For exploring workspaces, artifacts, and exports.",
    priceMonthly: 0,
    priceLabel: "€0",
    isPublic: true,
    isContactSales: false,
    // Free is for product testing only — limits kept low to protect API cost.
    limits: {
      workspaces: 3,
      projects: 1,
      promptRunsPerMonth: 15,
      artifactsPerMonth: 3,
      audioGuidesPerMonth: 1,
      exportsPerMonth: 3,
      teamMembers: 1
    },
    features: {
      ...NO_BOOLEAN_FEATURES,
      templates: "basic",
      workspaceExport: "limited"
    }
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For individual professionals",
    description:
      "For cloud engineers, IT professionals, freelancers, students, and creators who need structured workspaces, artifacts, and exports.",
    priceMonthly: 15,
    priceLabel: "€15",
    isPublic: true,
    isContactSales: false,
    // Target economics (internal — not shown in UI):
    //   price: €15/month
    //   target AI/API + infra cost: €2–€4/user/month
    //   desired gross margin: 70%+
    // Limits are cost-controlled because Starter is expected to be the most
    // common paid plan; heavy users are steered to Pro.
    limits: {
      workspaces: 25,
      projects: 5,
      promptRunsPerMonth: 100,
      artifactsPerMonth: 25,
      audioGuidesPerMonth: 5,
      exportsPerMonth: 25,
      teamMembers: 1
    },
    features: {
      ...NO_BOOLEAN_FEATURES,
      jsonExport: true,
      templates: "basic",
      workspaceExport: "full"
    }
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For serious builders",
    description: "For consultants, architects, creators, and technical writers.",
    priceMonthly: 39,
    priceLabel: "€39",
    isPublic: true,
    isContactSales: false,
    highlight: true,
    limits: {
      workspaces: 250,
      projects: 50,
      promptRunsPerMonth: 1000,
      artifactsPerMonth: 500,
      audioGuidesPerMonth: 50,
      exportsPerMonth: 500,
      teamMembers: 1
    },
    features: {
      ...NO_BOOLEAN_FEATURES,
      jsonExport: true,
      pdfExport: true,
      docxExport: true,
      customTemplates: true,
      templates: "advanced",
      workspaceExport: "full"
    }
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "For small teams",
    description: "For shared projects, documentation workflows, and team libraries.",
    priceMonthly: 149,
    priceLabel: "€149",
    isPublic: true,
    isContactSales: false,
    limits: {
      workspaces: 1000,
      projects: 250,
      promptRunsPerMonth: 5000,
      artifactsPerMonth: 2000,
      audioGuidesPerMonth: 200,
      exportsPerMonth: 2000,
      teamMembers: 5
    },
    features: {
      ...NO_BOOLEAN_FEATURES,
      jsonExport: true,
      pdfExport: true,
      docxExport: true,
      customTemplates: true,
      sharedProjects: true,
      sharedArtifactLibrary: true,
      adminControls: true,
      customBranding: true,
      templates: "team",
      workspaceExport: "full"
    }
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For organizations",
    description: "For SSO, private AI, governance, and custom templates.",
    priceMonthly: null,
    priceLabel: "Custom",
    isPublic: true,
    isContactSales: true,
    limits: {
      workspaces: "custom",
      projects: "custom",
      promptRunsPerMonth: "custom",
      artifactsPerMonth: "custom",
      audioGuidesPerMonth: "custom",
      exportsPerMonth: "custom",
      teamMembers: "custom"
    },
    features: {
      markdownExport: true,
      jsonExport: true,
      pdfExport: true,
      docxExport: true,
      customTemplates: true,
      sharedProjects: true,
      sharedArtifactLibrary: true,
      adminControls: true,
      bringYourOwnModel: true,
      azureOpenAI: true,
      sso: true,
      auditLogs: true,
      dataRetentionControls: true,
      customBranding: true,
      privateDeployment: true,
      templates: "custom",
      workspaceExport: "full"
    }
  }
};

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] ?? PLANS.free;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_ORDER.includes(value as PlanId);
}

export function planRank(planId: PlanId): number {
  return PLAN_ORDER.indexOf(planId);
}

export function publicPlans(): Plan[] {
  return PLAN_ORDER.map((id) => PLANS[id]).filter((plan) => plan.isPublic);
}

/** Human label for a limit value, e.g. 20 or "Custom" / "Unlimited". */
export function formatLimit(value: PlanLimitValue): string {
  if (value === "custom") return "Custom";
  return value.toLocaleString();
}

/** The cheapest plan whose numeric limit exceeds the current plan's limit. */
export function upgradeForLimit(currentPlanId: PlanId, key: PlanLimitKey): PlanId | undefined {
  const current = getPlan(currentPlanId).limits[key];
  const currentValue = current === "custom" ? Infinity : current;
  for (const id of PLAN_ORDER) {
    if (planRank(id) <= planRank(currentPlanId)) continue;
    const value = getPlan(id).limits[key];
    if (value === "custom" || value > currentValue) return id;
  }
  return undefined;
}

/** The cheapest plan that enables a boolean feature. */
export function upgradeForFeature(feature: BooleanFeature): PlanId | undefined {
  return PLAN_ORDER.find((id) => getPlan(id).features[feature]);
}
