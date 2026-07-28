"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAccount, type GateResult } from "@/lib/account-store";
import { formatLimit, getPlan, type Plan, type PlanId } from "@/lib/plans";

function planBenefits(plan: Plan): string {
  const parts: string[] = [`${formatLimit(plan.limits.promptRunsPerMonth)} prompt runs/mo`];
  if (plan.features.pdfExport || plan.features.docxExport) parts.push("PDF/DOCX export");
  if (plan.features.customTemplates) parts.push("advanced templates");
  if (plan.features.sharedProjects) parts.push("shared team projects");
  if (plan.features.sso) parts.push("SSO");
  return parts.join(" · ");
}

const UPGRADE_EVENT = "billing:open-upgrade";

export type UpgradePromptDetail = {
  title: string;
  message: string;
  used?: number;
  limit?: number | "custom";
  currentPlanId?: PlanId;
  upgradePlanId?: PlanId;
};

/** Module-level trigger — callable from any client component when a gate blocks. */
export function showUpgrade(detail: UpgradePromptDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UPGRADE_EVENT, { detail }));
}

/** Convenience: turn a blocked GateResult into an upgrade prompt. */
export function promptUpgrade(title: string, gate: GateResult, currentPlanId: PlanId) {
  showUpgrade({
    title,
    message: gate.reason ?? "",
    used: gate.used,
    limit: gate.limit,
    currentPlanId,
    upgradePlanId: gate.upgradePlanId
  });
}

export function UpgradeModalHost() {
  const router = useRouter();
  const [detail, setDetail] = useState<UpgradePromptDetail | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<UpgradePromptDetail>).detail;
      if (next?.title) setDetail(next);
    };
    window.addEventListener(UPGRADE_EVENT, onOpen);
    return () => window.removeEventListener(UPGRADE_EVENT, onOpen);
  }, []);

  if (!detail) return null;

  const currentPlanId = detail.currentPlanId ?? getAccount().currentPlanId;
  const currentPlan = getPlan(currentPlanId);
  const upgradePlan = detail.upgradePlanId ? getPlan(detail.upgradePlanId) : null;

  const close = () => setDetail(null);

  return (
    <div className="upgrade-overlay" role="dialog" aria-modal="true" aria-label="Upgrade required">
      <div className="upgrade-modal">
        <button type="button" className="upgrade-close" aria-label="Close" onClick={close}>
          ✕
        </button>

        <div className="upgrade-head">
          <span className="upgrade-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
          </span>
          <div>
            <p className="upgrade-eyebrow">Plan limit</p>
            <h2>{detail.title}</h2>
          </div>
        </div>

        <p className="upgrade-message">{detail.message}</p>

        <div className="upgrade-meta">
          <div className="upgrade-meta-row">
            <span>Current plan</span>
            <strong>{currentPlan.name}</strong>
          </div>
          {typeof detail.used === "number" && detail.limit !== undefined ? (
            <div className="upgrade-meta-row">
              <span>Used</span>
              <strong className="upgrade-used-chip">
                {detail.used} / {detail.limit === "custom" ? "Custom" : detail.limit}
              </strong>
            </div>
          ) : null}
          {upgradePlan ? (
            <div className="upgrade-meta-row upgrade-meta-rec">
              <span>Recommended</span>
              <strong>
                {upgradePlan.name}
                {upgradePlan.priceMonthly != null ? ` · ${upgradePlan.priceLabel}/mo` : ""}
              </strong>
            </div>
          ) : null}
        </div>

        {upgradePlan ? (
          <p className="upgrade-benefit">
            You&apos;re using Doc/ReDefined regularly. {upgradePlan.name} adds {planBenefits(upgradePlan)}.
          </p>
        ) : null}

        <div className="upgrade-actions">
          <button type="button" className="upgrade-later" onClick={close}>
            Maybe later
          </button>
          <button
            type="button"
            className="upgrade-cta"
            onClick={() => {
              close();
              router.push("/pricing");
            }}
          >
            {upgradePlan ? `Upgrade to ${upgradePlan.name}` : "See plans"}
          </button>
        </div>
      </div>
    </div>
  );
}
