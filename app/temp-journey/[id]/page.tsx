"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResultRouter } from "@/components/results/ResultRouter";
import {
  activateTemporaryJourney,
  getGuestLimitState,
  getTemporaryJourneyRecord,
  type TemporaryJourneyRecord
} from "@/lib/journey-store";

export default function TemporaryJourneyPage() {
  const params = useParams<{ id: string }>();
  const [record] = useState<TemporaryJourneyRecord | null>(() =>
    getTemporaryJourneyRecord(params.id)
  );

  const guestLimitState = useMemo(() => getGuestLimitState(), []);

  useEffect(() => {
    if (record) activateTemporaryJourney(record.id);
  }, [record]);

  if (!record) {
    return (
      <main className="journey-detail-page">
        <section className="empty-journey-history">
          <h1>Temporary journey not found.</h1>
          <p>This record may have been replaced by a newer guest workspace.</p>
          <Link href="/journeys">Back to journeys</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="journey-detail-page">
      <section className="journey-detail-topline">
        <Link href="/journeys">Back to journeys</Link>
        <Link href="/signup?next=save">Save to profile</Link>
      </section>

      <section className="result-preview result-slot fix-result-preview visible">
        <ResultRouter
          result={record.result}
          source="local"
          temporaryRecord={record}
          guestLimitState={guestLimitState}
        />
      </section>
    </main>
  );
}
