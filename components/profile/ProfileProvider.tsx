"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { clearLocalProfile, getLocalProfile } from "@/lib/profile-store";
import type { UserProfile } from "@/types/profile";

type ProfileContextValue = {
  profile: UserProfile | null;
  isProfileMode: boolean;
  refreshProfile: () => void;
  clearProfile: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshProfile = useCallback(() => {
    setProfile(getLocalProfile());
  }, []);

  const clearProfile = useCallback(() => {
    clearLocalProfile();
    setProfile(null);
  }, []);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      refreshProfile();
    }, 0);

    return () => {
      window.clearTimeout(hydrationTimer);
    };
  }, [refreshProfile]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      isProfileMode: Boolean(profile),
      refreshProfile,
      clearProfile
    }),
    [clearProfile, profile, refreshProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error("useProfile must be used inside ProfileProvider.");
  }

  return context;
}
