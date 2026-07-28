"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArtifactDocument } from "@/components/artifacts/ArtifactDocument";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { showToast } from "@/components/Toast";
import { useProfile } from "@/components/profile/useProfile";
import { incrementUsage } from "@/lib/account-store";
import { artifactTone } from "@/lib/artifact-generation";
import {
  ARTIFACT_TYPE_LABELS,
  getArtifactLibraryItem,
  getArchivedArtifactIds,
  getRelatedArtifacts,
  toggleArchivedArtifact,
  type ArtifactLibraryItem
} from "@/lib/artifact-library";
import { relativeTime } from "@/lib/dashboard-store";
import { deleteLibraryArtifact, getProjects } from "@/lib/journey-store";
import type { WorkspaceProject } from "@/lib/workspace-types";

const TONE_HEX: Record<string, string> = {
  purple: "#b2a5ff",
  green: "#00bf63",
  yellow: "#f5b800",
  blue: "#38b6ff",
  dark: "#111827"
};

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "artifact"
  );
}

function buildFileContent(item: ArtifactLibraryItem, typeLabel: string): string {
  return [
    `# ${item.title}`,
    "",
    `Type: ${typeLabel}`,
    `Source workspace: ${item.sourceWorkspaceName}`,
    `Created: ${new Date(item.createdAt).toLocaleDateString()}`,
    "",
    "---",
    "",
    item.content
  ].join("\n");
}

export default function ArtifactDetailPage() {
  const params = useParams<{ artifactId: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const profileId = profile?.id;

  const [item, setItem] = useState<ArtifactLibraryItem | null>(null);
  const [related, setRelated] = useState<ArtifactLibraryItem[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const found = getArtifactLibraryItem(params.artifactId, profileId);
      setItem(found);
      setRelated(found ? getRelatedArtifacts(found, profileId) : []);
      setProjects(getProjects(profileId));
      setArchivedIds(getArchivedArtifactIds());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params.artifactId, profileId]);

  const projectName = useMemo(
    () => (item?.projectId ? projects.find((p) => p.id === item.projectId)?.name : undefined),
    [item, projects]
  );
  const typeLabel = item ? item.displayType ?? ARTIFACT_TYPE_LABELS[item.type] : "";
  const tone = item ? artifactTone(item.type, item.displayType) : "purple";
  const isArchived = item ? archivedIds.includes(item.id) : false;

  const handleCopy = useCallback(async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.content);
      showToast({ title: "Artifact copied" });
    } catch {
      showToast({ title: "Copy failed", message: "Clipboard is unavailable." });
    }
  }, [item]);

  const handleDownload = useCallback(
    (ext: "md" | "txt") => {
      if (!item) return;
      const mime = ext === "txt" ? "text/plain" : "text/markdown";
      const blob = new Blob([buildFileContent(item, typeLabel)], {
        type: `${mime};charset=utf-8`
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(item.title)}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      incrementUsage("exportsThisMonth");
    },
    [item, typeLabel]
  );

  const handleArchive = useCallback(() => {
    if (!item) return;
    setArchivedIds(toggleArchivedArtifact(item.id));
  }, [item]);

  const handleDelete = useCallback(() => {
    if (!item) return;
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    deleteLibraryArtifact({
      recordId: item.recordId,
      artifactId: item.id,
      origin: item.origin,
      persistence: item.persistence,
      profileId
    });
    router.push("/artifacts");
  }, [item, profileId, router]);

  if (hydrated && !item) {
    return (
      <DashboardShell active="artifacts">
        <div className="art-detail-top">
          <Link href="/artifacts">&larr; All artifacts</Link>
        </div>
        <div className="dash-empty">
          <h2>Artifact not found</h2>
          <p>This artifact is not available on this device or profile.</p>
          <Link className="dash-btn-purple" href="/artifacts">
            Back to artifacts
          </Link>
        </div>
      </DashboardShell>
    );
  }

  if (!item) {
    return <DashboardShell active="artifacts"><div /></DashboardShell>;
  }

  return (
    <DashboardShell active="artifacts">
      <div className="art-detail-top">
        <Link href="/artifacts">&larr; All artifacts</Link>
        <span className="art-detail-top-sep" aria-hidden="true">·</span>
        <Link href={item.href}>{item.sourceWorkspaceName}</Link>
        {projectName ? <span className="art-detail-top-project">{projectName}</span> : null}
      </div>

      <header className={`art-detail-header art-accent-${tone}`}>
        <div className="art-detail-header-main">
          <p className="art-doc-eyebrow">Artifact</p>
          <h1>{item.title}</h1>
          <div className="art-detail-meta">
            <span className={`art-tone-pill art-tone-${tone}`}>{typeLabel}</span>
            <span>Source: {item.sourceWorkspaceName}{projectName ? ` · ${projectName}` : ""}</span>
            <span>Created {relativeTime(item.createdAt)}</span>
          </div>
        </div>
        <div className="art-detail-actions">
          <button type="button" onClick={() => void handleCopy()}>Copy</button>
          <button type="button" onClick={() => handleDownload("md")}>Download .md</button>
          <button type="button" onClick={() => handleDownload("txt")}>Download .txt</button>
          <button type="button" onClick={handleArchive}>
            {isArchived ? "Unarchive" : "Archive"}
          </button>
          <button type="button" className="art-danger" onClick={handleDelete}>Delete</button>
        </div>
      </header>

      <div className="art-detail-layout">
        <div
          className="art-detail-doc"
          style={{ "--doc-accent": TONE_HEX[tone] } as CSSProperties}
        >
          <ArtifactDocument content={item.content} type={item.type} displayType={item.displayType} />
        </div>

        <aside className="art-detail-aside">
          <section className="art-detail-panel">
            <h3>About this artifact</h3>
            <dl>
              <dt>Type</dt>
              <dd>
                <span className={`art-tone-pill art-tone-${tone}`}>{typeLabel}</span>
              </dd>
              <dt>Source workspace</dt>
              <dd>
                <Link href={item.href}>{item.sourceWorkspaceName}</Link>
              </dd>
              {projectName ? (
                <>
                  <dt>Project</dt>
                  <dd>{projectName}</dd>
                </>
              ) : null}
              <dt>Created</dt>
              <dd>{relativeTime(item.createdAt)}</dd>
            </dl>
          </section>

          {related.length > 0 ? (
            <section className="art-detail-panel">
              <h3>Related artifacts</h3>
              <ul className="art-detail-related">
                {related.map((entry) => (
                  <li key={entry.id}>
                    <Link href={`/artifacts/${encodeURIComponent(entry.id)}`}>
                      <span
                        className={`art-detail-related-dot art-dot-${artifactTone(entry.type, entry.displayType)}`}
                        aria-hidden="true"
                      />
                      <span className="art-detail-related-text">
                        <strong>{entry.title}</strong>
                        <em>{entry.displayType ?? ARTIFACT_TYPE_LABELS[entry.type]}</em>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </DashboardShell>
  );
}
