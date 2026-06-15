"use client";

import { openCreateWorkspace } from "@/components/dashboard/DashboardModals";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

function TemplatesContent() {
  return (
    <>
      <header className="dash-page-head">
        <div>
          <h1>Templates</h1>
          <p>Reusable workspace starting points.</p>
        </div>
      </header>
      <div className="dash-empty">
        <h2>Templates are coming soon</h2>
        <p>For now, start from a prompt — every workspace is structured automatically.</p>
        <button className="dash-btn-purple" type="button" onClick={() => openCreateWorkspace()}>
          + New workspace
        </button>
      </div>
    </>
  );
}

export default function TemplatesPage() {
  return (
    <DashboardShell active="templates">
      <TemplatesContent />
    </DashboardShell>
  );
}
