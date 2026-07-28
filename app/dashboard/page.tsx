"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardHome from "@/components/dashboard/DashboardHome";
import { useProfile } from "@/components/profile/useProfile";

export default function DashboardPage() {
  const router = useRouter();
  const { isProfileMode } = useProfile();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 30);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // The dashboard is for logged-in users; send guests to the public landing.
    if (hydrated && !isProfileMode) router.replace("/");
  }, [hydrated, isProfileMode, router]);

  if (!hydrated || !isProfileMode) return null;

  return <DashboardHome />;
}
