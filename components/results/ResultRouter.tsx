"use client";

import { useEffect, useState } from "react";
import type { RedefinedResult } from "@/lib/redefined";
import { WorkspaceExportModal } from "@/components/workspace/WorkspaceExportModal";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceTraceTabs } from "@/components/workspace/WorkspaceTraceTabs";
import type { WorkspaceTabId } from "@/components/workspace/WorkspaceTabNav";
import type { ResultSource } from "@/components/results/ResultSourceBadge";
import type { GuestLimitState, ProfileJourneyRecord, TemporaryJourneyRecord } from "@/lib/journey-store";
import { saveWorkspaceNarration } from "@/lib/journey-store";
import type { WorkspaceNarration } from "@/lib/workspace-types";

type ResultRouterProps = {
  result: RedefinedResult;
  source?: ResultSource;
  temporaryRecord?: TemporaryJourneyRecord | null;
  profileRecord?: ProfileJourneyRecord | null;
  guestLimitState?: GuestLimitState;
  onRequireProfile?: (message?: string, next?: string) => void;
  onGenerateArtifact?: (prompt: string, sourceResult: RedefinedResult) => void;
  onResultChange?: (result: RedefinedResult) => void;
};

export function ResultRouter({
  result,
  source = "ai",
  temporaryRecord,
  profileRecord,
  guestLimitState,
  onRequireProfile,
  onGenerateArtifact,
  onResultChange
}: ResultRouterProps) {
  const recordId = temporaryRecord?.id ?? profileRecord?.id;
  const profileId = profileRecord?.profileId;
  const [exportOpen, setExportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("workspace");

  useEffect(() => {
    const onSetTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tabId?: WorkspaceTabId }>).detail;
      if (detail?.tabId) setActiveTab(detail.tabId);
    };
    window.addEventListener("workspace:set-tab", onSetTab);
    return () => window.removeEventListener("workspace:set-tab", onSetTab);
  }, []);

  function handleNarrationGenerated(narration: WorkspaceNarration) {
    const updatedResult = saveWorkspaceNarration({
      recordId,
      profileId: profileRecord?.profileId,
      result,
      narration: {
        ...narration,
        sourceRunId: narration.sourceRunId ?? result.promptRunId ?? result.workspacePromptRuns?.at(-1)?.id,
        sourceResultId: narration.sourceResultId ?? result.promptRunId ?? result.id
      }
    });

    onResultChange?.(updatedResult);
  }

  return (
    <>
      <WorkspaceHeader
        key={result.workspaceMeta?.workspaceId ?? result.id}
        result={result}
        recordId={recordId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onExportWorkspace={() => setExportOpen(true)}
        onResultChange={onResultChange}
      />
      <WorkspaceTraceTabs
        result={result}
        source={source}
        temporaryRecord={temporaryRecord}
        profileRecord={profileRecord}
        guestLimitState={guestLimitState}
        recordId={recordId}
        originalPrompt={result.originalPrompt ?? result.workspaceMeta?.originalPrompt ?? result.title}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNarrationGenerated={handleNarrationGenerated}
        onRequireProfile={onRequireProfile}
        onGenerateArtifact={onGenerateArtifact}
        onResultChange={onResultChange}
      />
      {exportOpen ? (
        <WorkspaceExportModal
          result={result}
          profileId={profileId}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </>
  );
}
