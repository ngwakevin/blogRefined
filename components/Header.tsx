"use client";

import Link from "next/link";
import { useProfile } from "@/components/profile/useProfile";

type HeaderProps = {
  visible: boolean;
};

export default function Header({ visible }: HeaderProps) {
  const { profile, isProfileMode } = useProfile();

  return (
    <header className={`glass-header${visible ? " visible" : ""}`}>
      <div className="glass-shell">
        <Link className="brand" href="/" aria-label="Doc/ReDefined home">
          Doc/ReDefined
        </Link>

        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#understand">Understand</a>
          <a href="#build">Build</a>
          <a href="#fix">Fix</a>
          <a href="#artifact">Artifact</a>
        </nav>

        <div className="header-actions">
          {isProfileMode ? (
            <>
              <Link href="/">Dashboard</Link>
              <Link href="/workspaces">Workspaces</Link>
              <span className="header-profile-label">{profile?.name || "Profile"}</span>
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link className="header-cta" href="/signup">
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
