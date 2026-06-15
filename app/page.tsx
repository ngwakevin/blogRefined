"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import IntroSequence from "@/components/IntroSequence";
import PromptCard from "@/components/PromptCard";
import DashboardHome from "@/components/dashboard/DashboardHome";
import { useProfile } from "@/components/profile/useProfile";

export default function Home() {
  const { isProfileMode } = useProfile();
  const [hydrated, setHydrated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const handleIntroComplete = useCallback(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    // Profile hydrates on the client; wait one tick so the route branch is stable.
    const timer = window.setTimeout(() => setHydrated(true), 30);
    return () => window.clearTimeout(timer);
  }, []);

  if (!hydrated) return null;

  if (isProfileMode) {
    return <DashboardHome />;
  }

  return (
    <>
      <Header visible={isReady} />
      <IntroSequence onComplete={handleIntroComplete} />
      <PromptCard visible={isReady} />
    </>
  );
}
