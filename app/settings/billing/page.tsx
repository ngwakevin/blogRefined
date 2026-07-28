"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { showToast } from "@/components/Toast";
import { useProfile } from "@/components/profile/useProfile";
import {
  getAccount,
  setPlan,
  type Account
} from "@/lib/account-store";
import { getDashboardRecords } from "@/lib/dashboard-store";
import { getProjects } from "@/lib/journey-store";
import {
  formatLimit,
  getPlan,
  isPlanId,
  PLAN_ORDER,
  type PlanId,
  type PlanLimitValue
} from "@/lib/plans";

type UsageRow = {
  label: string;
  used: number;
  limit: PlanLimitValue;
};

function UsageBar({ row }: { row: UsageRow }) {
  const isCustom = row.limit === "custom";
  const limitNum = row.limit === "custom" ? 0 : row.limit;
  const pct = limitNum === 0 ? 0 : Math.min(100, Math.round((row.used / limitNum) * 100));
  const near = pct >= 80;
  const full = !isCustom && row.used >= limitNum;

  return (
    <div className="bill-usage-row">
      <div className="bill-usage-top">
        <span>{row.label}</span>
        <strong>
          {row.used} / {isCustom ? "Custom" : row.limit}
          {full ? <em className="bill-usage-flag is-full">Limit reached</em> : near ? <em className="bill-usage-flag">Approaching limit</em> : null}
        </strong>
      </div>
      <div className="bill-usage-track">
        <span
          className={`bill-usage-fill${full ? " is-full" : near ? " is-near" : ""}`}
          style={{ width: isCustom ? "100%" : `${pct}%`, opacity: isCustom ? 0.25 : 1 }}
        />
      </div>
    </div>
  );
}

export default function BillingSettingsPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const profileId = profile?.id;

  const [account, setAccount] = useState<Account | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);

  const refresh = useCallback(() => {
    setAccount(getAccount());
    setWorkspaceCount(getDashboardRecords(profileId).length);
    setProjectCount(getProjects(profileId).length);
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Demo upgrade: a ?plan= link from /pricing applies the plan via the demo switcher.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("plan");
    if (param && isPlanId(param) && param !== getAccount().currentPlanId) {
      setPlan(param);
      showToast({ title: `Switched to ${getPlan(param).name}`, message: "Demo plan applied." });
      router.replace("/settings/billing");
      window.setTimeout(refresh, 0);
    }
  }, [refresh, router]);

  if (!account) {
    return <DashboardShell active="settings"><div /></DashboardShell>;
  }

  const plan = getPlan(account.currentPlanId);
  const usageRows: UsageRow[] = [
    { label: "Workspaces", used: workspaceCount, limit: plan.limits.workspaces },
    { label: "Projects", used: projectCount, limit: plan.limits.projects },
    { label: "Prompt runs", used: account.usage.promptRunsThisMonth, limit: plan.limits.promptRunsPerMonth },
    { label: "Artifacts", used: account.usage.artifactsThisMonth, limit: plan.limits.artifactsPerMonth },
    { label: "Audio guides", used: account.usage.audioGuidesThisMonth, limit: plan.limits.audioGuidesPerMonth },
    { label: "Exports", used: account.usage.exportsThisMonth, limit: plan.limits.exportsPerMonth }
  ];

  const renewLabel = new Date(account.usagePeriodEnd).toLocaleDateString();

  const applyPlan = (id: PlanId) => {
    setPlan(id);
    showToast({ title: `Switched to ${getPlan(id).name}`, message: "Demo plan applied." });
    refresh();
  };

  return (
    <DashboardShell active="settings">
      <header className="dash-page-head">
        <div>
          <h1>Billing &amp; usage</h1>
          <p>Manage your Doc/ReDefined plan and track this month&apos;s usage.</p>
        </div>
        <Link className="dash-btn-purple" href="/pricing">
          Compare plans
        </Link>
      </header>

      <section className="bill-current">
        <div className="bill-current-main">
          <p className="bill-eyebrow">Current plan</p>
          <h2>{plan.name}</h2>
          <p className="bill-current-sub">
            {plan.priceMonthly != null ? `${plan.priceLabel}/month` : "Custom pricing"} ·{" "}
            <span className={`bill-status is-${account.billingStatus}`}>{account.billingStatus}</span>{" "}
            · Usage resets {renewLabel}
          </p>
        </div>
        <div className="bill-current-actions">
          <Link className="dash-btn-dark" href="/pricing">
            {account.currentPlanId === "enterprise" ? "Manage plan" : "Upgrade plan"}
          </Link>
        </div>
      </section>

      <section className="bill-section">
        <h3>Usage this month</h3>
        <div className="bill-usage-grid">
          {usageRows.map((row) => (
            <UsageBar key={row.label} row={row} />
          ))}
        </div>
      </section>

      <section className="bill-section">
        <h3>Plan limits</h3>
        <div className="bill-limits">
          {(
            [
              ["Workspaces", plan.limits.workspaces],
              ["Projects", plan.limits.projects],
              ["Prompt runs / month", plan.limits.promptRunsPerMonth],
              ["Artifacts / month", plan.limits.artifactsPerMonth],
              ["Audio guides / month", plan.limits.audioGuidesPerMonth],
              ["Exports / month", plan.limits.exportsPerMonth],
              ["Team members", plan.limits.teamMembers]
            ] as Array<[string, PlanLimitValue]>
          ).map(([label, value]) => (
            <div key={label} className="bill-limit">
              <span>{label}</span>
              <strong>{formatLimit(value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="bill-section bill-demo">
        <div className="bill-demo-head">
          <h3>Demo plan switcher</h3>
          <span className="bill-demo-tag">Local / demo only</span>
        </div>
        <p>Switch plans to test feature gates without payment. This is not real billing.</p>
        <div className="bill-demo-buttons">
          {PLAN_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`bill-demo-btn${account.currentPlanId === id ? " active" : ""}`}
              onClick={() => applyPlan(id)}
            >
              {getPlan(id).name}
            </button>
          ))}
        </div>
      </section>

      <p className="bill-foot">
        Looking for model settings? See{" "}
        <Link href="/settings/ai-provider">AI provider</Link>.
      </p>
    </DashboardShell>
  );
}
