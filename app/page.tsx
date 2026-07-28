"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import IntroSequence from "@/components/IntroSequence";
import PromptCard from "@/components/PromptCard";
import { useProfile } from "@/components/profile/useProfile";

const INTRO_SEEN_KEY = "docredefined.introSeen";

function hasSeenIntro(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    // Storage unavailable (private mode / disabled) → fall back to playing it.
    return false;
  }
}

function markIntroSeen() {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // best effort only
  }
}

export default function Home() {
  const router = useRouter();
  const { isProfileMode } = useProfile();
  const [hydrated, setHydrated] = useState(false);
  const [playIntro, setPlayIntro] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const handleIntroComplete = useCallback(() => {
    markIntroSeen();
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Profile hydrates on the client; wait one tick so the route branch is stable.
    const timer = window.setTimeout(() => {
      // The big typing intro plays once per session. On later visits to "/"
      // (logo click, back navigation) settle straight into the home page.
      const seen = hasSeenIntro();
      setPlayIntro(!seen);
      if (seen) setIsReady(true);
      setHydrated(true);
    }, 30);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Logged-in users belong on the dashboard; the landing stays for logged-out.
    if (hydrated && isProfileMode) router.replace("/dashboard");
  }, [hydrated, isProfileMode, router]);

  if (!hydrated || isProfileMode) return null;

  return (
    <>
      <Header visible={isReady} />
      {playIntro ? <IntroSequence onComplete={handleIntroComplete} /> : null}
      <PromptCard visible={isReady} />
    </>
  );
}
