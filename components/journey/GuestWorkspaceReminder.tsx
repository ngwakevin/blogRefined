type GuestWorkspaceReminderProps = {
  count: number;
  limit: number;
  onCreateProfile: () => void;
};

export function GuestWorkspaceReminder({
  count,
  limit,
  onCreateProfile
}: GuestWorkspaceReminderProps) {
  if (count < limit - 1) return null;

  const message =
    count >= limit
      ? "You have reached 5 temporary workspaces. Create a profile to keep your workspace history."
      : "You have 4 temporary workspaces. Create a profile soon to keep your records.";

  return (
    <section className="guest-workspace-reminder" aria-label="Temporary workspace reminder">
      <p>{message}</p>
      <button type="button" onClick={onCreateProfile}>
        Create profile
      </button>
    </section>
  );
}
