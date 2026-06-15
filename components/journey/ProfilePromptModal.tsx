type ProfilePromptModalProps = {
  open: boolean;
  count: number;
  limit: number;
  onCreateProfile: () => void;
  onContinueAsGuest: () => void;
  message?: string;
};

export function ProfilePromptModal({
  open,
  count,
  limit,
  onCreateProfile,
  onContinueAsGuest,
  message
}: ProfilePromptModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop profile-prompt-backdrop" role="presentation">
      <section
        className="profile-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profilePromptTitle"
      >
        <p className="block-label">Doc/ReDefined OS</p>
        <h2 id="profilePromptTitle">Keep your Doc/ReDefined records</h2>
        <p>
          {message ??
            `You have created ${count} temporary workspaces. Create a profile to save your journeys, reopen them later, and share them with your team.`}
        </p>
        <p className="profile-prompt-note">
          Guest workspaces are stored temporarily on this device.
        </p>

        <div className="profile-prompt-meter" aria-label={`${count} of ${limit} temporary records`}>
          <span style={{ width: `${Math.min(count / limit, 1) * 100}%` }} />
        </div>

        <div className="profile-prompt-actions">
          <button type="button" onClick={onCreateProfile}>
            Create profile
          </button>
          <button type="button" onClick={onContinueAsGuest}>
            Continue as guest
          </button>
        </div>
      </section>
    </div>
  );
}
