"use client";

import type { RedefinedResult } from "@/lib/redefined";

type BuildWorkspaceProps = {
  result: RedefinedResult;
  onGenerateArtifact?: (prompt: string, sourceResult: RedefinedResult) => void;
};

function getInputStatus(input: NonNullable<RedefinedResult["requiredInputs"]>[number]) {
  return input.status ?? "missing";
}

function getChecklistStatus(item: NonNullable<RedefinedResult["qualityChecklist"]>[number]) {
  return item.status ?? "pending";
}

function getBlueprintTone(sectionName: string) {
  const value = sectionName.toLowerCase();

  if (/executive|summary|team|operation|ops/.test(value)) return "purple";
  if (/market|company|description|infrastructure|network|terraform|endpoint/.test(value)) return "blue";
  if (/product|service|marketing|sales|security|identity|rbac|access/.test(value)) return "green";
  if (/financial|finance|projection|cost|risk|constraint/.test(value)) return "yellow";

  return "blue";
}

export function BuildWorkspace({ result, onGenerateArtifact }: BuildWorkspaceProps) {
  const {
    title,
    summary,
    requiredInputs = [],
    buildFlow = [],
    draftingSteps = [],
    sectionBlueprint = [],
    qualityChecklist = [],
    buildNextActions = []
  } = result;

  return (
    <div className="build-workspace">
      <section className="build-objective">
        <div>
          <div className="build-mode-badge">Build</div>
          <h2 className="build-title">{title}</h2>
          <p className="build-summary">{summary}</p>
        </div>

        <div className="build-objective-actions" aria-label="Guided build actions">
          <a className="build-primary-action" href="#build-missing-inputs">
            Fill missing inputs
          </a>
          <button
            className="build-primary-action build-primary-action--solid"
            type="button"
            onClick={() => onGenerateArtifact?.(
              result.buildNextActions?.find(a => a.targetMode === "artifact")?.prompt ?? `Draft a ${result.title ?? "document"}`,
              result
            )}
          >
            Generate artifact
          </button>
          <a className="build-primary-action" href="#build-validation-checklist">
            Create checklist
          </a>
          <button className="build-primary-action" type="button">
            Save build path
          </button>
        </div>
      </section>

      {requiredInputs.length > 0 && (
        <section id="build-missing-inputs" className="build-section build-panel build-panel--inputs">
          <div className="build-section-header">
            <div>
              <h3 className="build-section-heading">Missing inputs</h3>
              <p className="build-section-desc">Fill these to turn the build path into a precise artifact.</p>
            </div>
            <span className="build-section-count">
              {requiredInputs.filter((input) => getInputStatus(input) === "missing").length} missing
            </span>
          </div>
          <div className="build-inputs-grid">
            {requiredInputs.map((input) => (
              <div key={input.id} className={`build-input-card status-${getInputStatus(input)}`}>
                <div className="build-input-topline">
                  <div className="build-input-label">{input.label}</div>
                  <span className="build-input-status">{getInputStatus(input)}</span>
                </div>
                <div className="build-input-why">{input.whyNeeded}</div>
                {input.placeholder && (
                  <div className="build-input-placeholder">
                    <span>Placeholder</span>
                    {input.placeholder}
                  </div>
                )}
                <button className="build-input-action" type="button">
                  {getInputStatus(input) === "provided" ? "Update value" : "Fill input"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {buildFlow.length > 0 && (
        <section className="build-section build-panel build-panel--progress">
          <div className="build-section-header">
            <div>
              <h3 className="build-section-heading">Build progress map</h3>
              <p className="build-section-desc">Move through the build in order, then loop back where inputs are weak.</p>
            </div>
          </div>
          <div className="build-flow-track">
            {buildFlow.map((step, i) => (
              <div key={step.id} className="build-flow-item">
                <div className="build-flow-node">
                  <div className="build-flow-num">{i + 1}</div>
                  <div className="build-flow-label">{step.label}</div>
                  <div className="build-flow-desc">{step.description}</div>
                </div>
                {i < buildFlow.length - 1 && (
                  <div className="build-flow-connector" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {draftingSteps.length > 0 && (
        <section className="build-section build-panel build-panel--drafting">
          <h3 className="build-section-heading">Drafting steps</h3>
          <p className="build-section-desc">Write each section of your plan in this order.</p>
          <div className="build-steps-list">
            {draftingSteps.map((step, i) => (
              <div key={step.id} className="build-step-card">
                <div className="build-step-index">{String(i + 1).padStart(2, "0")}</div>
                <div className="build-step-body">
                  <div className="build-step-title">{step.title}</div>
                  <div className="build-step-desc">{step.description}</div>
                  {step.outputHint && (
                    <div className="build-step-hint">{step.outputHint}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sectionBlueprint.length > 0 && (
        <section className="build-section build-panel build-panel--blueprint">
          <div className="build-section-header">
            <div>
              <h3 className="build-section-heading">Section builder</h3>
              <p className="build-section-desc">Editable-looking blocks for the content this build needs to produce.</p>
            </div>
          </div>
          <div className="build-blueprint-grid">
            {sectionBlueprint.map((section) => (
              <div
                key={section.id}
                className={`build-blueprint-card blueprint-tone-${getBlueprintTone(section.sectionName)}`}
              >
                <div className="build-blueprint-topline">
                  <div className="build-blueprint-name">{section.sectionName}</div>
                  <span className="build-edit-pill">editable</span>
                </div>
                <div className="build-blueprint-purpose">
                  <span>Purpose</span>
                  {section.purpose}
                </div>
                {section.keyQuestions.length > 0 && (
                  <div className="build-blueprint-block">
                    <div className="build-blueprint-minihead">Key questions</div>
                    <ul className="build-blueprint-questions">
                      {section.keyQuestions.map((q, qi) => (
                        <li key={qi}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {section.outputExpected && (
                  <div className="build-output-expected">
                    <span>Output expected</span>
                    {section.outputExpected}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {qualityChecklist.length > 0 && (
        <section id="build-validation-checklist" className="build-section build-panel">
          <div className="build-section-header">
            <div>
              <h3 className="build-section-heading">Build validation checklist</h3>
              <p className="build-section-desc">Actionable checks before you generate or share the final output.</p>
            </div>
          </div>
          <div className="build-checklist">
            {qualityChecklist.map((item) => (
              <div
                key={item.id}
                className={`build-checklist-item status-${getChecklistStatus(item)}`}
              >
                <div className="build-checklist-check" aria-hidden="true" />
                <div className="build-checklist-content">
                  <div className="build-checklist-topline">
                    <div className="build-checklist-label">{item.item}</div>
                    <span className="build-checklist-status">{getChecklistStatus(item)}</span>
                  </div>
                  <div className="build-checklist-reason">{item.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {buildNextActions.length > 0 && (
        <section className="build-section build-section--actions build-panel">
          <h3 className="build-section-heading">Guided actions</h3>
          <div className="build-actions-list">
            {buildNextActions.map((action, i) => (
              <button
                key={`${action.label}-${i}`}
                type="button"
                className={`build-action-card mode-${action.targetMode}${i === 0 || action.targetMode === "artifact" ? " build-action-card--primary" : ""}`}
                onClick={() => {
                  if (action.targetMode === "artifact") onGenerateArtifact?.(action.prompt, result);
                }}
              >
                <div className="build-action-body">
                  <div className="build-action-label">{action.label}</div>
                  <div className="build-action-prompt">{action.prompt}</div>
                </div>
                <div className={`build-action-badge mode-${action.targetMode}`}>
                  {action.targetMode}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
