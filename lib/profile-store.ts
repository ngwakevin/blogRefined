import type { AuthState, UserProfile } from "@/types/profile";

const PROFILE_KEY = "docredefined.profile";

function canUseLocalStorage(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const testKey = "docredefined.profileStorageTest";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function createProfileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function createLocalProfile(args: {
  name: string;
  email: string;
}): UserProfile {
  const name = args.name.trim();
  const email = args.email.trim().toLowerCase();

  if (name.length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  const profile: UserProfile = {
    id: createProfileId(),
    name,
    email,
    createdAt: new Date().toISOString()
  };

  if (!canUseLocalStorage()) {
    throw new Error("Profile storage is unavailable in this browser.");
  }

  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function getLocalProfile(): UserProfile | null {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalProfile(): void {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Local MVP profile removal is best effort only.
  }
}

export function getAuthState(): AuthState {
  const profile = getLocalProfile();

  return {
    isAuthenticated: Boolean(profile),
    profile,
    source: profile ? "local-mvp" : "none"
  };
}
