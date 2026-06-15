export const BRAND_TEXT = "Doc/ReDefined";

export const INTRO_PATH_TEXT = "Understand Build Fix Artifact";

export const MODES = [
  {
    id: "understand",
    label: "Understand",
    title: "Understand",
    text: "Visual guide with simple labels and context.",
    description: "A clear explanation, visual guide, and role-based summary.",
    color: "#8b7cff",
    soft: "rgba(139, 124, 255, 0.26)",
    border: "rgba(139, 124, 255, 0.35)",
    panelText: "#ffffff",
    panelSubtext: "rgba(255, 255, 255, 0.82)",
    pulse: { x: 642, y: 250 },
    arrowLeft: "12.5%"
  },
  {
    id: "build",
    label: "Build",
    title: "Build",
    text: "Step-by-step path with checks and decisions.",
    description: "A guided implementation path with steps, checks, and decisions.",
    color: "#0099ff",
    soft: "rgba(0, 153, 255, 0.26)",
    border: "rgba(0, 153, 255, 0.35)",
    panelText: "#ffffff",
    panelSubtext: "rgba(255, 255, 255, 0.82)",
    pulse: { x: 828, y: 294 },
    arrowLeft: "37.5%"
  },
  {
    id: "fix",
    label: "Fix",
    title: "Fix",
    text: "Symptoms, causes, and next actions.",
    description: "A troubleshooting route for symptoms, causes, and next actions.",
    color: "#f5b800",
    soft: "rgba(245, 184, 0, 0.28)",
    border: "rgba(245, 184, 0, 0.38)",
    panelText: "#2f3441",
    panelSubtext: "rgba(47, 52, 65, 0.78)",
    pulse: { x: 640, y: 338 },
    arrowLeft: "62.5%"
  },
  {
    id: "artifact",
    label: "Artifact",
    title: "Artifact",
    text: "Checklist · diagram · runbook · summary.",
    description: "A practical output such as a checklist, diagram, runbook, or summary.",
    color: "#00a957",
    soft: "rgba(0, 169, 87, 0.26)",
    border: "rgba(0, 169, 87, 0.35)",
    panelText: "#ffffff",
    panelSubtext: "rgba(255, 255, 255, 0.82)",
    pulse: { x: 1015, y: 294 },
    arrowLeft: "87.5%"
  }
] as const;
