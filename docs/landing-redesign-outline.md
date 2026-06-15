# Doc/ReDefined — Award-Level Landing Page Outline

Reference: [vectrfl.com](https://www.vectrfl.com/) (designed by Utsubo). This doc maps
Vectr's structure and motion language onto Doc/ReDefined, and lists what would take
the current page "to another level." **Outline only — nothing here is implemented.**

---

## 1. What makes Vectr feel award-worthy (the anatomy)

1. **One scroll = one story.** The page is a guided narrative: bold claim → "scroll to
   discover our process" → numbered chapters (01 Activation, 02 Screening, 03 Matching,
   04 Arrival) → proof/standards section → FAQ → single closing CTA.
2. **Numbered chapters with pinned scenes.** Each step pins to the viewport while
   content swaps; the scroll position drives the animation, not timers.
3. **Massive confident typography.** Short declarative headlines ("The New Standard in
   Staffing"), huge type scale, tight tracking, generous whitespace.
4. **Operational copy voice.** Punchy, jargon-confident sentences ("zero-fail model",
   "nuclear-grade standards"). The copy *sounds* like the product's promise.
5. **Motion as physics, not decoration.** Smooth (lerped) scrolling, scroll-triggered
   reveals, parallax, line-by-line text masking, eased counters on the step numbers.
6. **A single, unmissable CTA at the end** ("Staff your outage") plus a minimal footer.

## 2. What Doc/ReDefined already has going for it

- A real, live product on the page — the prompt bar actually works. Vectr can't demo
  staffing in-browser; **we can let visitors use the product in the hero**. That's our
  unfair advantage and the centerpiece of the redesign.
- A typing intro sequence with `prefers-reduced-motion` support (keep this — it's the
  kind of detail Awwwards judges notice).
- A strong design language already in place: glassmorphism header, Space Grotesk /
  Inter / JetBrains Mono, the purple/yellow/blue/green mode palette, tight negative
  letter-spacing.
- The animated SVG diagram with the four-stage pipeline — currently auto-cycling on a
  timer; it becomes far more powerful when **scroll-driven**.

## 3. Proposed page architecture (top to bottom)

### 0. Intro overlay (keep, tighten)
Keep the typewriter brand intro but cap it at ~1.8s total. Add a skip-on-click/scroll.
First-visit only (sessionStorage) so returning users land instantly.

### 1. Hero — "the product is the hero"
- Eyebrow (mono, small) → giant two-line headline → one-sentence subtitle → **the live
  prompt bar**, elevated as the primary CTA. No separate "Start free" hero button; the
  input *is* the call to action.
- Copy direction (Vectr's declarative voice):
  - H1: **"Documentation, redefined."** or **"The new standard for understanding anything."**
  - Sub: "Type a question. Get a visual guide, a build path, a diagnosis, or a
    shippable artifact — in seconds."
- Background: subtle animated gradient mesh or grain field in brand purple that shifts
  hue with the active mode (the `stage-*` body class already exists for this).
- Bottom of viewport: `(scroll to see how it works)` indicator — Vectr's exact cue.

### 2. Chapter strip — "How it works" (the Vectr 01–04 core)
Four full-viewport pinned chapters, scroll-driven, one per mode:

| # | Chapter | Color | Beat |
|---|---------|-------|------|
| 01 | Understand | purple | Question becomes a visual guide |
| 02 | Build | blue | Guide becomes a step-by-step path |
| 03 | Fix | yellow | Path gets diagnosed — issue map, likely causes |
| 04 | Artifact | green | Everything becomes a usable deliverable |

Treatment per chapter:
- Oversized chapter number (01…) that counts/morphs as you scroll between chapters.
- The existing SVG pipeline diagram is **pinned once** in the center; scrolling
  advances the pulse along the path and lights up each node (replace the 2.5s
  auto-cycle with scroll progress). This single change is the biggest "wow" upgrade.
- Headline + 2-line description slide in with masked line-by-line reveal.
- Background tint cross-fades to the chapter's mode color (reuse `--active` vars).
- A small real UI fragment per chapter (a mini issue-map card, an artifact card stack)
  drifting with parallax — screenshots of the actual product, not stock art.

### 3. Proof / standards section (Vectr's "nuclear-grade standards" analog)
Doc/ReDefined's equivalent trust story:
- "Built on evidence, not vibes" — show the quality checklist, evidence inputs,
  confidence pills from the Fix workspace as floating cards.
- 3–4 stat counters animating on scroll (e.g., "4 modes", "1 prompt", "0 blank pages",
  guest journeys saved). Counters ease in with scroll, Vectr-style.

### 4. Live demo reel (optional but differentiating)
An auto-playing, scroll-scrubbed sequence of a real prompt being typed and answered
(pre-recorded result, no API call) — like a product video but built in DOM so it stays
crisp. This replaces the marketing-video section most landing pages fake.

### 5. FAQ — accordion (direct Vectr lift)
4–6 questions: "What can I redefine?", "Do I need an account?", "What's a journey?",
"How is this different from a chatbot?". Chevron accordions, one open at a time,
height-animated.

### 6. Closing CTA (Vectr's "Staff your outage")
Full-viewport section, dark inversion (first dark moment on the page = contrast climax):
giant headline **"What do you want to redefine?"** with a second instance of the live
prompt bar. Submitting from here scrolls you back into the result view or routes to it.

### 7. Footer (currently missing entirely)
Minimal: brand wordmark, mode anchors, Sign in / Start free, © 2026, Privacy/Terms.
Optional flourish: the wordmark in huge outline type peeking from the bottom edge.

## 4. Motion system (what "another level" actually means)

1. **Smooth scroll**: Lenis (~3 kB) for lerped scrolling — the single thing that makes
   a page *feel* like an Awwwards site.
2. **Scroll choreography**: GSAP + ScrollTrigger (industry standard for pinned scenes,
   scrubbed timelines, number counters) — or Motion (framer-motion) `useScroll` if we
   want to stay React-idiomatic. Recommendation: **GSAP** for the chapter strip,
   Motion for component-level enter/exit.
3. **Text reveals**: split headlines into lines/words, masked rise-in on enter
   (GSAP SplitText or a tiny custom splitter).
4. **Magnetic / springy micro-interactions** on the CTA button, nav pills, mode buttons.
5. **Custom cursor accent** (small dot that scales over interactive elements) — cheap,
   high perceived-craft. Optional.
6. **View transitions between mode colors**: background, accents, and the diagram all
   keyed off scroll progress, not timers.
7. **Reduced motion**: every scroll effect collapses to static layout + opacity fades
   (the codebase already respects `prefers-reduced-motion` — extend the pattern).

Deliberately **skip WebGL/Three.js** in phase 1. Vectr's studio is a WebGL shop, but
the structural + typographic + scroll work gets 90% of the effect at 10% of the cost.
A shader gradient hero (e.g., OGL, ~20 kB) can be a phase-2 cherry.

## 5. Visual language evolution (refine, don't replace)

- **Type scale up**: hero to `clamp(64px, 11vw, 160px)`; chapter numbers ~`20vw` outline.
- **Keep the light theme** as the differentiator (most award sites are dark), but add
  the **one dark inversion** at the closing CTA for a contrast climax.
- Add **grain/noise texture** overlay (subtle, multiply) — kills the "flat Tailwind" look.
- **Mode-color section tinting** instead of one uniform `#f2f3f7` throughout.
- Larger border-radius consistency (cards 32–42px already exist — apply everywhere).
- Real product screenshots inside browser-chrome frames for parallax props.

## 6. Information architecture / copy changes

- Nav: `How it works · Modes · FAQ` + `Sign in · Start free` (anchors scroll-smooth to
  chapters). Current nav links (#understand etc.) finally get real targets.
- Adopt Vectr's sentence rhythm: short, declarative, confident. Bad: "Doc/ReDefined
  turns complex topics into visual guides, guided build paths…" Good: "One prompt.
  Four ways to understand it. Zero blank pages."
- Every chapter ends with a one-line bridge into the next ("Once you understand it,
  build it →") — Vectr's narrative arc trick.

## 7. Award-criteria hygiene (Awwwards judges score these)

- Performance: lazy-mount below-fold chapters, `content-visibility`, no layout shift
  from the intro overlay, fonts already self-hosted via Fontsource ✓.
- Accessibility: keyboard path through accordion + prompt bar, focus-visible styles,
  aria-live already used ✓, reduced-motion fallbacks (above).
- Mobile: chapters unpin and stack vertically with simple fade-ins; diagram becomes a
  vertical stepper (the vertical issue-map pattern already exists in CSS — reuse it).
- SEO/meta: OG image, structured data, real `<section id>` anchors.

## 8. Suggested build order (when implementation starts)

1. Page skeleton: sections 2–7 added below the existing hero; footer; nav anchors.
2. Lenis smooth scroll + basic scroll-reveal system (fade/rise on enter).
3. Chapter strip: pin the diagram, drive pulse/node state from scroll progress.
4. Typography pass: new scale, split-text hero reveal, chapter numbers.
5. Proof section + FAQ accordion + dark closing CTA.
6. Micro-interactions: magnetic buttons, cursor, grain, mode-color tinting.
7. Perf/a11y/mobile pass.

New deps needed: `lenis`, `gsap` (or `motion`). Nothing else.
