"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useProfile } from "@/components/profile/useProfile";
import { convertTemporaryJourneysToProfile } from "@/lib/journey-store";
import { createLocalProfile } from "@/lib/profile-store";

export default function SignupPage() {
  const router = useRouter();
  const { refreshProfile } = useProfile();
  const [next] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("next");
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [convertedCount, setConvertedCount] = useState<number | null>(null);
  const [convertedProjectCount, setConvertedProjectCount] = useState<number | null>(null);

  const successCopy = useMemo(() => {
    if (convertedCount === null) return "";
    const workspaceCopy = convertedCount === 1
      ? "1 temporary workspace was added to your profile"
      : `${convertedCount} temporary workspaces were added to your profile`;
    const projectCopy = convertedProjectCount
      ? convertedProjectCount === 1
        ? "1 project was migrated"
        : `${convertedProjectCount} projects were migrated`
      : "";
    return `${workspaceCopy}${projectCopy ? `, and ${projectCopy}` : ""}.`;
  }, [convertedCount, convertedProjectCount]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const profile = createLocalProfile({ name, email });
      const result = convertTemporaryJourneysToProfile(profile.id);
      refreshProfile();
      setConvertedCount(result.convertedCount);
      setConvertedProjectCount(result.convertedProjectCount);

      window.setTimeout(() => {
        if (next && next.startsWith("/") && !next.startsWith("//")) {
          router.push(next);
          return;
        }
        router.push(
          next === "save" || next === "share" || next === "journeys" ? "/workspaces" : "/"
        );
      }, 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create profile.");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        {convertedCount === null ? (
          <>
            <p className="block-label">Doc/ReDefined profile</p>
            <h1>Create your Doc/ReDefined profile</h1>
            <p>
              Save your journeys, keep your troubleshooting records, and continue from any
              device when full sync is enabled.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </label>

              {error ? <div className="auth-error">{error}</div> : null}

              <div className="auth-actions">
                <button type="submit">Create profile</button>
                <Link href="/">Continue as guest</Link>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="block-label">Doc/ReDefined profile</p>
            <h1>Profile created</h1>
            <p>{successCopy}</p>
            <div className="auth-actions">
              <Link href="/">Go to dashboard</Link>
              <Link href="/workspaces">View my workspaces</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
