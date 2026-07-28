"use client";

import { Fragment, type ReactNode } from "react";

type ArtifactDocumentProps = {
  content: string;
  type?: string;
  displayType?: string;
};

/* ── inline + parsing ──────────────────────────────────────────────────────── */

/** Strips generated placeholder markers like `[key concepts]` (not markdown links). */
function cleanLine(text: string): string {
  return text
    .replace(/\s*\[[a-z][a-z0-9 ,/&'-]*\](?!\()/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+$/g, "");
}

/** Renders inline emphasis (**bold**, `code`, [text](href)). */
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, index) => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(<strong key={`${keyBase}-b-${index}`}>{part.slice(2, -2)}</strong>);
    } else if (/^`[^`]+`$/.test(part)) {
      nodes.push(
        <code key={`${keyBase}-c-${index}`} className="art-doc-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<Fragment key={`${keyBase}-t-${index}`}>{part}</Fragment>);
    }
  });
  return nodes;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "check"; items: Array<{ text: string; done: boolean }> }
  | { kind: "code"; text: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

type ParsedSection = { title: string; key: string; blocks: Block[] };
type ParsedDoc = { intro: Block[]; sections: ParsedSection[] };

function normalizeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Section labels we recognize even when not written as markdown headings. */
const KNOWN_SECTION_KEYS = new Set([
  "introduction", "executivesummary", "overview", "summary",
  "keyconcepts", "keyconcept", "concepts",
  "mentalmodel",
  "practicalexample", "practicalexamples", "example", "examples", "usecase", "usecases",
  "whyitmatters",
  "conclusion", "recommendation", "recommendations", "recommendednextsteps", "nextsteps", "nextstep",
  "symptoms", "context", "whentouse", "prerequisites", "prerequisite",
  "investigationsteps", "investigation", "steps", "procedure",
  "resolution", "validation", "verification", "escalation", "quickreference", "reference",
  "objective", "goal", "risks", "risk", "dependencies", "dependency", "deliverynotes", "delivery",
  "components", "component", "currentstate", "targetstate", "decisions", "decision",
  "openquestions", "openquestion",
  "subject", "status", "actionstaken", "actions", "findings", "finding", "requester", "customer", "owner",
  "details", "issue", "problem"
]);

/** Detects a section header written as **Bold** or a known keyword line. */
function detectHeading(line: string): string | null {
  const trimmed = line.trim();
  const bold = trimmed.match(/^\*\*(.+?)\*\*:?$/);
  if (bold) return bold[1].trim().replace(/:$/, "");
  const noColon = trimmed.replace(/:$/, "").trim();
  const words = noColon.split(/\s+/);
  if (words.length <= 6 && KNOWN_SECTION_KEYS.has(normalizeKey(noColon))) return noColon;
  if (/:$/.test(trimmed) && words.length <= 6 && !/[.!?]/.test(noColon)) return noColon;
  return null;
}

/** Splits a paragraph into sentences for fallback structuring. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableSep = (line: string) => /-/.test(line) && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);

function parseDoc(content: string): ParsedDoc {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const intro: Block[] = [];
  const sections: ParsedSection[] = [];
  const target = () => (sections.length > 0 ? sections[sections.length - 1].blocks : intro);

  let list: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let checks: Array<{ text: string; done: boolean }> = [];
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (listKind && list.length > 0) target().push({ kind: listKind, items: list });
    list = [];
    listKind = null;
  };
  const flushChecks = () => {
    if (checks.length > 0) target().push({ kind: "check", items: checks });
    checks = [];
  };
  const flushQuote = () => {
    if (quote.length > 0) target().push({ kind: "quote", lines: quote });
    quote = [];
  };
  const flushAll = () => {
    flushList();
    flushChecks();
    flushQuote();
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");

    if (/^```/.test(line.trim())) {
      if (code === null) {
        flushAll();
        code = [];
      } else {
        target().push({ kind: "code", text: code.join("\n") });
        code = null;
      }
      i += 1;
      continue;
    }
    if (code !== null) {
      code.push(raw);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      flushAll();
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushAll();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      target().push({ kind: "table", header, rows });
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushList();
      flushChecks();
      quote.push(cleanLine(quoteMatch[1]));
      i += 1;
      continue;
    }
    flushQuote();

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const text = cleanLine(heading[2]);
      if (text && level <= 2) {
        sections.push({ title: text, key: normalizeKey(text), blocks: [] });
      } else if (text) {
        target().push({ kind: "h", level, text });
      }
      i += 1;
      continue;
    }

    // bold / keyword section headers (content rarely uses markdown ##)
    const altHeading = detectHeading(line);
    if (altHeading) {
      flushAll();
      const title = cleanLine(altHeading);
      if (title) sections.push({ title, key: normalizeKey(title), blocks: [] });
      i += 1;
      continue;
    }

    const checkbox = line.match(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]|□|☐|✓|✔|✅)\s+(.*)$/);
    if (checkbox) {
      flushList();
      const done = /\[[xX]\]|[✓✔✅]/.test(line);
      const text = cleanLine(checkbox[1]);
      if (text) checks.push({ text, done });
      i += 1;
      continue;
    }
    flushChecks();

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      if (listKind !== "ol") flushList();
      listKind = "ol";
      const text = cleanLine(ordered[1]);
      if (text) list.push(text);
      i += 1;
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      if (listKind !== "ul") flushList();
      listKind = "ul";
      const text = cleanLine(bullet[1]);
      if (text) list.push(text);
      i += 1;
      continue;
    }

    flushList();
    const text = cleanLine(line);
    if (text) target().push({ kind: "p", text });
    i += 1;
  }
  flushAll();
  if (code && code.length > 0) target().push({ kind: "code", text: code.join("\n") });

  return { intro, sections };
}

/* ── block + helper renderers ──────────────────────────────────────────────── */

function Blocks({ blocks, base }: { blocks: Block[]; base: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${base}-${index}`;
        switch (block.kind) {
          case "h":
            return block.level <= 3 ? (
              <h4 className="art-doc-h3" key={key}>{inline(block.text, key)}</h4>
            ) : (
              <h5 className="art-doc-h4" key={key}>{inline(block.text, key)}</h5>
            );
          case "p":
            return <p className="art-doc-p" key={key}>{inline(block.text, key)}</p>;
          case "ul":
            return (
              <ul className="art-doc-list" key={key}>
                {block.items.map((item, j) => <li key={j}>{inline(item, `${key}-${j}`)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol className="art-doc-list art-doc-ol" key={key}>
                {block.items.map((item, j) => <li key={j}>{inline(item, `${key}-${j}`)}</li>)}
              </ol>
            );
          case "check":
            return <ChecklistRows items={block.items} base={key} key={key} />;
          case "code":
            return <pre className="art-doc-code" key={key}>{block.text}</pre>;
          case "quote":
            return (
              <div className="art-doc-callout" key={key}>
                {block.lines.map((line, j) => <p key={j}>{inline(line, `${key}-${j}`)}</p>)}
              </div>
            );
          case "table":
            return (
              <div className="art-doc-table-wrap" key={key}>
                <table className="art-doc-table">
                  <thead>
                    <tr>{block.header.map((cell, j) => <th key={j}>{inline(cell, `${key}-h-${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell, `${key}-${r}-${c}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function ChecklistRows({ items, base }: { items: Array<{ text: string; done: boolean }>; base: string }) {
  return (
    <ul className="art-doc-checklist">
      {items.map((item, index) => (
        <li className={`art-doc-check${item.done ? " done" : ""}`} key={`${base}-${index}`}>
          <span className="art-doc-box" aria-hidden="true">{item.done ? "✓" : ""}</span>
          <span>{inline(item.text, `${base}-${index}`)}</span>
        </li>
      ))}
    </ul>
  );
}

function paraText(section?: ParsedSection): string {
  if (!section) return "";
  return section.blocks.filter((b): b is Extract<Block, { kind: "p" }> => b.kind === "p").map((b) => b.text).join(" ");
}

function listItems(section?: ParsedSection): string[] {
  if (!section) return [];
  const block = section.blocks.find((b) => b.kind === "ul" || b.kind === "ol");
  return block && (block.kind === "ul" || block.kind === "ol") ? block.items : [];
}

function checkItems(section?: ParsedSection): Array<{ text: string; done: boolean }> {
  if (!section) return [];
  const fromChecks = section.blocks.flatMap((b) => (b.kind === "check" ? b.items : []));
  if (fromChecks.length > 0) return fromChecks;
  return listItems(section).map((text) => ({ text, done: false }));
}

type Picker = ((...subs: string[]) => ParsedSection | undefined) & { rest: () => ParsedSection[] };

function makePicker(sections: ParsedSection[]): Picker {
  const used = new Set<number>();
  const pick = ((...subs: string[]): ParsedSection | undefined => {
    for (let i = 0; i < sections.length; i += 1) {
      if (used.has(i)) continue;
      if (subs.some((sub) => sections[i].key.includes(sub))) {
        used.add(i);
        return sections[i];
      }
    }
    return undefined;
  }) as Picker;
  pick.rest = () => sections.filter((_, i) => !used.has(i));
  return pick;
}

function GenericSections({ sections, base }: { sections: ParsedSection[]; base: string }) {
  return (
    <>
      {sections.map((section, index) => (
        <section className="art-doc-section" key={`${base}-${index}`}>
          <h3 className="art-doc-section-title">{section.title}</h3>
          <div className="art-doc-section-body">
            <Blocks blocks={section.blocks} base={`${base}-${index}`} />
          </div>
        </section>
      ))}
    </>
  );
}

/* ── type-specific views ───────────────────────────────────────────────────── */

function conceptCard(item: string, index: number) {
  const [head, ...rest] = item.split(/\s*(?::|—|–|-)\s+/);
  const desc = rest.join(" ");
  return (
    <div className="art-concept-card" key={index}>
      <strong>{inline(desc ? head : item, `c-${index}`)}</strong>
      {desc ? <span>{inline(desc, `cd-${index}`)}</span> : null}
    </div>
  );
}

function nextStepItems(section: ParsedSection): string[] {
  const items = listItems(section);
  if (items.length > 0) return items;
  return splitSentences(paraText(section)).slice(0, 6);
}

function SummaryView({ doc }: { doc: ParsedDoc }) {
  // Fallback: no recognizable sections → split the single paragraph so it never
  // renders as one merged blob.
  if (doc.sections.length === 0) {
    const text = doc.intro
      .filter((b): b is Extract<Block, { kind: "p" }> => b.kind === "p")
      .map((b) => b.text)
      .join(" ")
      .trim();
    const sentences = splitSentences(text);
    const execText = sentences.slice(0, 3).join(" ");
    const rest = sentences.slice(3);
    return (
      <>
        {execText ? (
          <section className="art-exec-card">
            <p className="art-card-eyebrow">Executive summary</p>
            <p>{inline(execText, "fb-exec")}</p>
          </section>
        ) : null}
        {rest.length > 0 ? (
          <section className="art-doc-section">
            <h3 className="art-doc-section-title">Key points</h3>
            <ul className="art-doc-list">
              {rest.map((sentence, index) => <li key={index}>{inline(sentence, `kp-${index}`)}</li>)}
            </ul>
          </section>
        ) : null}
        {!execText && rest.length === 0 ? <Blocks blocks={doc.intro} base="fb" /> : null}
      </>
    );
  }

  const pick = makePicker(doc.sections);
  const exec = pick("introduction", "executivesummary", "overview", "summary");
  const concepts = pick("keyconcept", "concepts");
  const mental = pick("mentalmodel");
  const examples = pick("practicalexample", "example", "usecase");
  const why = pick("whyitmatters");
  const conclusion = pick("conclusion");
  const recs = pick("recommendation", "nextstep", "recommendednextsteps");

  const execText = exec ? splitSentences(paraText(exec)).slice(0, 4).join(" ") : "";
  let conceptItems = concepts ? listItems(concepts) : [];
  if (concepts && conceptItems.length === 0) {
    const text = paraText(concepts);
    conceptItems = text.includes(";")
      ? text.split(/;\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
      : splitSentences(text).slice(0, 4);
  }

  return (
    <>
      {execText ? (
        <section className="art-exec-card">
          <p className="art-card-eyebrow">Executive summary</p>
          <p>{inline(execText, "exec")}</p>
        </section>
      ) : null}

      {concepts ? (
        <section className="art-doc-section">
          <h3 className="art-doc-section-title">{concepts.title}</h3>
          {conceptItems.length > 0 ? (
            <div className="art-concept-grid">{conceptItems.map(conceptCard)}</div>
          ) : (
            <Blocks blocks={concepts.blocks} base="concepts" />
          )}
        </section>
      ) : null}

      {mental ? (
        <section className="art-callout-card art-callout-mental">
          <span className="art-callout-icon" aria-hidden="true">🧠</span>
          <div>
            <p className="art-card-eyebrow">{mental.title}</p>
            <Blocks blocks={mental.blocks} base="mental" />
          </div>
        </section>
      ) : null}

      {examples ? (
        <section className="art-example-card">
          <p className="art-card-eyebrow">{examples.title}</p>
          <Blocks blocks={examples.blocks} base="examples" />
        </section>
      ) : null}

      {why ? (
        <section className="art-closing-card">
          <p className="art-card-eyebrow">{why.title}</p>
          <Blocks blocks={why.blocks} base="why" />
        </section>
      ) : null}

      {recs ? (
        <section className="art-doc-section">
          <h3 className="art-doc-section-title">{recs.title}</h3>
          <ol className="art-steps">
            {nextStepItems(recs).map((item, index) => (
              <li className="art-step" key={index}>
                <span className="art-step-num">{index + 1}</span>
                <span>{inline(item, `ns-${index}`)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {conclusion ? (
        <section className="art-closing-card">
          <p className="art-card-eyebrow">{conclusion.title}</p>
          <Blocks blocks={conclusion.blocks} base="conclusion" />
        </section>
      ) : null}

      <GenericSections sections={pick.rest()} base="summary-rest" />
    </>
  );
}

function RunbookView({ doc }: { doc: ParsedDoc }) {
  const pick = makePicker(doc.sections);
  const issue = pick("issue", "overview", "problem");
  const whenToUse = pick("whentouse");
  const symptoms = pick("symptom");
  const context = pick("context");
  const prereq = pick("prerequisite");
  const steps = pick("investigation", "steps", "procedure");
  const resolution = pick("resolution", "fix");
  const validation = pick("validation", "verify");
  const escalation = pick("escalation");
  const quickRef = pick("quickreference", "reference");

  return (
    <>
      {issue ? (
        <section className="art-exec-card art-exec-runbook">
          <p className="art-card-eyebrow">{issue.title}</p>
          <Blocks blocks={issue.blocks} base="issue" />
        </section>
      ) : null}
      {issue ? null : doc.intro.length > 0 ? (
        <div className="art-doc-intro"><Blocks blocks={doc.intro} base="rb-intro" /></div>
      ) : null}

      {whenToUse ? (
        <section className="art-callout-card art-callout-info">
          <span className="art-callout-icon" aria-hidden="true">ℹ️</span>
          <div>
            <p className="art-card-eyebrow">{whenToUse.title}</p>
            <Blocks blocks={whenToUse.blocks} base="when" />
          </div>
        </section>
      ) : null}

      {symptoms ? (
        <SectionCard title={symptoms.title}><Blocks blocks={symptoms.blocks} base="sym" /></SectionCard>
      ) : null}
      {context ? (
        <SectionCard title={context.title}><Blocks blocks={context.blocks} base="ctx" /></SectionCard>
      ) : null}
      {prereq ? (
        <SectionCard title={prereq.title}><Blocks blocks={prereq.blocks} base="pre" /></SectionCard>
      ) : null}

      {steps ? (
        <section className="art-doc-section">
          <h3 className="art-doc-section-title">{steps.title}</h3>
          {listItems(steps).length > 0 ? (
            <ol className="art-steps">
              {listItems(steps).map((item, index) => (
                <li className="art-step" key={index}>
                  <span className="art-step-num">{index + 1}</span>
                  <span>{inline(item, `step-${index}`)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Blocks blocks={steps.blocks} base="steps" />
          )}
        </section>
      ) : null}

      {resolution ? (
        <section className="art-callout-card art-callout-success">
          <span className="art-callout-icon" aria-hidden="true">✅</span>
          <div>
            <p className="art-card-eyebrow">{resolution.title}</p>
            <Blocks blocks={resolution.blocks} base="res" />
          </div>
        </section>
      ) : null}

      {validation ? (
        <SectionCard title={validation.title}>
          <ChecklistRows items={checkItems(validation)} base="val" />
        </SectionCard>
      ) : null}

      {escalation ? (
        <section className="art-callout-card art-callout-warn">
          <span className="art-callout-icon" aria-hidden="true">⚠️</span>
          <div>
            <p className="art-card-eyebrow">{escalation.title}</p>
            <Blocks blocks={escalation.blocks} base="esc" />
          </div>
        </section>
      ) : null}

      {quickRef ? (
        <SectionCard title={quickRef.title}><Blocks blocks={quickRef.blocks} base="qr" /></SectionCard>
      ) : null}

      <GenericSections sections={pick.rest()} base="rb-rest" />
    </>
  );
}

function ChecklistView({ doc }: { doc: ParsedDoc }) {
  const groups = doc.sections;
  return (
    <>
      {doc.intro.length > 0 ? (
        <div className="art-doc-intro"><Blocks blocks={doc.intro} base="cl-intro" /></div>
      ) : null}
      {groups.map((group, index) => {
        const items = checkItems(group);
        const done = items.filter((item) => item.done).length;
        return (
          <section className="art-checklist-group" key={index}>
            <div className="art-checklist-head">
              <h3>{group.title}</h3>
              {items.length > 0 ? (
                <span className="art-status-chip">{done}/{items.length}</span>
              ) : null}
            </div>
            {items.length > 0 ? (
              <ChecklistRows items={items} base={`cl-${index}`} />
            ) : (
              <Blocks blocks={group.blocks} base={`cl-${index}`} />
            )}
          </section>
        );
      })}
    </>
  );
}

function TicketView({ doc, title }: { doc: ParsedDoc; title: string }) {
  const pick = makePicker(doc.sections);
  const subject = pick("subject");
  const statusSec = pick("status");
  const summary = pick("summary", "update", "overview");
  const actions = pick("actionstaken", "actions");
  const findings = pick("finding");
  const next = pick("nextstep", "next");
  const requester = pick("requester", "customer", "owner", "request");
  const subjectText = paraText(subject) || title;
  const statusText = paraText(statusSec);

  return (
    <>
      <section className="art-ticket-subject">
        <p className="art-card-eyebrow">Subject</p>
        <h3>{inline(subjectText, "subj")}</h3>
        {statusText ? <span className="art-status-chip art-status-active">{statusText}</span> : null}
      </section>

      {summary ? (
        <SectionCard title={summary.title}><Blocks blocks={summary.blocks} base="t-sum" /></SectionCard>
      ) : null}
      {actions ? (
        <SectionCard title={actions.title}><Blocks blocks={actions.blocks} base="t-act" /></SectionCard>
      ) : null}
      {findings ? (
        <SectionCard title={findings.title}><Blocks blocks={findings.blocks} base="t-find" /></SectionCard>
      ) : null}
      {next ? (
        <SectionCard title={next.title}><Blocks blocks={next.blocks} base="t-next" /></SectionCard>
      ) : null}
      {requester ? (
        <section className="art-callout-card art-callout-info">
          <span className="art-callout-icon" aria-hidden="true">👤</span>
          <div>
            <p className="art-card-eyebrow">{requester.title}</p>
            <Blocks blocks={requester.blocks} base="t-req" />
          </div>
        </section>
      ) : null}

      <GenericSections sections={pick.rest()} base="t-rest" />
    </>
  );
}

function ImplementationPlanView({ doc }: { doc: ParsedDoc }) {
  const pick = makePicker(doc.sections);
  const objective = pick("objective", "goal", "overview");
  const risks = pick("risk", "dependency");
  const validation = pick("validation", "acceptance");
  const delivery = pick("delivery", "notes");
  // Remaining sections become numbered phases.
  const phases = pick.rest().filter((section) => section.key.length > 0);

  return (
    <>
      {objective ? (
        <section className="art-exec-card">
          <p className="art-card-eyebrow">{objective.title}</p>
          <Blocks blocks={objective.blocks} base="obj" />
        </section>
      ) : null}

      {phases.map((phase, index) => (
        <section className="art-phase-card" key={index}>
          <div className="art-phase-head">
            <span className="art-phase-num">{index + 1}</span>
            <h3>{phase.title}</h3>
          </div>
          <Blocks blocks={phase.blocks} base={`phase-${index}`} />
        </section>
      ))}

      {risks ? (
        <section className="art-callout-card art-callout-warn">
          <span className="art-callout-icon" aria-hidden="true">⚠️</span>
          <div>
            <p className="art-card-eyebrow">{risks.title}</p>
            <Blocks blocks={risks.blocks} base="risks" />
          </div>
        </section>
      ) : null}
      {validation ? (
        <SectionCard title={validation.title}>
          <ChecklistRows items={checkItems(validation)} base="ip-val" />
        </SectionCard>
      ) : null}
      {delivery ? (
        <SectionCard title={delivery.title}><Blocks blocks={delivery.blocks} base="ip-del" /></SectionCard>
      ) : null}
    </>
  );
}

function ArchitectureView({ doc }: { doc: ParsedDoc }) {
  const pick = makePicker(doc.sections);
  const context = pick("context", "overview");
  const current = pick("currentstate", "current");
  const target = pick("targetstate", "target", "proposed");
  const components = pick("component");
  const decisions = pick("decision");
  const risks = pick("risk");
  const open = pick("openquestion", "question");
  const diagram = pick("diagram");

  return (
    <>
      {context ? (
        <section className="art-exec-card">
          <p className="art-card-eyebrow">{context.title}</p>
          <Blocks blocks={context.blocks} base="ctx" />
        </section>
      ) : null}

      {current || target ? (
        <div className="art-state-grid">
          {current ? (
            <section className="art-state-card">
              <p className="art-card-eyebrow">{current.title}</p>
              <Blocks blocks={current.blocks} base="cur" />
            </section>
          ) : null}
          {target ? (
            <section className="art-state-card art-state-target">
              <p className="art-card-eyebrow">{target.title}</p>
              <Blocks blocks={target.blocks} base="tgt" />
            </section>
          ) : null}
        </div>
      ) : null}

      {components ? (
        <section className="art-doc-section">
          <h3 className="art-doc-section-title">{components.title}</h3>
          {listItems(components).length > 0 ? (
            <div className="art-concept-grid">
              {listItems(components).map((item, index) => {
                const [head, ...rest] = item.split(/\s*[:—–-]\s+/);
                const desc = rest.join(" ");
                return (
                  <div className="art-concept-card" key={index}>
                    <strong>{inline(desc ? head : item, `cmp-${index}`)}</strong>
                    {desc ? <span>{inline(desc, `cmpd-${index}`)}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <Blocks blocks={components.blocks} base="cmp" />
          )}
        </section>
      ) : null}

      {decisions ? (
        <SectionCard title={decisions.title}><Blocks blocks={decisions.blocks} base="dec" /></SectionCard>
      ) : null}
      {risks ? (
        <section className="art-callout-card art-callout-warn">
          <span className="art-callout-icon" aria-hidden="true">⚠️</span>
          <div>
            <p className="art-card-eyebrow">{risks.title}</p>
            <Blocks blocks={risks.blocks} base="arc-risk" />
          </div>
        </section>
      ) : null}
      {open ? (
        <section className="art-callout-card art-callout-info">
          <span className="art-callout-icon" aria-hidden="true">❓</span>
          <div>
            <p className="art-card-eyebrow">{open.title}</p>
            <Blocks blocks={open.blocks} base="open" />
          </div>
        </section>
      ) : null}

      {!diagram ? (
        <div className="art-diagram-placeholder">Diagram placeholder — no diagram provided.</div>
      ) : (
        <SectionCard title={diagram.title}><Blocks blocks={diagram.blocks} base="dia" /></SectionCard>
      )}

      <GenericSections sections={pick.rest()} base="arc-rest" />
    </>
  );
}

function FallbackView({ doc }: { doc: ParsedDoc }) {
  return (
    <>
      {doc.intro.length > 0 ? (
        <div className="art-doc-intro"><Blocks blocks={doc.intro} base="fb-intro" /></div>
      ) : null}
      <GenericSections sections={doc.sections} base="fb" />
    </>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="art-doc-section">
      <h3 className="art-doc-section-title">{title}</h3>
      <div className="art-doc-section-body">{children}</div>
    </section>
  );
}

/* ── entry ─────────────────────────────────────────────────────────────────── */

export function ArtifactDocument({ content, type, displayType }: ArtifactDocumentProps) {
  const doc = parseDoc(content);
  const label = (displayType ?? "").toLowerCase();

  let view: ReactNode;
  if (type === "summary") view = <SummaryView doc={doc} />;
  else if (type === "runbook") view = <RunbookView doc={doc} />;
  else if (type === "checklist") view = <ChecklistView doc={doc} />;
  else if (type === "ticket") view = <TicketView doc={doc} title={doc.sections[0]?.title ?? "Update"} />;
  else if (label.includes("implementation") || type === "business_plan") view = <ImplementationPlanView doc={doc} />;
  else if (label.includes("architecture")) view = <ArchitectureView doc={doc} />;
  else view = <FallbackView doc={doc} />;

  return <article className="art-doc-rendered">{view}</article>;
}
