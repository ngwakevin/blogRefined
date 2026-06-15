"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getLocalProfile, isValidEmail } from "@/lib/profile-store";

export default function LoginPage() {
  const router = useRouter();
  const [next] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("next");
  });
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    const profile = getLocalProfile();
    if (profile?.email.toLowerCase() === normalizedEmail) {
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      return;
    }

    setError("No local MVP profile found for this email. Create a profile to save your records.");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="block-label">Doc/ReDefined profile</p>
        <h1>Sign in to Doc/ReDefined</h1>
        <p>Use the email from your MVP profile on this device.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
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
            <button type="submit">Sign in</button>
            <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
              Create profile
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
