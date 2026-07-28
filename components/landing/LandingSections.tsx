"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

type LandingSectionsProps = {
  onRunPrompt: (prompt: string) => void;
};

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

function TickerContent() {
  return (
    <span>
      Visual guides <em className="c1">&#10022;</em> Build paths <em className="c2">&#10022;</em>{" "}
      Live diagnosis <em className="c3">&#10022;</em> Artifacts <em className="c4">&#10022;</em>{" "}
      Evidence trails <em className="c1">&#10022;</em> Quality checks <em className="c2">&#10022;</em>{" "}
      Saved journeys <em className="c3">&#10022;</em>
    </span>
  );
}

export default function LandingSections({ onRunPrompt }: LandingSectionsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const windyProgressRef = useRef<SVGPathElement>(null);
  const windyDotRef = useRef<SVGCircleElement>(null);
  const [calloutValue, setCalloutValue] = useState("");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 901px)").matches;
    gsap.registerPlugin(ScrollTrigger);

    let lenis: Lenis | null = null;
    let rafCallback: ((time: number) => void) | null = null;
    if (!reduceMotion) {
      lenis = new Lenis({ lerp: 0.095 });
      window.__lenis = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      rafCallback = (time: number) => lenis?.raf(time * 1000);
      gsap.ticker.add(rafCallback);
      gsap.ticker.lagSmoothing(0);
    }

    const onAnchorClick = (event: Event) => {
      const anchor = (event.target as HTMLElement).closest('a[href^="#"]');
      if (!anchor || !lenis) return;
      const target = document.querySelector(anchor.getAttribute("href") ?? "");
      if (target) {
        event.preventDefault();
        lenis.scrollTo(target as HTMLElement);
      }
    };
    document.addEventListener("click", onAnchorClick);

    const ctx = gsap.context(() => {
      if (!reduceMotion) {
        gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
          gsap.to(el, {
            opacity: 1, y: 0, scale: 1, duration: 1.05, ease: "back.out(1.3)",
            scrollTrigger: { trigger: el, start: "top 86%" }
          });
        });

        gsap.utils.toArray<SVGSVGElement>(".path-char svg").forEach((el) => {
          gsap.from(el, {
            scale: 0.6, opacity: 0, rotation: -8, transformOrigin: "50% 80%",
            duration: 1.1, ease: "back.out(1.9)", clearProps: "transform",
            scrollTrigger: { trigger: el, start: "top 85%" }
          });
        });

        gsap.utils.toArray<HTMLElement>(".num-card strong[data-count]").forEach((el) => {
          gsap.fromTo(el, { innerText: 0 }, {
            innerText: parseInt(el.dataset.count ?? "0", 10),
            duration: 1.4, ease: "power2.out", snap: { innerText: 1 },
            scrollTrigger: { trigger: el, start: "top 85%" }
          });
        });

        gsap.from(".callout-char", {
          yPercent: 105, duration: 1, ease: "back.out(1.2)",
          scrollTrigger: { trigger: ".callout", start: "top 55%" }
        });

        gsap.fromTo(".footer-mark", { y: 90 }, {
          y: 0, ease: "none",
          scrollTrigger: { trigger: ".landing-footer", start: "top bottom", end: "bottom bottom", scrub: true }
        });
      } else {
        document.querySelectorAll<HTMLElement>(".num-card strong[data-count]").forEach((el) => {
          el.textContent = el.dataset.count ?? "0";
        });
      }

      gsap.utils.toArray<HTMLElement>(".tile").forEach((tile) => {
        ScrollTrigger.create({ trigger: tile, start: "top 80%", onEnter: () => tile.classList.add("in-view") });
        if (!reduceMotion) {
          gsap.from(tile, {
            y: 70, opacity: 0, duration: 1.1, ease: "back.out(1.4)", clearProps: "transform",
            scrollTrigger: { trigger: tile, start: "top 88%" }
          });
        }
      });

      const windyProgress = windyProgressRef.current;
      const windyDot = windyDotRef.current;
      if (windyProgress && windyDot) {
        if (!reduceMotion && desktop) {
          const pathLen = windyProgress.getTotalLength();
          windyProgress.style.strokeDasharray = String(pathLen);
          windyProgress.style.strokeDashoffset = String(pathLen);
          const STAGE_COLORS = ["#b2a5ff", "#38b6ff", "#f5b800", "#00bf63"];
          ScrollTrigger.create({
            trigger: ".path-zone",
            start: "top 70%",
            end: "bottom 75%",
            scrub: 0.6,
            onUpdate: (self) => {
              const p = self.progress;
              windyProgress.style.strokeDashoffset = String(pathLen * (1 - p));
              const pt = windyProgress.getPointAtLength(pathLen * p);
              windyDot.setAttribute("cx", String(pt.x));
              windyDot.setAttribute("cy", String(pt.y));
              windyDot.style.fill = STAGE_COLORS[Math.min(3, Math.floor(p * 4))];
            }
          });
        } else {
          windyProgress.style.display = "none";
          windyDot.style.display = "none";
        }
      }
    }, rootRef);

    // magnetic buttons
    const magnetCleanups: Array<() => void> = [];
    if (!reduceMotion && window.matchMedia("(hover: hover)").matches && rootRef.current) {
      rootRef.current.querySelectorAll<HTMLElement>(".btn").forEach((b) => {
        const xTo = gsap.quickTo(b, "x", { duration: 0.4, ease: "power3" });
        const yTo = gsap.quickTo(b, "y", { duration: 0.4, ease: "power3" });
        const onMove = (e: MouseEvent) => {
          const r = b.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.3);
          yTo((e.clientY - r.top - r.height / 2) * 0.45);
        };
        const onLeave = () => {
          gsap.to(b, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" });
        };
        b.addEventListener("mousemove", onMove);
        b.addEventListener("mouseleave", onLeave);
        magnetCleanups.push(() => {
          b.removeEventListener("mousemove", onMove);
          b.removeEventListener("mouseleave", onLeave);
        });
      });
    }

    return () => {
      document.removeEventListener("click", onAnchorClick);
      magnetCleanups.forEach((fn) => fn());
      ctx.revert();
      if (rafCallback) gsap.ticker.remove(rafCallback);
      if (lenis) {
        lenis.destroy();
        delete window.__lenis;
      }
    };
  }, []);

  const handleCalloutSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = calloutValue.trim();
    if (!clean) return;
    setCalloutValue("");
    onRunPrompt(clean);
  };

  return (
    <div ref={rootRef}>
      {/* journey sheet */}
      <section className="journey" id="journey">
        <div className="journey-intro">
          <span className="l-label">How it works</span>
          <h2 className="reveal">Your question goes on a little journey.</h2>
          <p className="reveal">
            Doc/ReDefined reads what you actually need and picks one of four paths — or you choose.
            Either way, no wall of text.
          </p>

          <div className="intro-illustration reveal" aria-hidden="true">
            <svg viewBox="0 0 760 360">
              <path className="sketch-thin" d="M60 320 C 220 348, 540 348, 700 318" stroke="#b2a5ff" />
              <circle className="sketch" cx="150" cy="120" r="40" fill="#fff" stroke="#b2a5ff" />
              <path className="sketch-thin eyes" d="M136 112 C 141 119, 148 119, 152 112 M162 109 L165 114" stroke="#b2a5ff" />
              <path className="sketch" d="M138 152 C 134 200, 138 240, 148 282 M162 152 C 168 198, 166 240, 158 282" stroke="#b2a5ff" />
              <path className="sketch" d="M132 178 C 110 190, 100 204, 98 222 M168 176 C 192 184, 204 196, 208 210" stroke="#b2a5ff" />
              <rect className="sketch" x="196" y="186" width="130" height="74" rx="14" fill="#fff" stroke="#b2a5ff" />
              <text x="261" y="232" fontSize="34" textAnchor="middle" fontFamily="Inter" fontWeight="600" fill="#8b7cff">?</text>
              <path className="sketch-thin" d="M334 222 C 372 222, 380 200, 414 198" stroke="#38b6ff" />
              <path className="sketch-thin" d="M404 190 L416 198 L404 206" stroke="#38b6ff" />
              <rect className="sketch" x="420" y="150" width="180" height="120" rx="22" fill="#fff" stroke="#38b6ff" />
              <circle className="sketch-thin" cx="462" cy="190" r="10" stroke="#b2a5ff" />
              <rect className="sketch-thin" x="488" y="180" width="20" height="20" rx="5" stroke="#38b6ff" />
              <path className="sketch-thin" d="M528 180 L544 200 M544 180 L528 200" stroke="#f5b800" />
              <path className="sketch-thin" d="M564 190 m-9 2 l6 6 l12 -13" stroke="#00bf63" />
              <path className="sketch-thin" d="M444 230 H 576" stroke="#38b6ff" opacity="0.55" />
              <path className="sketch-thin" d="M444 246 H 540" stroke="#38b6ff" opacity="0.55" />
              <rect className="sketch-thin" x="630" y="120" width="64" height="84" rx="10" fill="#fff" transform="rotate(8 662 162)" stroke="#00bf63" />
              <path className="sketch-thin" d="M644 142 H 678 M644 158 H 670 M644 174 H 676" transform="rotate(8 662 162)" stroke="#00bf63" />
              <path className="sketch-thin" d="M604 210 C 616 206, 622 200, 626 192" stroke="#00bf63" />
              <path className="sketch-thin" d="M362 120 L362 140 M352 130 L372 130" stroke="#f5b800" />
              <path className="sketch-thin" d="M676 80 L676 96 M668 88 L684 88" stroke="#b2a5ff" />
            </svg>
          </div>
        </div>

        <div className="path-zone">
          <svg className="windy" viewBox="0 0 900 2400" preserveAspectRatio="none" aria-hidden="true">
            <path className="windy-base" d="M450 0 C 450 160, 690 200, 690 330 C 690 480, 210 480, 210 640 C 210 800, 690 800, 690 960 C 690 1120, 210 1120, 210 1280 C 210 1440, 690 1440, 690 1600 C 690 1760, 210 1760, 210 1920 C 210 2080, 450 2180, 450 2400" />
            <path ref={windyProgressRef} className="windy-progress" d="M450 0 C 450 160, 690 200, 690 330 C 690 480, 210 480, 210 640 C 210 800, 690 800, 690 960 C 690 1120, 210 1120, 210 1280 C 210 1440, 690 1440, 690 1600 C 690 1760, 210 1760, 210 1920 C 210 2080, 450 2180, 450 2400" />
            <circle ref={windyDotRef} className="windy-dot" cx="450" cy="0" r="10" />
          </svg>

          {/* 01 understand */}
          <div className="tile-row" id="understand">
            <div className="tile-side">
              <div className="tile" style={{ "--tile-color": "#b2a5ff" } as React.CSSProperties}>
                <div className="tile-bg colored" />
                <div className="tile-bg white" />
                <div className="tile-inner">
                  <span className="l-label">01 &middot; Understand</span>
                  <h3>No more wall of text.</h3>
                  <p>Ask anything. You get a visual guide that shows how the pieces fit — concepts, flows, and the parts people usually get wrong.</p>
                  <button className="btn btn-purple" type="button" onClick={() => onRunPrompt("Explain OAuth like I'm a backend dev")}>
                    <span className="lbl">Understand</span><span className="ico d">&rarr;</span><span className="ico h">&rarr;</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="path-char">
              <svg viewBox="0 0 240 220" className="float" aria-hidden="true">
                <circle className="sketch" cx="120" cy="70" r="34" fill="#fff" stroke="#b2a5ff" />
                <path className="sketch-thin eyes" d="M108 64 C 112 70, 119 70, 123 64 M133 60 L136 65" stroke="#b2a5ff" />
                <path className="sketch" d="M110 100 C 104 140, 108 168, 116 196 M130 100 C 136 138, 134 168, 126 196" stroke="#b2a5ff" />
                <path className="sketch" d="M104 118 C 84 124, 72 136, 68 152 M136 116 C 158 120, 170 130, 176 144" stroke="#b2a5ff" />
                <circle className="sketch" cx="186" cy="142" r="22" stroke="#b2a5ff" fill="#fff" />
                <path className="sketch" d="M200 158 L 216 176" stroke="#b2a5ff" />
                <path className="sketch-thin" d="M52 60 L52 76 M44 68 L60 68" stroke="#b2a5ff" />
              </svg>
            </div>
          </div>

          {/* 02 build */}
          <div className="tile-row" id="build">
            <div className="path-char">
              <svg viewBox="0 0 240 220" className="float" aria-hidden="true">
                <rect className="sketch" x="58" y="150" width="46" height="36" rx="8" fill="#fff" stroke="#38b6ff" />
                <rect className="sketch" x="86" y="108" width="46" height="36" rx="8" fill="#fff" stroke="#38b6ff" />
                <rect className="sketch" x="114" y="66" width="46" height="36" rx="8" fill="#fff" stroke="#38b6ff" />
                <circle className="sketch" cx="190" cy="64" r="28" fill="#fff" stroke="#38b6ff" />
                <path className="sketch-thin eyes" style={{ animationDelay: "1.3s" }} d="M180 58 C 184 64, 190 64, 194 58 M202 56 L205 60" stroke="#38b6ff" />
                <path className="sketch" d="M182 90 C 176 120, 178 150, 184 178 M198 90 C 204 118, 202 150, 196 178" stroke="#38b6ff" />
                <path className="sketch" d="M176 104 C 160 104, 148 96, 142 84" stroke="#38b6ff" />
                <path className="sketch-thin" d="M58 56 L58 72 M50 64 L66 64" stroke="#38b6ff" />
              </svg>
            </div>
            <div className="tile-side">
              <div className="tile" style={{ "--tile-color": "#38b6ff" } as React.CSSProperties}>
                <div className="tile-bg colored" />
                <div className="tile-bg white" />
                <div className="tile-inner">
                  <span className="l-label">02 &middot; Build</span>
                  <h3>One prompt. One path.</h3>
                  <p>The guide becomes ordered steps. Required inputs surface before you hit them — nothing assumes knowledge you don&apos;t have.</p>
                  <button className="btn btn-blue" type="button" onClick={() => onRunPrompt("Build a CI/CD pipeline for a Next.js app")}>
                    <span className="lbl">Build</span><span className="ico d">&rarr;</span><span className="ico h">&rarr;</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 03 fix */}
          <div className="tile-row" id="fix">
            <div className="tile-side">
              <div className="tile" style={{ "--tile-color": "#f5b800" } as React.CSSProperties}>
                <div className="tile-bg colored" />
                <div className="tile-bg white" />
                <div className="tile-inner">
                  <span className="l-label">03 &middot; Fix</span>
                  <h3>Find what broke. Prove it.</h3>
                  <p>A live diagnosis workspace: issue maps, causes ranked by priority, quick tests, and an evidence trail you control.</p>
                  <button className="btn btn-yellow" type="button" onClick={() => onRunPrompt("My Kubernetes pod is stuck in Pending")}>
                    <span className="lbl">Fix</span><span className="ico d">&rarr;</span><span className="ico h">&rarr;</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="path-char">
              <svg viewBox="0 0 240 220" className="float" aria-hidden="true">
                <path className="sketch" d="M120 30 L160 96 H80 Z" fill="#fff" stroke="#f5b800" />
                <path className="sketch" d="M120 54 L120 72 M120 82 L120 84" />
                <circle className="sketch" cx="78" cy="140" r="26" fill="#fff" stroke="#e0a800" />
                <path className="sketch-thin eyes" style={{ animationDelay: "2.1s" }} d="M68 134 C 72 140, 78 140, 82 134 M92 132 L95 136" stroke="#e0a800" />
                <path className="sketch" d="M72 164 C 68 182, 70 196, 74 208 M86 164 C 92 182, 90 196, 86 208" stroke="#e0a800" />
                <path className="sketch" d="M98 148 C 122 152, 138 148, 152 136" stroke="#f5b800" />
                <path className="sketch-thin" d="M170 130 C 186 124, 196 128, 200 140 C 204 152, 194 162, 180 158" stroke="#f5b800" />
                <path className="sketch-thin" d="M196 70 L196 86 M188 78 L204 78" stroke="#f5b800" />
              </svg>
            </div>
          </div>

          {/* 04 artifact */}
          <div className="tile-row" id="artifact">
            <div className="path-char">
              <svg viewBox="0 0 240 220" className="float" aria-hidden="true">
                <rect className="sketch" x="60" y="80" width="100" height="120" rx="12" fill="#fff" stroke="#00bf63" />
                <rect className="sketch-thin" x="74" y="64" width="100" height="120" rx="12" fill="#fff" stroke="#00bf63" />
                <path className="sketch-thin" d="M90 96 H 156 M90 114 H 142 M90 132 H 152 M90 150 H 134" stroke="#00bf63" opacity="0.55" />
                <circle className="sketch-thin" cx="96" cy="168" r="8" stroke="#00bf63" />
                <path className="sketch-thin" d="M92 168 L95 171 L102 162" stroke="#00bf63" />
                <circle className="sketch" cx="198" cy="80" r="24" fill="#fff" stroke="#00bf63" />
                <path className="sketch-thin" d="M188 80 L195 87 L210 70" stroke="#00bf63" />
                <path className="sketch-thin" d="M196 140 C 204 136, 210 130, 212 122" stroke="#00bf63" />
              </svg>
            </div>
            <div className="tile-side">
              <div className="tile" style={{ "--tile-color": "#00bf63" } as React.CSSProperties}>
                <div className="tile-bg colored" />
                <div className="tile-bg white" />
                <div className="tile-inner">
                  <span className="l-label">04 &middot; Artifact</span>
                  <h3>Ship the result.</h3>
                  <p>Everything becomes a usable deliverable — a checklist, a runbook, a doc your team can pick up today. Saved as a journey you can revisit.</p>
                  <button className="btn btn-green" type="button" onClick={() => onRunPrompt("Create a cloud security checklist")}>
                    <span className="lbl">Artifact</span><span className="ico d">&rarr;</span><span className="ico h">&rarr;</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* numbers */}
      <section className="numbers" id="numbers">
        <div className="numbers-head">
          <h2 className="reveal">A few numbers behind the <strong>answers</strong> we deliver</h2>
          <p className="reveal">These aren&apos;t vanity metrics. They&apos;re how Doc/ReDefined keeps every answer structured, checked, and usable from the first prompt.</p>
        </div>
        <div className="num-stack">
          <div className="num-item">
            <div className="num-card purple">
              <span className="num-icon" aria-hidden="true">
                <svg viewBox="0 0 40 40"><path className="sketch-thin" d="M20 6 L23 16 L33 16 L25 22 L28 32 L20 26 L12 32 L15 22 L7 16 L17 16 Z" stroke="#111827" /></svg>
              </span>
              <strong data-count="4">0</strong>
              <p>Four ways to redefine one prompt — understand, build, fix, artifact. The right format finds you.</p>
            </div>
          </div>
          <div className="num-item">
            <div className="num-card blue">
              <span className="num-icon" aria-hidden="true">
                <svg viewBox="0 0 40 40"><path className="sketch-thin" d="M8 20 H 28 M22 12 L 30 20 L 22 28" stroke="#111827" /></svg>
              </span>
              <strong data-count="1">0</strong>
              <p>One prompt is all it takes. No forms, no setup, no onboarding maze between you and an answer.</p>
            </div>
          </div>
          <div className="num-item">
            <div className="num-card yellow">
              <span className="num-icon" aria-hidden="true">
                <svg viewBox="0 0 40 40"><path className="sketch-thin" d="M20 6 C 12 6, 8 12, 8 18 C 8 26, 14 30, 20 34 C 26 30, 32 26, 32 18 C 32 12, 28 6, 20 6 Z" stroke="#111827" /></svg>
              </span>
              <strong data-count="12">0</strong>
              <p>Twelve quality checks run on every result before it reaches you — with the evidence attached.</p>
            </div>
          </div>
          <div className="num-item">
            <div className="num-card green">
              <span className="num-icon" aria-hidden="true">
                <svg viewBox="0 0 40 40"><path className="sketch-thin" d="M10 21 L17 28 L31 12" stroke="#111827" /></svg>
              </span>
              <strong data-count="0">0</strong>
              <p>Zero blank pages, ever. Every journey starts structured and ends as something your team can use.</p>
            </div>
          </div>
        </div>
      </section>

      {/* examples */}
      <section className="examples" id="examples">
        <div className="examples-head">
          <div>
            <span className="l-label">Try it on</span>
            <h2 className="reveal">Things people redefine</h2>
          </div>
          <a className="btn btn-dark reveal" href="#top">
            <span className="lbl">Try your own</span><span className="ico d">&#8599;</span><span className="ico h">&#8599;</span>
          </a>
        </div>
        <div className="example-grid">
          <button className="ex-card reveal" type="button" onClick={() => onRunPrompt("Explain OAuth like I'm a backend dev")}>
            <div className="ex-top"><span className="l-label">Understand</span><span className="arrow">&#8599;</span></div>
            <h3>&ldquo;Explain OAuth like I&rsquo;m a backend dev&rdquo;</h3>
            <p>Becomes a visual guide: the actors, the token flows, and where people usually get it wrong.</p>
          </button>
          <button className="ex-card reveal" type="button" onClick={() => onRunPrompt("My Kubernetes pod is stuck in Pending")}>
            <div className="ex-top"><span className="l-label">Fix</span><span className="arrow">&#8599;</span></div>
            <h3>&ldquo;My Kubernetes pod is stuck in Pending&rdquo;</h3>
            <p>Becomes a diagnosis workspace: ranked causes, quick tests, and an evidence trail.</p>
          </button>
          <button className="ex-card reveal" type="button" onClick={() => onRunPrompt("Create a cloud security checklist")}>
            <div className="ex-top"><span className="l-label">Artifact</span><span className="arrow">&#8599;</span></div>
            <h3>&ldquo;Create a cloud security checklist&rdquo;</h3>
            <p>Becomes a shippable deliverable your team can pick up today — checked and structured.</p>
          </button>
        </div>
      </section>

      {/* ticker */}
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          <TickerContent />
          <TickerContent />
        </div>
      </div>

      {/* callout */}
      <section className="callout" id="callout">
        <h2 className="reveal">Ready when<br />you are!</h2>
        <p className="callout-sub reveal">
          Whether it&rsquo;s one question or a whole system you&rsquo;re untangling, Doc/ReDefined
          makes it simple, structured, and human — from the first prompt.
        </p>
        <form className="callout-command reveal" onSubmit={handleCalloutSubmit} aria-label="Prompt command">
          <span className="prompt-sign" aria-hidden="true">&gt;_</span>
          <input
            type="text"
            value={calloutValue}
            autoComplete="off"
            placeholder="Type anything — a topic, a goal, an error"
            onChange={(event) => setCalloutValue(event.target.value)}
          />
          <button className="btn btn-dark" type="submit">
            <span className="lbl">Redefine</span><span className="ico d">&#8599;</span><span className="ico h">&#8599;</span>
          </button>
        </form>
        <div className="callout-points">
          <div>Fast, structured answers</div>
          <div>Evidence on every claim</div>
          <div>Free to start — no account</div>
        </div>
        <div className="callout-char" aria-hidden="true">
          <svg viewBox="0 0 230 260">
            <circle className="sketch" cx="115" cy="64" r="40" fill="#fff" />
            <path className="sketch-thin eyes" style={{ animationDelay: "0.8s" }} d="M100 56 C 105 64, 113 64, 118 56 M130 52 L134 58" />
            <path className="sketch-thin" d="M96 78 C 104 86, 126 86, 134 78" />
            <path className="sketch" d="M102 102 C 96 150, 100 196, 108 244 M128 102 C 136 148, 132 196, 124 244" />
            <path className="sketch" d="M96 122 C 70 112, 58 96, 56 76" />
            <path className="sketch wave" d="M134 122 C 160 112, 172 96, 174 76" />
            <path className="sketch-thin" d="M48 56 L48 72 M40 64 L56 64" stroke="#111827" />
            <path className="sketch-thin" d="M182 50 L182 66 M174 58 L190 58" stroke="#111827" />
          </svg>
        </div>
      </section>

      {/* footer */}
      <footer className="landing-footer">
        <div className="footer-row l-label">
          <div>
            <a href="#journey">How it works</a>
            <a href="#numbers">Numbers</a>
            <a href="#examples">Examples</a>
            <a href="/pricing">Pricing</a>
          </div>
          <div>
            <a href="/login">Sign in</a>
            <a href="/signup">Start free</a>
            <span>&copy; 2026 Doc/ReDefined</span>
          </div>
        </div>
        <p className="footer-mark" aria-hidden="true">ReDefined</p>
      </footer>
    </div>
  );
}
