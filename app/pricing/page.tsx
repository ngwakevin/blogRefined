"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/profile/useProfile";
import { getAccount } from "@/lib/account-store";
import { formatLimit, publicPlans, type Plan, type PlanId } from "@/lib/plans";

function planHighlights(plan: Plan): string[] {
  const f = plan.features;
  const lines: string[] = [
    `${formatLimit(plan.limits.workspaces)} workspaces`,
    `${formatLimit(plan.limits.promptRunsPerMonth)} prompt runs / month`,
    `${formatLimit(plan.limits.artifactsPerMonth)} artifacts / month`,
    `${formatLimit(plan.limits.audioGuidesPerMonth)} audio guides / month`
  ];
  lines.push(f.jsonExport ? "Markdown + JSON export" : "Markdown export");
  if (f.pdfExport || f.docxExport) lines.push("PDF + DOCX export");
  if (f.customTemplates) lines.push("Custom templates");
  if (f.sharedProjects) lines.push("Shared team projects");
  if (f.sso) lines.push("SSO + audit logs");
  if (f.bringYourOwnModel) lines.push("Bring your own model / Azure OpenAI");
  return lines;
}

function ctaFor(plan: Plan, loggedIn: boolean, currentPlanId: PlanId | null) {
  if (plan.isContactSales) {
    return { label: "Contact sales", href: "mailto:sales@docredefined.com", disabled: false };
  }
  if (currentPlanId === plan.id) {
    return { label: "Current plan", href: "", disabled: true };
  }
  if (plan.id === "free") {
    return {
      label: loggedIn ? "Switch to Free" : "Start free",
      href: loggedIn ? "/settings/billing?plan=free" : "/signup",
      disabled: false
    };
  }
  return {
    label: `Upgrade to ${plan.name}`,
    href: loggedIn ? `/settings/billing?plan=${plan.id}` : `/signup?plan=${plan.id}`,
    disabled: false
  };
}

export default function PricingPage() {
  const { isProfileMode } = useProfile();
  const [currentPlanId, setCurrentPlanId] = useState<PlanId | null>(null);

  useEffect(() => {
    if (!isProfileMode) return undefined;
    const timer = window.setTimeout(() => setCurrentPlanId(getAccount().currentPlanId), 0);
    return () => window.clearTimeout(timer);
  }, [isProfileMode]);

  const plans = publicPlans();

  return (
    <div className="pricing-page">
      <header className="pricing-topbar">
        <Link href="/" className="pricing-logo">Doc/ReDefined</Link>
        <nav className="pricing-topnav">
          <Link href="/pricing" className="active" aria-current="page">Pricing</Link>
          {isProfileMode ? (
            <Link href="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/signup" className="pricing-topcta">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <section className="pricing-hero">
        <h1>Plans that grow with your work</h1>
        <p>
          Doc/ReDefined is an all-in-one workspace for turning prompts into structured, reusable
          outputs. Pick a plan — switch anytime.
        </p>
      </section>

      <section className="pricing-grid" aria-label="Plans">
        {plans.map((plan) => {
          const cta = ctaFor(plan, isProfileMode, currentPlanId);
          return (
            <article
              key={plan.id}
              className={`pricing-card${plan.highlight ? " is-popular" : ""}${currentPlanId === plan.id ? " is-current" : ""}`}
            >
              {plan.highlight ? <span className="pricing-badge">Most popular</span> : null}
              <h2>{plan.name}</h2>
              <p className="pricing-tagline">{plan.tagline}</p>
              <div className="pricing-price">
                <strong>{plan.priceLabel}</strong>
                {plan.priceMonthly != null ? <span>/month</span> : null}
              </div>
              <p className="pricing-desc">{plan.description}</p>

              {cta.disabled ? (
                <span className="pricing-cta is-current-cta">{cta.label}</span>
              ) : cta.href.startsWith("mailto:") ? (
                <a className="pricing-cta" href={cta.href}>{cta.label}</a>
              ) : (
                <Link className={`pricing-cta${plan.highlight ? " is-strong" : ""}`} href={cta.href}>
                  {cta.label}
                </Link>
              )}

              <ul className="pricing-features">
                {planHighlights(plan).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <p className="pricing-foot-note">
        Doc/ReDefined Managed AI is included on every plan — no model setup required. Bring Your Own
        Model and Azure OpenAI are available on Enterprise.
      </p>
    </div>
  );
}
