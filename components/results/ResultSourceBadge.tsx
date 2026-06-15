export type ResultSource = "ai" | "fallback" | "local" | "repaired";

type ResultSourceBadgeProps = {
  source: ResultSource;
  context?: "initial" | "follow-up";
};

const initialLabels: Record<ResultSource, { label: string; subtext: string }> = {
  ai: {
    label: "Doc/ReDefined OS",
    subtext: "Validated structured path"
  },
  fallback: {
    label: "Doc/ReDefined OS · Local mode",
    subtext: "Structured fallback path generated"
  },
  local: {
    label: "Doc/ReDefined OS · Local mode",
    subtext: "Structured fallback path generated"
  },
  repaired: {
    label: "Doc/ReDefined OS · Repaired",
    subtext: "Structured path corrected before rendering"
  }
};

const followUpLabels: Record<ResultSource, { label: string; subtext: string }> = {
  ai: {
    label: "Doc/ReDefined OS",
    subtext: "Path updated from evidence"
  },
  fallback: {
    label: "Doc/ReDefined OS · Local mode",
    subtext: "Evidence processed locally"
  },
  local: {
    label: "Doc/ReDefined OS · Local mode",
    subtext: "Evidence processed locally"
  },
  repaired: {
    label: "Doc/ReDefined OS · Repaired",
    subtext: "Structured path corrected before rendering"
  }
};

export function ResultSourceBadge({
  source,
  context = "initial"
}: ResultSourceBadgeProps) {
  const content = context === "follow-up" ? followUpLabels[source] : initialLabels[source];

  return (
    <div className="result-source-badge" aria-label={`${content.label}. ${content.subtext}`}>
      <span>{content.label}</span>
      <small>{content.subtext}</small>
    </div>
  );
}
