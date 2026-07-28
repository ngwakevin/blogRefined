"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useProfile } from "@/components/profile/useProfile";
import {
  DASHBOARD_CHANGED_EVENT,
  DashboardModalsHost,
  openCreateProject,
  openCreateWorkspace
} from "@/components/dashboard/DashboardModals";
import {
  PROJECT_COLORS,
  getDashboardRecords,
  getStarredWorkspaceIds,
  orderProjects,
  pinnedProjects,
  projectWorkspaceCount,
  type DashboardRecord
} from "@/lib/dashboard-store";
import { ensureDefaultProjects, getProjects } from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

type DashboardShellProps = {
  active:
    | "home"
    | "workspaces"
    | "projects"
    | "audio"
    | "artifacts"
    | "recent"
    | "starred"
    | "templates"
    | "trash"
    | "learning"
    | "settings";
  children: ReactNode;
};

type NavItem = {
  id: DashboardShellProps["active"];
  label: string;
  href: string;
  icon: ReactNode;
  countKey?: "recent" | "starred";
};

const MAIN_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 20 20"><path d="M3 9.5 10 3l7 6.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1Z" /></svg>
    )
  },
  {
    id: "workspaces",
    label: "Workspaces",
    href: "/workspaces",
    icon: (
      <svg viewBox="0 0 20 20"><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></svg>
    )
  },
  {
    id: "projects",
    label: "Projects",
    href: "/projects",
    icon: (
      <svg viewBox="0 0 20 20"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.6l1.6 2h5.8A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5Z" /></svg>
    )
  },
  {
    id: "audio",
    label: "Audio Guides",
    href: "/audio-guides",
    icon: (
      <svg viewBox="0 0 20 20"><rect x="8" y="3" width="4" height="9" rx="2" /><path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    )
  },
  {
    id: "artifacts",
    label: "Artifacts",
    href: "/artifacts",
    icon: (
      <svg viewBox="0 0 20 20"><path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M7 10h6M7 13h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    )
  }
];

const LIBRARY_ITEMS: NavItem[] = [
  {
    id: "recent",
    label: "Recent",
    href: "/workspaces?sort=recent",
    countKey: "recent",
    icon: (
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M10 6v4.2l2.8 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    )
  },
  {
    id: "starred",
    label: "Starred",
    href: "/workspaces?filter=starred",
    countKey: "starred",
    icon: (
      <svg viewBox="0 0 20 20"><path d="m10 3 2.1 4.4 4.9.6-3.6 3.3.9 4.7L10 13.7 5.7 16l.9-4.7L3 8l4.9-.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
    )
  },
  {
    id: "templates",
    label: "Templates",
    href: "/templates",
    icon: (
      <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="5" rx="1.5" /><rect x="3" y="10" width="6" height="7" rx="1.5" /><rect x="11" y="10" width="6" height="7" rx="1.5" /></svg>
    )
  },
  {
    id: "trash",
    label: "Trash",
    href: "/trash",
    icon: (
      <svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m2.5 0-.7 9.6A1.5 1.5 0 0 1 12.3 17H7.7a1.5 1.5 0 0 1-1.5-1.4L5.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    )
  }
];

export function DashboardShell({ active, children }: DashboardShellProps) {
  const { profile, clearProfile } = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) return undefined;

    const load = () => {
      ensureDefaultProjects(profile.id);
      setProjects(orderProjects(getProjects(profile.id)));
      setRecords(getDashboardRecords(profile.id));
      setStarredIds(getStarredWorkspaceIds());
    };

    const hydrationTimer = window.setTimeout(load, 0);
    window.addEventListener(DASHBOARD_CHANGED_EVENT, load);

    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener(DASHBOARD_CHANGED_EVENT, load);
    };
  }, [profile]);

  const counts = {
    recent: records.length,
    starred: records.filter((record) => starredIds.includes(record.workspaceId)).length
  };

  const initials = (profile?.name ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const renderNavItem = (item: NavItem) => (
    <Link
      key={item.id}
      href={item.href}
      className={`dash-nav-row${active === item.id ? " active" : ""}`}
      onClick={() => setDrawerOpen(false)}
    >
      <span className="dash-nav-icon" aria-hidden="true">{item.icon}</span>
      <span className="dash-nav-label">{item.label}</span>
      {item.countKey && counts[item.countKey] > 0 ? (
        <span className="dash-nav-badge">{counts[item.countKey]}</span>
      ) : null}
    </Link>
  );

  return (
    <div className="dash-root">
      <button
        type="button"
        className="dash-menu-toggle"
        aria-label="Open menu"
        onClick={() => setDrawerOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>

      {drawerOpen ? (
        <button
          type="button"
          className="dash-drawer-overlay"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside className={`dash-sidebar${drawerOpen ? " open" : ""}`}>
        <Link className="dash-brand" href="/" onClick={() => setDrawerOpen(false)}>
          <span className="dash-brand-mark" aria-hidden="true">D</span>
          <span className="dash-brand-name">Doc/ReDefined</span>
        </Link>

        <button
          type="button"
          className="dash-new-btn"
          onClick={() => {
            setDrawerOpen(false);
            openCreateWorkspace();
          }}
        >
          + New workspace
        </button>

        <nav className="dash-nav" aria-label="Dashboard navigation">
          <p className="dash-side-label">Main</p>
          {MAIN_ITEMS.map(renderNavItem)}

          <p className="dash-side-label">Library</p>
          {LIBRARY_ITEMS.map(renderNavItem)}
        </nav>

        <div className="dash-side-projects">
          <p className="dash-side-label">Learn</p>
          <Link
            className={`dash-side-project dash-side-learning${active === "learning" ? " active" : ""}`}
            href="/learn"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="dash-side-project-icon dash-learning-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H9a1.5 1.5 0 0 1 1 .4A1.5 1.5 0 0 1 11 3h3.5A1.5 1.5 0 0 1 16 4.5v10A1.5 1.5 0 0 1 14.5 16H11a1 1 0 0 0-1 .6A1 1 0 0 0 9 16H5.5A1.5 1.5 0 0 1 4 14.5Z" /><path d="M10 4v12" fill="none" stroke="#fff" strokeWidth="1.3" /></svg>
            </span>
            <span className="dash-side-project-text">
              <strong>{"Doc/ReDefined Learning"}</strong>
              <em>Guides &amp; tutorials</em>
            </span>
          </Link>
        </div>

        <div className="dash-side-projects">
          <p className="dash-side-label">Pinned projects</p>
          {pinnedProjects(projects).slice(0, 4).map((project) => {
            const count = projectWorkspaceCount(project, records);
            return (
              <Link
                key={project.id}
                className="dash-side-project"
                href={`/projects/${encodeURIComponent(project.id)}`}
                style={{ "--proj-color": PROJECT_COLORS[project.color ?? "blue"] } as React.CSSProperties}
                onClick={() => setDrawerOpen(false)}
              >
                <span className="dash-side-project-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.6l1.6 2h5.8A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5Z" /></svg>
                </span>
                <span className="dash-side-project-text">
                  <strong>{project.name}</strong>
                  <em>{project.description ?? `${count} workspace${count === 1 ? "" : "s"}`}</em>
                </span>
                <span className="dash-nav-badge">{count}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className="dash-side-new-project"
            onClick={() => {
              setDrawerOpen(false);
              openCreateProject();
            }}
          >
            + New project
          </button>
        </div>

        <div className="dash-user">
          <button
            type="button"
            className="dash-user-btn"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <span className="dash-avatar" aria-hidden="true">{initials}</span>
            <span className="dash-user-text">
              <strong>{profile?.name ?? "Profile"}</strong>
              <em>{profile?.email ?? "Local profile"}</em>
            </span>
            <span className="dash-user-chevron" aria-hidden="true">
              {userMenuOpen ? "⌃" : "⌄"}
            </span>
          </button>
          {userMenuOpen ? (
            <div className="dash-user-menu">
              <Link href="/settings/billing" onClick={() => setUserMenuOpen(false)}>
                Billing &amp; usage
              </Link>
              <Link href="/pricing" onClick={() => setUserMenuOpen(false)}>
                Plans &amp; pricing
              </Link>
              <Link href="/settings/ai-provider" onClick={() => setUserMenuOpen(false)}>
                AI provider
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearProfile();
                  window.location.href = "/";
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="dash-main">{children}</main>
      <DashboardModalsHost />
    </div>
  );
}
