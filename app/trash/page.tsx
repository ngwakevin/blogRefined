"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function TrashPage() {
  return (
    <DashboardShell active="trash">
      <header className="dash-page-head">
        <div>
          <h1>Trash</h1>
          <p>Deleted workspaces land here before being removed.</p>
        </div>
      </header>
      <div className="dash-empty">
        <h2>Trash is empty</h2>
        <p>In this version, deleting a workspace removes it immediately.</p>
        <Link className="dash-btn-purple" href="/workspaces">
          Back to workspaces
        </Link>
      </div>
    </DashboardShell>
  );
}
