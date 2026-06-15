"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResultRouter } from "@/components/results/ResultRouter";
import {
  activateProfileJourney,
  getGuestLimitState,
  getProfileJourneyRecord
} from "@/lib/journey-store";
import { getLocalProfile } from "@/lib/profile-store";

export default function ProfileJourneyPage() {
  const params = useParams<{ id: string }>();
  const [profile] = useState(() => getLocalProfile());
  const [record] = useState(() =>
    profile ? getProfileJourneyRecord(profile.id, params.id) : null
  );
  const guestLimitState = useMemo(() => getGuestLimitState(), []);

  useEffect(() => {
    if (record) activateProfileJourney(record.id);
  }, [record]);

  if (!profile) {
    return (
      <main className="journey-detail-page">
        <section className="empty-journey-history">
          <h1>Create a profile or continue as guest.</h1>
          <p>Profile journeys are available after you create a local MVP profile.</p>
          <Link href="/signup?next=journeys">Create profile</Link>
        </section>
      </main>
    );
  }

  if (!record) {
    return (
      <main className="journey-detail-page">
        <section className="empty-journey-history">
          <h1>Journey not found.</h1>
          <p>This saved record is not available for the current local profile.</p>
          <Link href="/journeys">Back to journeys</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="journey-detail-page">
      <section className="journey-detail-topline">
        <Link href="/journeys">Back to journeys</Link>
        <Link href="/">Create new workspace</Link>
      </section>

      <section className="result-preview result-slot fix-result-preview visible">
        <ResultRouter
          result={record.result}
          source={record.source ?? "local"}
          profileRecord={record}
          guestLimitState={guestLimitState}
        />
      </section>
    </main>
  );
}
