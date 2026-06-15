"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResultRouter } from "@/components/results/ResultRouter";
import {
  activateProfileJourney,
  activateTemporaryJourney,
  getGuestLimitState,
  getProfileJourneyRecords,
  getTemporaryJourneyRecords,
  type ProfileJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";
import { getLocalProfile } from "@/lib/profile-store";

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
  const [resolved] = useState<ResolvedRecord>(() => resolveRecord(params.id));
  const guestLimitState = useMemo(() => getGuestLimitState(), []);

  useEffect(() => {
    if (!resolved) return;
    if (resolved.kind === "profile") activateProfileJourney(resolved.record.id);
    else activateTemporaryJourney(resolved.record.id);
  }, [resolved]);

  if (!resolved) {
    return (
      <main className="journey-detail-page">
        <section className="empty-journey-history">
          <h1>Workspace not found.</h1>
          <p>This workspace is not available on this device or profile.</p>
          <Link href="/workspaces">Back to workspaces</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="journey-detail-page">
      <section className="journey-detail-topline">
        <Link href="/">Back to dashboard</Link>
        <Link href="/new">New workspace</Link>
      </section>

      <section className="result-preview result-slot fix-result-preview visible">
        {resolved.kind === "profile" ? (
          <ResultRouter
            result={resolved.record.result}
            source={resolved.record.source ?? "local"}
            profileRecord={resolved.record}
            guestLimitState={guestLimitState}
          />
        ) : (
          <ResultRouter
            result={resolved.record.result}
            source="local"
            temporaryRecord={resolved.record}
            guestLimitState={guestLimitState}
          />
        )}
      </section>
    </main>
  );
}
