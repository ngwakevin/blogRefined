"use client";

import { useState } from "react";
import type {
  RedefinedResult,
  UnderstandNextAction,
  UnderstandAnalogy
} from "@/lib/redefined";
import type { ResultSource } from "@/components/results/ResultSourceBadge";
import { ResultSourceBadge } from "@/components/results/ResultSourceBadge";
import { useVoiceRecorder } from "@/components/voice/useVoiceRecorder";

type UnderstandWorkspaceProps = {
  result: RedefinedResult;
  source?: ResultSource;
};

const BLOCK_TONES = ["green", "blue", "purple", "yellow", "neutral"] as const;
type BlockTone = (typeof BLOCK_TONES)[number];

const BLOCK_TYPE_TONE: Record<string, BlockTone> = {
  output: "green", result: "green",
  mechanism: "blue", process: "blue", component: "blue",
  concept: "purple", principle: "purple", pattern: "purple", term: "purple",
  constraint: "yellow", risk: "yellow",
  input: "neutral"
};

function blockTone(block: { blockType?: string }, index: number): BlockTone {
  if (block.blockType && BLOCK_TYPE_TONE[block.blockType]) return BLOCK_TYPE_TONE[block.blockType];
  return BLOCK_TONES[index % BLOCK_TONES.length];
}

function clarityLabel(level: "high" | "medium" | "low"): string {
  if (level === "high") return "High clarity";
  if (level === "medium") return "Medium clarity";
  return "Low clarity";
}

function targetModeLabel(mode: UnderstandNextAction["targetMode"]): string {
  const labels: Record<UnderstandNextAction["targetMode"], string> = {
    understand: "Understand",
    build: "Build",
    fix: "Fix",
    artifact: "Artifact"
  };
  return labels[mode];
}

function sparkTypeLabel(type: "challenge" | "scenario" | "what_if" | "compare"): string {
  const labels = { challenge: "Challenge", scenario: "Scenario", what_if: "What if", compare: "Compare" };
  return labels[type];
}

type TeachBackFeedback = {
  score: number;
  feedback: string;
  gaps: string[];
  strengths: string[];
  expertVersion?: string;
};

export function UnderstandWorkspace({ result, source = "ai" }: UnderstandWorkspaceProps) {
  const clarity = result.clarity;
  const mentalModel = result.mentalModel;
  const blocks = result.coreBuildingBlocks ?? [];
  const misconceptions = result.misconceptions ?? [];
  const example = result.realWorldExample;
  const questions = result.decisionQuestions ?? [];
  const nextActions = result.nextActions ?? [];
  const domain = result.domain ?? "general";

  // interactive state
  const [activeTab, setActiveTab] = useState<"workspace" | "guide">("workspace");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [activeAnalogyId, setActiveAnalogyId] = useState<string | null>(
    result.analogySwitcher?.analogies.find((a) => a.isDefault)?.id ?? result.analogySwitcher?.analogies[0]?.id ?? null
  );
  const [blindSpotRevealed, setBlindSpotRevealed] = useState(false);
  const [teachBackText, setTeachBackText] = useState("");
  const [teachBackFeedback, setTeachBackFeedback] = useState<TeachBackFeedback | null>(null);
  const [teachBackLoading, setTeachBackLoading] = useState(false);
  const [teachBackSubmitted, setTeachBackSubmitted] = useState(false);
  const [checkedRefinements, setCheckedRefinements] = useState<Set<string>>(new Set());
  const [refineLoading, setRefineLoading] = useState(false);
  const [insightCopied, setInsightCopied] = useState(false);
  const {
    voiceInputState: teachBackVoiceState,
    voiceStatusMessage: teachBackVoiceStatus,
    handleVoiceInputClick: handleTeachBackVoiceClick
  } = useVoiceRecorder({
    onTranscript: (transcript) => {
      setTeachBackText((current) => current.trim() ? `${current.trim()}\n${transcript}` : transcript);
    },
    listeningMessage: "Listening...",
    transcribingMessage: "Transcribing...",
    readyMessage: "Explanation ready",
    errorMessage: "Could not transcribe explanation"
  });

  const activeAnalogy: UnderstandAnalogy | undefined =
    result.analogySwitcher?.analogies.find((a) => a.id === activeAnalogyId) ??
    result.analogySwitcher?.analogies[0];

  async function handleTeachBackSubmit() {
    if (!teachBackText.trim() || teachBackLoading) return;
    setTeachBackLoading(true);
    try {
      const res = await fetch("/api/teach-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          explanation: teachBackText,
          concept: result.title,
          challenge: result.teachBack?.challenge,
          expertVersion: result.teachBack?.expertVersion
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTeachBackFeedback(data.feedback ?? null);
        setTeachBackSubmitted(true);
      }
    } finally {
      setTeachBackLoading(false);
    }
  }

  async function handleRefineResult() {
    if (checkedRefinements.size === 0 || refineLoading) return;
    setRefineLoading(true);
    try {
      await fetch("/api/refine-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: result.originalPrompt ?? result.title,
          selectedOptions: Array.from(checkedRefinements),
          currentResult: result
        })
      });
    } finally {
      setRefineLoading(false);
    }
  }

  async function handleCopyInsight() {
    if (!result.shareableInsight) return;
    const text = `${result.shareableInsight.title}\n\n${result.shareableInsight.insight}${result.shareableInsight.supportingLine ? `\n${result.shareableInsight.supportingLine}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setInsightCopied(true);
      setTimeout(() => setInsightCopied(false), 2000);
    } catch {}
  }

  function toggleRefinement(id: string) {
    setCheckedRefinements((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="understand-workspace">
      {/* Tab bar */}
      {result.resultGuide && (
        <div className="understand-tab-bar">
          <button
            type="button"
            className={`understand-tab${activeTab === "workspace" ? " understand-tab--active" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`understand-tab${activeTab === "guide" ? " understand-tab--active" : ""}`}
            onClick={() => setActiveTab("guide")}
          >
            Result Guide
          </button>
        </div>
      )}

      {/* ── GUIDE TAB ── */}
      {activeTab === "guide" && result.resultGuide && (
        <div className="understand-guide-tab">
          <div className="workspace-card">
            <div className="section-heading">
              <div>
                <p className="mini-label">About this result</p>
                <h3>{result.resultGuide.differentiation.title}</h3>
              </div>
              <span className={`understand-depth-pill depth-${result.resultGuide.promptDepth.level}`}>
                {result.resultGuide.promptDepth.level} depth
              </span>
            </div>
            <p className="understand-guide-differentiation">{result.resultGuide.differentiation.description}</p>
            {result.resultGuide.promptDepth.suggestion && (
              <p className="understand-guide-suggestion">{result.resultGuide.promptDepth.suggestion}</p>
            )}
          </div>

          {result.resultGuide.sectionExplanations.length > 0 && (
            <div className="workspace-card understand-guide-sections">
              <p className="mini-label">Section guide</p>
              <ul className="understand-guide-section-list">
                {result.resultGuide.sectionExplanations.map((se, i) => (
                  <li key={i} className="understand-guide-section-item">
                    <strong>{se.section}</strong>
                    <span>{se.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.resultGuide.refinementOptions.length > 0 && (
            <div className="workspace-card understand-guide-refine">
              <div className="section-heading">
                <div>
                  <p className="mini-label">Refine this result</p>
                  <h3>Adjust the angle</h3>
                </div>
              </div>
              <p className="understand-guide-refine-hint">Select one or more options and regenerate.</p>
              <div className="understand-refine-options">
                {result.resultGuide.refinementOptions.map((opt) => (
                  <label key={opt.id} className="understand-refine-option">
                    <input
                      type="checkbox"
                      checked={checkedRefinements.has(opt.id)}
                      onChange={() => toggleRefinement(opt.id)}
                    />
                    <div>
                      <strong>{opt.label}</strong>
                      <span>{opt.description}</span>
                    </div>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="understand-refine-btn"
                disabled={checkedRefinements.size === 0 || refineLoading}
                onClick={handleRefineResult}
              >
                {refineLoading ? "Regenerating…" : "Regenerate with selected options"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── WORKSPACE TAB ── */}
      {activeTab === "workspace" && (
        <>
          <div className="workspace-status-row">
            <ResultSourceBadge source={source} context="initial" />
            <span className="understand-domain-pill">{domain}</span>
          </div>

          {/* 1. Knowledge Level Check */}
          {result.userLevelCheck && (
            <div className="workspace-card understand-level-check">
              <p className="mini-label">Start here</p>
              <p className="understand-level-question">{result.userLevelCheck.question}</p>
              <div className="understand-level-options">
                {result.userLevelCheck.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`understand-level-option${selectedLevel === opt.id ? " understand-level-option--selected" : ""}`}
                    onClick={() => setSelectedLevel(opt.id)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Concept Snapshot */}
          <section className="concept-snapshot">
            <div className="concept-snapshot-topline">
              <div>
                <p className="block-label understand-block-label">Concept snapshot</p>
                <h2>{result.title}</h2>
              </div>
              {clarity && (
                <div className="understand-clarity-pill">
                  <span>Clarity</span>
                  <strong>
                    {clarityLabel(clarity.level)}
                    {typeof clarity.score === "number" ? ` · ${clarity.score}%` : ""}
                  </strong>
                </div>
              )}
            </div>

            <p className="concept-snapshot-summary">{result.summary}</p>

            <div className="original-issue-meta">
              <span>Original question</span>
              <strong>{result.originalPrompt ?? result.title}</strong>
            </div>
          </section>

          {/* 3. Mental Model Map */}
          {mentalModel && mentalModel.steps.length > 0 && (
            <div className="workspace-card understand-mental-model">
              <div className="section-heading">
                <div>
                  <p className="mini-label">Mental model</p>
                  <h3>{mentalModel.title}</h3>
                </div>
                <span className="drop-pill">{mentalModel.steps.length} steps</span>
              </div>

              <div className="mental-model-steps">
                {mentalModel.steps.map((step, i) => (
                  <div key={step.id} className="mental-model-step">
                    <div className="mental-model-step-inner">
                      <span className="mental-model-step-index">{i + 1}</span>
                      <strong className="mental-model-step-label">{step.label}</strong>
                      {step.description && (
                        <p className="mental-model-step-desc">{step.description}</p>
                      )}
                    </div>
                    {i < mentalModel.steps.length - 1 && (
                      <span className="mental-model-arrow" aria-hidden="true">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <section className="understand-grid">
            <div className="understand-main-column">
              {/* 4. Core Building Blocks */}
              {blocks.length > 0 && (
                <div className="workspace-card understand-building-blocks">
              <div className="section-heading">
                <div>
                  <p className="mini-label">Core building blocks</p>
                  <h3>What you need to know</h3>
                </div>
                <span className="drop-pill">{blocks.length} concepts</span>
              </div>

              <div className="building-block-grid">
                {blocks.map((block, i) => (
                  <div key={block.id} className={`building-block-card block-tone-${blockTone(block, i)}`}>
                    <div className="building-block-card-top">
                      <strong className="building-block-title">{block.title}</strong>
                      {block.blockType && (
                        <span className={`building-block-type-pill bt-${block.blockType}`}>{block.blockType}</span>
                      )}
                    </div>
                    <p className="building-block-desc">{block.description}</p>
                    {typeof block.confidence === "number" && (
                      <div className="building-block-confidence">
                        <div className="building-block-confidence-bar">
                          <div
                            className="building-block-confidence-fill"
                            style={{ width: `${block.confidence}%` }}
                          />
                        </div>
                        <span className="building-block-confidence-label">{block.confidence}% clarity</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
                </div>
              )}

              {/* 5. Analogy Switcher */}
              {result.analogySwitcher && result.analogySwitcher.analogies.length > 0 && (
                <div className="workspace-card understand-analogy-switcher">
              <div className="section-heading">
                <div>
                  <p className="mini-label">{result.analogySwitcher.title}</p>
                  {result.analogySwitcher.subtitle && (
                    <p className="understand-analogy-subtitle">{result.analogySwitcher.subtitle}</p>
                  )}
                </div>
              </div>

              <div className="understand-analogy-tabs">
                {result.analogySwitcher.analogies.map((analogy) => (
                  <button
                    key={analogy.id}
                    type="button"
                    className={`understand-analogy-tab${activeAnalogyId === analogy.id ? " understand-analogy-tab--active" : ""}`}
                    onClick={() => setActiveAnalogyId(analogy.id)}
                  >
                    {analogy.label}
                  </button>
                ))}
              </div>

              {activeAnalogy && (
                <div className="understand-analogy-panel">
                  <p className="understand-analogy-title">{activeAnalogy.analogyTitle}</p>
                  <p className="understand-analogy-explanation">{activeAnalogy.explanation}</p>
                  <div className="understand-analogy-takeaway">
                    <span className="understand-analogy-takeaway-label">Key insight</span>
                    <p>{activeAnalogy.keyTakeaway}</p>
                  </div>
                </div>
              )}
                </div>
              )}

              {/* 6. Common Wrong Assumptions */}
              {misconceptions.length > 0 && (
                <div className="workspace-card understand-misconceptions">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Common wrong assumptions</p>
                      <h3>What people get wrong</h3>
                    </div>
                  </div>

                  <div className="misconception-list">
                    {misconceptions.map((item) => (
                      <div key={item.id} className="misconception-pair">
                        <div className="misconception-wrong">
                          <span className="misconception-tag wrong-tag">Wrong assumption</span>
                          <p>{item.misconception}</p>
                        </div>
                        <div className="misconception-reality">
                          <span className="misconception-tag reality-tag">Reality</span>
                          <p>{item.reality}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 7. Real World Example */}
              {example && example.scenario && (
                <div className="workspace-card understand-real-world">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">In the real world</p>
                      <h3>{example.title}</h3>
                    </div>
                  </div>

                  <div className="real-world-scenario">
                    <span>Scenario</span>
                    <p>{example.scenario}</p>
                  </div>
                  <div className="real-world-explanation">
                    <span>How {result.title} applies</span>
                    <p>{example.explanation}</p>
                  </div>
                </div>
              )}

              {/* 8. Thinking Sparks */}
              {result.thinkingSparks && result.thinkingSparks.length > 0 && (
                <div className="workspace-card understand-thinking-sparks">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Thinking sparks</p>
                      <h3>Questions that sharpen your thinking</h3>
                    </div>
                  </div>

                  <div className="thinking-spark-grid">
                    {result.thinkingSparks.map((spark) => (
                      <button
                        key={spark.id}
                        type="button"
                        className={`thinking-spark-card spark-type-${spark.type}`}
                        title={spark.targetPrompt}
                      >
                        <span className="spark-type-label">{sparkTypeLabel(spark.type)}</span>
                        <p className="spark-prompt">{spark.prompt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 13. Teach It Back */}
              {result.teachBack && (
                <div className="workspace-card understand-teach-back">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Teach it back</p>
                      <h3>Test your understanding</h3>
                    </div>
                    {teachBackFeedback && (
                      <span className={`understand-teach-score score-${teachBackFeedback.score >= 80 ? "high" : teachBackFeedback.score >= 60 ? "mid" : "low"}`}>
                        {teachBackFeedback.score}/100
                      </span>
                    )}
                  </div>

                  <p className="understand-teach-challenge">{result.teachBack.challenge}</p>

                  {!teachBackSubmitted ? (
                    <>
                      <textarea
                        className="understand-teach-textarea"
                        value={teachBackText}
                        onChange={(e) => setTeachBackText(e.target.value)}
                        placeholder={result.teachBack.placeholder}
                        rows={4}
                      />
                      <div className="section-voice-row">
                        <button
                          type="button"
                          className={`section-voice-button is-${teachBackVoiceState}`}
                          disabled={teachBackLoading || teachBackVoiceState === "transcribing"}
                          onClick={handleTeachBackVoiceClick}
                        >
                          <VoiceStateIcon state={teachBackVoiceState} />
                          {teachBackVoiceState === "recording"
                            ? "Listening..."
                            : teachBackVoiceState === "transcribing"
                              ? "Transcribing..."
                              : teachBackVoiceState === "ready"
                                ? "Explanation ready"
                                : teachBackVoiceState === "error"
                                  ? "Try again"
                                  : "Speak explanation"}
                        </button>
                        <span className={`section-voice-status is-${teachBackVoiceState}`}>
                          {teachBackVoiceStatus}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="understand-teach-submit"
                        disabled={!teachBackText.trim() || teachBackLoading}
                        onClick={handleTeachBackSubmit}
                      >
                        {teachBackLoading ? "Evaluating…" : "Submit explanation"}
                      </button>
                    </>
                  ) : (
                    <div className="understand-teach-feedback">
                      {teachBackFeedback && (
                        <>
                          <p className="understand-teach-feedback-text">{teachBackFeedback.feedback}</p>

                          {teachBackFeedback.strengths.length > 0 && (
                            <div className="understand-teach-feedback-section">
                              <span className="understand-teach-section-label strengths-label">Strengths</span>
                              <ul>
                                {teachBackFeedback.strengths.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {teachBackFeedback.gaps.length > 0 && (
                            <div className="understand-teach-feedback-section">
                              <span className="understand-teach-section-label gaps-label">Gaps to address</span>
                              <ul>
                                {teachBackFeedback.gaps.map((g, i) => (
                                  <li key={i}>{g}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {teachBackFeedback.expertVersion && (
                            <div className="understand-teach-expert">
                              <span className="understand-teach-section-label">Expert version</span>
                              <p>{teachBackFeedback.expertVersion}</p>
                            </div>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        className="understand-teach-retry"
                        onClick={() => {
                          setTeachBackSubmitted(false);
                          setTeachBackFeedback(null);
                          setTeachBackText("");
                        }}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 14. Shareable Insight Card */}
              {result.shareableInsight && (
                <div className="workspace-card understand-shareable-insight">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Shareable insight</p>
                      <h3>{result.shareableInsight.title}</h3>
                    </div>
                  </div>

                  <div className="shareable-insight-card">
                    <p className="shareable-insight-text">{result.shareableInsight.insight}</p>
                    {result.shareableInsight.supportingLine && (
                      <p className="shareable-insight-supporting">{result.shareableInsight.supportingLine}</p>
                    )}
                    {result.shareableInsight.tags.length > 0 && (
                      <div className="shareable-insight-tags">
                        {result.shareableInsight.tags.map((tag, i) => (
                          <span key={i} className="shareable-insight-tag">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="shareable-insight-actions">
                    {result.shareableInsight.actions.map((action, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`shareable-action-btn shareable-action-${action.type}`}
                        onClick={action.type === "copy" ? handleCopyInsight : undefined}
                      >
                        {action.type === "copy" && insightCopied ? "Copied!" : action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="understand-side-column">
              {/* 9. Blind Spot Reveal */}
              {result.blindSpot && (
                <div className="workspace-card understand-blind-spot">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Blind spot</p>
                      <h3>{result.blindSpot.title}</h3>
                    </div>
                    {!blindSpotRevealed && (
                      <button
                        type="button"
                        className="understand-reveal-btn"
                        onClick={() => setBlindSpotRevealed(true)}
                      >
                        Reveal
                      </button>
                    )}
                  </div>

                  {!blindSpotRevealed ? (
                    <p className="understand-blind-spot-teaser">
                      Most people miss something important about {result.title}. Tap to reveal.
                    </p>
                  ) : (
                    <>
                      <p className="understand-blind-spot-desc">{result.blindSpot.description}</p>
                      <div className="understand-blind-spot-why">
                        <span>Why it matters</span>
                        <p>{result.blindSpot.whyItMatters}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 10. Concept Confidence Map */}
              {result.conceptConfidenceMap && result.conceptConfidenceMap.items.length > 0 && (
                <div className="workspace-card understand-confidence-map">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Concept confidence map</p>
                      <h3>{result.conceptConfidenceMap.title}</h3>
                    </div>
                  </div>

                  <div className="confidence-map-list">
                    {result.conceptConfidenceMap.items.map((item) => (
                      <div key={item.id} className="confidence-map-item">
                        <div className="confidence-map-item-top">
                          <span className="confidence-map-label">{item.label}</span>
                          <span className="confidence-map-score">{item.confidence}%</span>
                        </div>
                        <div className="confidence-map-bar">
                          <div
                            className={`confidence-map-fill conf-level-${item.confidence >= 80 ? "high" : item.confidence >= 60 ? "mid" : "low"}`}
                            style={{ width: `${item.confidence}%` }}
                          />
                        </div>
                        {item.reason && (
                          <p className="confidence-map-reason">{item.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {result.conceptConfidenceMap.lowestConfidenceAction && (
                    <button
                      type="button"
                      className="understand-action-btn action-mode-understand"
                      title={result.conceptConfidenceMap.lowestConfidenceAction.prompt}
                    >
                      <span className="understand-action-mode">Understand</span>
                      <span className="understand-action-label">
                        {result.conceptConfidenceMap.lowestConfidenceAction.label}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* 11. Decision Questions */}
              {questions.length > 0 && (
                <div className="workspace-card understand-decision-questions">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Questions to make this useful</p>
                      <h3>Apply it</h3>
                    </div>
                  </div>

                  <ul className="decision-question-list">
                    {questions.map((q, i) => (
                      <li key={i} className="decision-question-item">
                        <span className="decision-question-mark" aria-hidden="true">?</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 12. Next Actions */}
              {nextActions.length > 0 && (
                <div className="workspace-card understand-next-actions">
                  <div className="section-heading">
                    <div>
                      <p className="mini-label">Next actions</p>
                      <h3>Where to go from here</h3>
                    </div>
                  </div>

                  <div className="understand-action-list">
                    {nextActions.map((action, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`understand-action-btn action-mode-${action.targetMode}`}
                        title={action.prompt}
                      >
                        <span className="understand-action-mode">{targetModeLabel(action.targetMode)}</span>
                        <span className="understand-action-label">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function VoiceStateIcon({ state }: { state: "idle" | "recording" | "transcribing" | "ready" | "error" }) {
  if (state === "ready") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (state === "transcribing") {
    return <span className="prompt-voice-spinner" aria-hidden="true" />;
  }

  if (state === "error") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}
