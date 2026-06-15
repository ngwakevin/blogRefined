"use client";

import { useState } from "react";
import type { TimelineEntry } from "@/lib/redefined";

type JourneyTimelineProps = {
  entries: TimelineEntry[];
};

export function JourneyTimeline({ entries }: JourneyTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const latestEntry = entries[entries.length - 1];

  return (
    <section className={`workspace-card journey-timeline ${isExpanded ? "is-expanded" : "is-collapsed"}`}>
      <button
        className="timeline-toggle"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
      >
        <span>
          <span className="block-label">Workspace journey timeline</span>
          {latestEntry ? (
            <strong>{latestEntry.title}</strong>
          ) : (
            <strong>No timeline events yet</strong>
          )}
        </span>
        <span className="timeline-toggle-meta">
          <em>{entries.length} {entries.length === 1 ? "event" : "events"}</em>
          <b aria-hidden="true">{isExpanded ? "↑" : "↓"}</b>
        </span>
      </button>

      {isExpanded ? (
        <div className="timeline-list">
          {entries.map((entry, index) => (
            <article className="timeline-item" key={entry.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="timeline-topline">
                  <strong>{entry.title}</strong>
                  <em>{entry.timestampLabel}</em>
                </div>
                <p>{entry.summary}</p>
              </div>
            </article>
          ))}
        </div>
      ) : latestEntry ? (
        <p className="timeline-collapsed-summary">{latestEntry.summary}</p>
      ) : null}
    </section>
  );
}
