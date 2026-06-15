type TemporaryLimitModalProps = {
  open: boolean;
  count: number;
  limit: number;
  onCreateProfile: () => void;
  onSignIn: () => void;
  onContinueWithoutSaving: () => void;
  onClearTemporaryWorkspaces: () => void;
};

export function TemporaryLimitModal({
  open,
  count,
  limit,
  onCreateProfile,
  onSignIn,
  onContinueWithoutSaving,
  onClearTemporaryWorkspaces
}: TemporaryLimitModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop profile-prompt-backdrop" role="presentation">
      <section
        className="profile-prompt-modal temporary-limit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temporaryLimitTitle"
      >
        <p className="block-label">Guest workspace</p>
        <h2 id="temporaryLimitTitle">Create a profile to continue</h2>
        <p>
          You have used your temporary workspace limit. Create a profile to keep your workspaces
          and continue creating new ones.
        </p>
        <p className="profile-prompt-note">
          Continuing without saving will render this workspace for the current session only.
        </p>

        <div className="profile-prompt-meter" aria-label={`${count} of ${limit} temporary records`}>
          <span style={{ width: `${Math.min(count / limit, 1) * 100}%` }} />
        </div>

        <div className="profile-prompt-actions temporary-limit-actions">
          <button type="button" onClick={onCreateProfile}>
            Create profile
          </button>
          <button type="button" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" onClick={onContinueWithoutSaving}>
            Continue without saving
          </button>
          <button type="button" onClick={onClearTemporaryWorkspaces}>
            Clear temporary workspaces
          </button>
        </div>
      </section>
    </div>
  );
}
