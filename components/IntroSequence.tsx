"use client";

import { useEffect, useState } from "react";
import { BRAND_TEXT, INTRO_PATH_TEXT } from "@/lib/constants";

type IntroSequenceProps = {
  onComplete: () => void;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function typeText(
  setText: (value: string | ((current: string) => string)) => void,
  text: string,
  minDelay: number,
  maxDelay: number,
  isCancelled: () => boolean
) {
  setText("");

  for (const char of text) {
    if (isCancelled()) return;

    setText((current) => `${current}${char}`);

    let delay = minDelay + Math.random() * (maxDelay - minDelay);
    if (char === " ") delay += 50;
    if (char === "/") delay += 140;

    await wait(delay);
  }
}

export default function IntroSequence({ onComplete }: IntroSequenceProps) {
  const [brandText, setBrandText] = useState("");
  const [pathText, setPathText] = useState("");
  const [brandDone, setBrandDone] = useState(false);
  const [pathDone, setPathDone] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    async function runIntro() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setBrandText(BRAND_TEXT);
        setPathText(INTRO_PATH_TEXT);
        setBrandDone(true);
        setPathDone(true);
        setExiting(true);
        await wait(120);
        if (!isCancelled()) onComplete();
        return;
      }

      await wait(600);
      await typeText(setBrandText, BRAND_TEXT, 78, 138, isCancelled);
      if (isCancelled()) return;

      await wait(650);
      setBrandDone(true);

      await typeText(setPathText, INTRO_PATH_TEXT, 58, 100, isCancelled);
      if (isCancelled()) return;

      await wait(1050);
      setPathDone(true);
      setExiting(true);

      await wait(520);
      if (!isCancelled()) onComplete();
    }

    runIntro();

    return () => {
      cancelled = true;
    };
  }, [onComplete]);

  return (
    <section
      className={`intro-scene${exiting ? " exit" : ""}`}
      aria-label="Doc/ReDefined opening"
    >
      <h1 className="intro-brand">
        <span>{brandText}</span>
        <span className={`cursor${brandDone ? " stopped" : ""}`} />
      </h1>

      <p className="intro-path">
        <span>{pathText}</span>
        <span className={`cursor path-cursor${pathDone ? " stopped" : ""}`} />
      </p>
    </section>
  );
}
