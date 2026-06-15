"use client";

import { useMemo, useState } from "react";
import type { QuickTest } from "@/lib/redefined";

type QuickTestsRendererProps = {
  quickTests: QuickTest[];
};

function testConcept(test: QuickTest) {
  const value = `${test.id} ${test.title} ${test.purpose} ${test.commands.join(" ")}`.toLowerCase();
  if (/(rbac|role assignment|data-plane|data plane|permission)/.test(value)) return "rbac";
  if (/(private endpoint|dns)/.test(value)) return "dns";
  if (/(network|firewall|publicnetworkaccess|public network|vnet)/.test(value)) return "network";
  if (/(sas|token|authentication|auth)/.test(value)) return "sas";
  if (/(identity|principal)/.test(value)) return "identity";
  return test.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function testStrength(test: QuickTest) {
  const value = `${test.title} ${test.purpose} ${test.commands.join(" ")}`.toLowerCase();
  let score = 0;
  if (test.commands.some((command) => command.trim().startsWith("az "))) score += 4;
  if (test.commands.some((command) => command.trim().startsWith("nslookup"))) score += 3;
  if (!value.includes("run the smallest")) score += 2;
  if (!value.includes("review ")) score += 1;
  if (test.category && test.category !== "generic") score += 1;
  return score;
}

function dedupeQuickTests(quickTests: QuickTest[]) {
  const byConcept = new Map<string, QuickTest>();

  for (const test of quickTests) {
    const concept = testConcept(test);
    const current = byConcept.get(concept);
    if (!current || testStrength(test) > testStrength(current)) {
      byConcept.set(concept, test);
    }
  }

  const order = ["rbac", "network", "dns", "sas", "identity"];
  return [...byConcept.entries()]
    .sort(([leftConcept], [rightConcept]) => {
      const left = order.includes(leftConcept) ? order.indexOf(leftConcept) : order.length;
      const right = order.includes(rightConcept) ? order.indexOf(rightConcept) : order.length;
      return left - right;
    })
    .map(([, test]) => test);
}

export function QuickTestsRenderer({ quickTests }: QuickTestsRendererProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleTests = useMemo(() => dedupeQuickTests(quickTests), [quickTests]);
  const displayedTests = showAll ? visibleTests : visibleTests.slice(0, 4);

  return (
    <section className="workspace-card quick-runbook">
      <div className="section-heading">
        <div>
          <p className="block-label">Quick diagnostic runbook</p>
          <h3>Run from the affected host</h3>
          <p>Use these tests to separate DNS, network, mapping, and access issues.</p>
        </div>
      </div>

      <div>
        {displayedTests.map((test) => (
          <article
            className={`command-card ${
              test.category === "dns"
                ? "name-resolution-card"
                : test.category === "network"
                  ? "port-reachability-card"
                  : ""
            }`}
            key={test.id}
          >
            <div className="command-card-topline">
              <h4>{test.title}</h4>
              <button className="copy-btn" type="button">
                Copy
              </button>
            </div>
            <pre>
              <code>{test.commands.join("\n")}</code>
            </pre>
            <div className="signal-grid">
              <p>
                <strong>Success:</strong> {test.successSignal}
              </p>
              <p>
                <strong>Failure means:</strong> {test.failureMeaning}
              </p>
            </div>
          </article>
        ))}
      </div>
      {visibleTests.length > 4 ? (
        <button className="show-more-checks" type="button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Show fewer checks" : "Show more checks"}
        </button>
      ) : null}
    </section>
  );
}
