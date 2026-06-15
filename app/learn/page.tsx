"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LEARNING_FOLDER } from "@/lib/dashboard-store";

const GUIDES: Array<{ title: string; description: string; color: string }> = [
  {
    title: "Getting started with Doc/ReDefined",
    description: "One prompt becomes a structured workspace. The basics in two minutes.",
    color: "#ded7fb"
  },
  {
    title: "Understand lens",
    description: "Turn any concept into a visual guide with context and common pitfalls.",
    color: "#ded7fb"
  },
  {
    title: "Build lens",
    description: "Step-by-step implementation paths with checks and decisions built in.",
    color: "#d3ecff"
  },
  {
    title: "Fix lens",
    description: "Diagnose issues with ranked causes, quick tests, and an evidence trail.",
    color: "#fbeab8"
  },
  {
    title: "Artifact lens",
    description: "Produce checklists, runbooks, and documents your team can use today.",
    color: "#cdf3de"
  },
  {
    title: "Audio Guides",
    description: "Generate listenable walkthroughs of any workspace and replay them anytime.",
    color: "#ded7fb"
  },
  {
    title: "Workspaces and Projects",
    description: "How workspaces are saved, grouped into projects, and restored without regeneration.",
    color: "#d3ecff"
  },
  {
    title: "Guest limits and profile saving",
    description: "Temporary workspaces, the 5+2 guest limit, and migrating to a profile.",
    color: "#fbeab8"
  }
];

export default function LearnPage() {
  return (
    <DashboardShell active="learning">
      <header className="dash-page-head">
        <div>
          <h1>{LEARNING_FOLDER.name}</h1>
          <p>
            Learn how to use Understand, Build, Fix, Artifact, Audio Guides, Workspaces, and
            Projects.
          </p>
        </div>
      </header>

      <div className="dash-learn-grid">
        {GUIDES.map((guide) => (
          <article key={guide.title} className="dash-learn-card">
            <span className="dash-learn-icon" style={{ background: guide.color }} aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H9a1.5 1.5 0 0 1 1 .4A1.5 1.5 0 0 1 11 3h3.5A1.5 1.5 0 0 1 16 4.5v10A1.5 1.5 0 0 1 14.5 16H11a1 1 0 0 0-1 .6A1 1 0 0 0 9 16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
                <path d="M10 4v12" fill="none" stroke="#fff" strokeWidth="1.3" />
              </svg>
            </span>
            <h3>{guide.title}</h3>
            <p>{guide.description}</p>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
