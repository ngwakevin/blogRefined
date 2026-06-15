"use client";

import Header from "@/components/Header";
import PromptCard from "@/components/PromptCard";

export default function NewWorkspacePage() {
  return (
    <>
      <Header visible={true} />
      <PromptCard visible={true} showLanding={false} />
    </>
  );
}
