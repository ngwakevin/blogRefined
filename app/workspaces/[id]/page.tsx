"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ResultRouter } from "@/components/results/ResultRouter";
import { WorkspaceRunner } from "@/components/workspace/WorkspaceRunner";
import {
  activateProfileJourney,
  activateTemporaryJourney,
  getGuestLimitState,
  getPendingWorkspace,
  getProfileJourneyRecords,
  getTemporaryJourneyRecords,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import { getLocalProfile } from "@/lib/profile-store";
import type { RedefinedResult } from "@/lib/redefined";
import type { PendingWorkspaceShell } from "@/lib/workspace-types";

type ResolvedRecord =
  | { kind: "profile"; record: ProfileJourneyRecord }
  | { kind: "temporary"; record: TemporaryJourneyRecord }
  | null;

function resolveRecord(id: string): ResolvedRecord {
  const decoded = decodeURIComponent(id);
  const profile = getLocalProfile();

  if (profile) {
    const record = getProfileJourneyRecords(profile.id).find(
      (item) =>
        item.id === decoded ||
        item.workspaceMeta?.workspaceId === decoded ||
        item.result.workspaceMeta?.workspaceId === decoded
    );
    if (record) return { kind: "profile", record };
  }

  const tempRecord = getTemporaryJourneyRecords().find(
    (item) =>
      item.id === decoded ||
      item.workspaceMeta?.workspaceId === decoded ||
      item.result.workspaceMeta?.workspaceId === decoded
  );
  if (tempRecord) return { kind: "temporary", record: tempRecord };

  return null;
}

export default function WorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const [pending] = useState<PendingWorkspaceShell | null>(() => getPendingWorkspace(params.id));
  const [resolved] = useState<ResolvedRecord>(() =>
    getPendingWorkspace(params.id) ? null : resolveRecord(params.id)
  );
  // Result is stateful so follow-up prompt runs update the page in place.
  const [result, setResult] = useState<RedefinedResult | null>(() => resolved?.record.result ?? null);
  const guestLimitState = useMemo(() => getGuestLimitState(), []);

  useEffect(() => {
    if (!resolved) return;
    if (resolved.kind === "profile") activateProfileJourney(resolved.record.id);
    else activateTemporaryJourney(resolved.record.id);
  }, [resolved]);

  // The workspace opens inside the dashboard shell so the sidebar stays visible.
  return (
    <DashboardShell active="workspaces">
      <div className="workspace-detail-topline">
        <Link href="/workspaces">&larr; All workspaces</Link>
      </div>

      {pending ? (
        // A freshly created shell runs its first prompt here, then renders the result.
        <WorkspaceRunner shell={pending} />
      ) : !resolved || !result ? (
        <div className="dash-empty">
          <h2>Workspace not found</h2>
          <p>This workspace is not available on this device or profile.</p>
          <Link className="dash-btn-purple" href="/workspaces">
            Back to workspaces
          </Link>
        </div>
      ) : (
        <section className="result-preview result-slot fix-result-preview visible">
          {resolved.kind === "profile" ? (
            <ResultRouter
              result={result}
              source={resolved.record.source ?? "local"}
              profileRecord={resolved.record}
              guestLimitState={guestLimitState}
              onResultChange={setResult}
            />
          ) : (
            <ResultRouter
              result={result}
              source="local"
              temporaryRecord={resolved.record}
              guestLimitState={guestLimitState}
              onResultChange={setResult}
            />
          )}
        </section>
      )}
    </DashboardShell>
  );
}
