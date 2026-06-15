"use client";

import type { RedefinedResult } from "@/lib/redefined";
import { ArtifactWorkspace } from "@/components/results/artifact/ArtifactWorkspace";
import { BuildWorkspace } from "@/components/results/build/BuildWorkspace";
import { FixWorkspace } from "@/components/results/fix/FixWorkspace";
import { UnderstandWorkspace } from "@/components/results/understand/UnderstandWorkspace";
import { WorkspaceAudioGuide } from "@/components/workspace/WorkspaceAudioGuide";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import type { ResultSource } from "@/components/results/ResultSourceBadge";
import type {
  GuestLimitState,
  ProfileJourneyRecord,
  TemporaryJourneyRecord
} from "@/lib/journey-store";
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
  const audioGuides = result.workspaceAudioGuides
    ?? temporaryRecord?.audioGuides
    ?? profileRecord?.audioGuides
    ?? [];
  const initialNarration = audioGuides[audioGuides.length - 1];

  function handleNarrationGenerated(narration: WorkspaceNarration) {
    const updatedResult = saveWorkspaceNarration({
      recordId,
      profileId: profileRecord?.profileId,
      result,
      narration
    });

    onResultChange?.(updatedResult);
  }

  const workspaceChrome = (
    <>
      <WorkspaceHeader
        key={result.workspaceMeta?.workspaceId ?? result.id}
        result={result}
        recordId={recordId}
        onResultChange={onResultChange}
      />
      <WorkspaceAudioGuide
        key={`${result.workspaceMeta?.workspaceId ?? result.id}-${initialNarration?.sourceResultHash ?? "new"}`}
        result={result}
        workspaceMeta={result.workspaceMeta}
        originalPrompt={result.originalPrompt ?? result.workspaceMeta?.originalPrompt ?? result.title}
        initialNarration={initialNarration}
        onNarrationGenerated={handleNarrationGenerated}
      />
    </>
  );

  if (result.mode === "understand") {
    return (
      <>
        {workspaceChrome}
        <UnderstandWorkspace result={result} source={source} />
      </>
    );
  }

  if (result.mode === "build") {
    return (
      <>
        {workspaceChrome}
        <BuildWorkspace result={result} onGenerateArtifact={onGenerateArtifact} />
      </>
    );
  }

  if (result.mode === "artifact") {
    return (
      <>
        {workspaceChrome}
        <ArtifactWorkspace result={result} />
      </>
    );
  }

  if (result.mode === "fix") {
    return (
      <>
        {workspaceChrome}
        <FixWorkspace
          initialResult={result}
          initialSource={source}
          temporaryRecord={temporaryRecord}
          profileRecord={profileRecord}
          guestLimitState={guestLimitState}
          onRequireProfile={onRequireProfile}
        />
      </>
    );
  }

  return null;
}
