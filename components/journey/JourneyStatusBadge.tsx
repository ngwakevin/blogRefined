type JourneyStatusBadgeProps = {
  count: number;
  limit: number;
};

export function JourneyStatusBadge({ count, limit }: JourneyStatusBadgeProps) {
  const full = count >= limit;

  return (
    <div className="journey-status-badge" aria-label="Guest workspace status">
      <span>Guest workspace</span>
      <small>
        {full
          ? "Temporary records full — create a profile to keep history"
          : `Temporary record ${count} of ${limit}`}
      </small>
    </div>
  );
}
