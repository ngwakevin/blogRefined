"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getAccount } from "@/lib/account-store";
import { getPlan, planRank, type PlanId } from "@/lib/plans";

export default function AiProviderSettingsPage() {
  const [planId, setPlanId] = useState<PlanId>("free");

  useEffect(() => {
    const timer = window.setTimeout(() => setPlanId(getAccount().currentPlanId), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const isPro = planRank(planId) >= planRank("pro");
  const isEnterprise = planId === "enterprise";

  return (
    <DashboardShell active="settings">
      <header className="dash-page-head">
        <div>
          <h1>AI provider</h1>
          <p>Doc/ReDefined runs on Managed AI by default — no setup or API keys required.</p>
        </div>
      </header>

      <div className="aip-list">
        <article className="aip-option is-active">
          <div className="aip-option-head">
            <h3>Doc/ReDefined Managed AI</h3>
            <span className="aip-pill is-recommended">Recommended</span>
          </div>
          <p>
            The all-in-one default. Workspaces, artifacts, and audio guides work out of the box on
            every plan. You buy Doc/ReDefined workflows — not model routing.
          </p>
          <span className="aip-state is-on">Active</span>
        </article>

        <article className={`aip-option${isPro ? "" : " is-locked"}`}>
          <div className="aip-option-head">
            <h3>Bring your own model</h3>
            <span className="aip-pill">{isPro ? "Available later" : "Pro and above"}</span>
          </div>
          <p>
            Connect your own model provider for prompt runs. Rolling out for Pro, Team, and
            Enterprise plans — not required to use Doc/ReDefined.
          </p>
          <button type="button" className="aip-action" disabled>
            Coming soon
          </button>
        </article>

        <article className={`aip-option${isEnterprise ? "" : " is-locked"}`}>
          <div className="aip-option-head">
            <h3>Azure OpenAI / Private Gateway</h3>
            <span className="aip-pill">Enterprise</span>
          </div>
          <p>
            Private deployment, Azure OpenAI, data-retention controls, and governance for
            organizations.
          </p>
          {isEnterprise ? (
            <button type="button" className="aip-action" disabled>
              Configured by your admin
            </button>
          ) : (
            <a className="aip-action" href="mailto:sales@docredefined.com">
              Contact sales
            </a>
          )}
        </article>
      </div>

      <p className="bill-foot">
        Your plan: <strong>{getPlan(planId).name}</strong> ·{" "}
        <Link href="/settings/billing">Billing &amp; usage</Link>
      </p>
    </DashboardShell>
  );
}
